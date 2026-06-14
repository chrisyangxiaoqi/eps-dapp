// scripts/set-ens-text-records.ts — publish ENSIP-25 / ENSIP-26 agent text records.
//
// Writes the EPS agent's identity + credential text records onto the ENS name
// `youhavebeenserved.eth` so the on-chain ENS record advertises this wallet as an
// AI agent (ENSIP-25 agent registry) with verifiable metadata (ENSIP-26 text
// records). `/api/ens/agent` reads these back and reports ENSIP-25/26 compliance.
//
// Requires (never hard-coded — read from env, see CLAUDE.md hard rule #1):
//   EVM_APP_WALLET_PRIVATE_KEY  — controller/owner of the ENS name (0x… 64 hex)
//   EVM_RPC_ETH_MAINNET         — Ethereum mainnet RPC endpoint
//
// Run:
//   pnpm tsx scripts/set-ens-text-records.ts
//
// ENS itself lives on Ethereum mainnet; the Solana mainnet ban (hard rule #2)
// does not apply here. This writes real mainnet transactions — gas is spent.

// Load .env.local via Node's built-in env-file loader (no dotenv dependency).
try { process.loadEnvFile('.env.local'); } catch { /* .env.local is optional */ }

import { createPublicClient, createWalletClient, http, namehash } from 'viem';
import { mainnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const ENS_NAME = process.env.ENS_AGENT_NAME ?? 'youhavebeenserved.eth';

// ENS registry (mainnet) — resolves a name's node to its resolver contract.
const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' as const;
const REGISTRY_ABI = [
  {
    name: 'resolver',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;

// Public resolver — setText(node, key, value) writes a single ENSIP-26 text record.
const RESOLVER_ABI = [
  {
    name: 'setText',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'key', type: 'string' },
      { name: 'value', type: 'string' },
    ],
    outputs: [],
  },
] as const;

// The records to publish. `agent.*` keys are the ENSIP-25 agent-registry fields;
// `description` / `url` are standard ENSIP-26 text records.
const TEXT_RECORDS: Record<string, string> = {
  description:
    'EPS – AI-powered legal process server with Hedera HCS proof and ENS identity',
  url: 'https://eps-dapp.vercel.app',
  'agent.category': 'legal',
  'agent.version': '1.0.0',
  'agent.did': `did:ens:${ENS_NAME}`,
  'agent.endpoint': 'https://eps-dapp.vercel.app/api/agent',
};

async function main() {
  const pk = process.env.EVM_APP_WALLET_PRIVATE_KEY;
  const rpc = process.env.EVM_RPC_ETH_MAINNET;
  if (!pk) throw new Error('EVM_APP_WALLET_PRIVATE_KEY is not set.');
  if (!rpc) throw new Error('EVM_RPC_ETH_MAINNET is not set.');

  const account = privateKeyToAccount(pk.startsWith('0x') ? (pk as `0x${string}`) : (`0x${pk}` as `0x${string}`));
  const transport = http(rpc);
  const publicClient = createPublicClient({ chain: mainnet, transport });
  const walletClient = createWalletClient({ account, chain: mainnet, transport });

  const node = namehash(ENS_NAME);
  console.log(`Setting ENS text records on ${ENS_NAME}`);
  console.log(`  node:     ${node}`);
  console.log(`  account:  ${account.address}`);

  const resolver = (await publicClient.readContract({
    address: ENS_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: 'resolver',
    args: [node],
  })) as `0x${string}`;

  if (!resolver || /^0x0+$/.test(resolver)) {
    throw new Error(`No resolver set for ${ENS_NAME}. Set a public resolver first.`);
  }
  console.log(`  resolver: ${resolver}\n`);

  for (const [key, value] of Object.entries(TEXT_RECORDS)) {
    process.stdout.write(`  setText ${key.padEnd(15)} = "${value}" … `);
    const hash = await walletClient.writeContract({
      address: resolver,
      abi: RESOLVER_ABI,
      functionName: 'setText',
      args: [node, key, value],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(receipt.status === 'success' ? `✓ ${hash}` : `✗ reverted ${hash}`);
  }

  console.log('\nDone. Verify with: curl https://eps-dapp.vercel.app/api/ens/agent');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
