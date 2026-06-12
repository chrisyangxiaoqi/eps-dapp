import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the network surface of web3.js so the unit suite never opens a socket:
// `Connection` becomes an inert handle and `sendAndConfirmTransaction` is a spy.
// Everything else (Keypair, PublicKey, SystemProgram, Transaction) is the real
// implementation so transaction-building logic is exercised for real.
const { sendAndConfirmTransaction, getTransaction } = vi.hoisted(() => ({
  sendAndConfirmTransaction: vi.fn(async (...args: unknown[]) => {
    void args;
    return "sig_111";
  }),
  getTransaction: vi.fn(async () => ({ slot: 4242, blockTime: 1_700_000_000 })),
}));

vi.mock("@solana/web3.js", async (importActual) => {
  const actual = await importActual<typeof import("@solana/web3.js")>();
  return {
    ...actual,
    Connection: class {
      getTransaction = getTransaction;
    },
    sendAndConfirmTransaction,
  };
});

import { SolanaAdapter, getSolanaAdapter } from "@/lib/chain/solana";

const DEVNET = "https://api.devnet.solana.com";

describe("SolanaAdapter.assertNotMainnet (hard rule #2)", () => {
  it("throws when constructed with the public mainnet-beta RPC", () => {
    expect(
      () => new SolanaAdapter("https://api.mainnet-beta.solana.com", Keypair.generate()),
    ).toThrow("Mainnet RPC forbidden");
  });

  it.each([
    "https://api.mainnet-beta.solana.com",
    "https://MAINNET.example.com",
    "https://my-private-mainnet-rpc.example.com/abc",
  ])("rejects any mainnet URL: %s", (url) => {
    expect(() => new SolanaAdapter(url, Keypair.generate())).toThrow("Mainnet RPC forbidden");
  });

  it("does NOT throw for devnet / localhost endpoints", () => {
    expect(() => new SolanaAdapter(DEVNET, Keypair.generate())).not.toThrow();
    expect(() => new SolanaAdapter("http://localhost:8899", Keypair.generate())).not.toThrow();
  });
});

describe("SolanaAdapter.deliver", () => {
  beforeEach(() => {
    sendAndConfirmTransaction.mockClear();
    getTransaction.mockClear();
  });

  it("sends a transfer+memo tx and returns signature/slot/blockTime", async () => {
    const adapter = new SolanaAdapter(DEVNET, Keypair.generate());
    const recipient = Keypair.generate().publicKey.toBase58();

    const result = await adapter.deliver({
      recipientWallet: recipient,
      lamports: 890_880n,
      memoParts: ["sha256:abc", "notice:https://x.test/n/1", "svc:rec_1"],
    });

    expect(sendAndConfirmTransaction).toHaveBeenCalledTimes(1);
    // The built tx carries exactly two instructions: transfer + memo.
    const tx = sendAndConfirmTransaction.mock.calls[0][1] as unknown as {
      instructions: unknown[];
    };
    expect(tx.instructions).toHaveLength(2);
    expect(result).toEqual({ signature: "sig_111", slot: 4242, blockTime: 1_700_000_000 });
  });

  it("rejects an off-curve (PDA-style) recipient before sending", async () => {
    const adapter = new SolanaAdapter(DEVNET, Keypair.generate());
    await expect(
      adapter.deliver({
        recipientWallet: "not-a-valid-address!!!",
        lamports: 1n,
        memoParts: ["x"],
      }),
    ).rejects.toThrow();
    expect(sendAndConfirmTransaction).not.toHaveBeenCalled();
  });
});

describe("getSolanaAdapter (env factory)", () => {
  const ORIGINAL = { ...process.env };
  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it("throws when SOLANA_RPC_URL is unset", () => {
    delete process.env.SOLANA_RPC_URL;
    process.env.SOLANA_SIGNER_KEYPAIR = "x";
    expect(() => getSolanaAdapter()).toThrow("SOLANA_RPC_URL is not set");
  });

  it("throws when SOLANA_SIGNER_KEYPAIR is unset", () => {
    process.env.SOLANA_RPC_URL = DEVNET;
    delete process.env.SOLANA_SIGNER_KEYPAIR;
    expect(() => getSolanaAdapter()).toThrow("SOLANA_SIGNER_KEYPAIR is not set");
  });

  it("refuses a mainnet RPC even via the factory", () => {
    process.env.SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";
    process.env.SOLANA_SIGNER_KEYPAIR = bs58.encode(Keypair.generate().secretKey);
    expect(() => getSolanaAdapter()).toThrow("Mainnet RPC forbidden");
  });

  it("builds an adapter from valid devnet env", () => {
    process.env.SOLANA_RPC_URL = DEVNET;
    process.env.SOLANA_SIGNER_KEYPAIR = bs58.encode(Keypair.generate().secretKey);
    expect(getSolanaAdapter()).toBeInstanceOf(SolanaAdapter);
  });
});
