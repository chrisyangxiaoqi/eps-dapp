/**
 * lib/chain/EVMAdapter.ts
 * EVM chain adapter for EPS — uses viem for all on-chain interactions.
 * Implements ChainAdapter for all EVM_CHAINS (Ethereum, Polygon, Base, Arbitrum, Optimism).
 * SERVER-SIDE ONLY — never import in "use client" components.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  parseEther,
  type PublicClient,
  type WalletClient,
  type Chain,
} from 'viem';
import {
  mainnet,
  sepolia,
  polygon,
  polygonAmoy,
  base,
  baseSepolia,
  arbitrum,
  arbitrumSepolia,
  optimism,
  optimismSepolia,
} from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import {
  ChainId,
  ChainError,
  ChainErrorCode,
  type ChainAdapter,
  type ServiceRecord,
  type BroadcastResult,
  type ConfirmationResult,
  type AddressValidation,
} from './ChainAdapter';

// ─── Chain config map ─────────────────────────────────────────────────────────

interface ChainConfig {
  viemChain: Chain;
  rpcEnvVar: string;
  fallbackRpc: string;
  isMainnet: boolean;
}

const CHAIN_CONFIG: Record<string, ChainConfig> = {
  [ChainId.ETH_MAINNET]:  { viemChain: mainnet,          rpcEnvVar: 'EVM_RPC_ETH_MAINNET',   fallbackRpc: 'https://eth.llamarpc.com',                 isMainnet: true  },
  [ChainId.ETH_SEPOLIA]:  { viemChain: sepolia,           rpcEnvVar: 'EVM_RPC_ETH_SEPOLIA',   fallbackRpc: 'https://rpc.sepolia.org',                  isMainnet: false },
  [ChainId.POLYGON]:      { viemChain: polygon,           rpcEnvVar: 'EVM_RPC_POLYGON',       fallbackRpc: 'https://polygon-rpc.com',                  isMainnet: true  },
  [ChainId.POLYGON_AMOY]: { viemChain: polygonAmoy,       rpcEnvVar: 'EVM_RPC_POLYGON_AMOY',  fallbackRpc: 'https://rpc-amoy.polygon.technology',      isMainnet: false },
  [ChainId.BASE]:         { viemChain: base,              rpcEnvVar: 'EVM_RPC_BASE',          fallbackRpc: 'https://mainnet.base.org',                 isMainnet: true  },
  [ChainId.BASE_SEPOLIA]: { viemChain: baseSepolia,       rpcEnvVar: 'EVM_RPC_BASE_SEPOLIA',  fallbackRpc: 'https://sepolia.base.org',                 isMainnet: false },
  [ChainId.ARB_ONE]:      { viemChain: arbitrum,          rpcEnvVar: 'EVM_RPC_ARB_ONE',       fallbackRpc: 'https://arb1.arbitrum.io/rpc',             isMainnet: true  },
  [ChainId.ARB_SEPOLIA]:  { viemChain: arbitrumSepolia,   rpcEnvVar: 'EVM_RPC_ARB_SEPOLIA',   fallbackRpc: 'https://sepolia-rollup.arbitrum.io/rpc',   isMainnet: false },
  [ChainId.OP_MAINNET]:   { viemChain: optimism,          rpcEnvVar: 'EVM_RPC_OP_MAINNET',    fallbackRpc: 'https://mainnet.optimism.io',              isMainnet: true  },
  [ChainId.OP_SEPOLIA]:   { viemChain: optimismSepolia,   rpcEnvVar: 'EVM_RPC_OP_SEPOLIA',    fallbackRpc: 'https://sepolia.optimism.io',              isMainnet: false },
};

// ─── Minimal EPS Service Registry ABI (for on-chain memo storage) ────────────

/**
 * EPS uses a minimal on-chain record pattern: send a 0-value tx to ourselves
 * with the ServiceRecord JSON encoded as calldata. This is the cheapest way to
 * anchor an immutable memo without deploying a contract.
 *
 * For a production deployment, replace with a real EPS registry contract:
 *   function recordDelivery(string calldata memo) external { emit Delivered(msg.sender, memo); }
 */
const EPS_REGISTRY_ABI = [
  {
    name: 'recordDelivery',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs:  [{ name: 'memo', type: 'string' }],
    outputs: [],
  },
] as const;

// ─── EVMAdapter ───────────────────────────────────────────────────────────────

export class EVMAdapter implements ChainAdapter {
  readonly chainId: ChainId;
  private readonly config: ChainConfig;
  private publicClient: PublicClient | null = null;
  private walletClient: WalletClient | null = null;

  constructor(chainId: ChainId) {
    this.chainId = chainId;
    const cfg = CHAIN_CONFIG[chainId];
    if (!cfg) {
      throw new ChainError(
        ChainErrorCode.NOT_IMPLEMENTED,
        `EVMAdapter: no config for chainId "${chainId}"`,
      );
    }
    this.config = cfg;
  }

  /** Lazily build the viem public client. */
  private getPublicClient(): PublicClient {
    if (!this.publicClient) {
      const rpcUrl = process.env[this.config.rpcEnvVar] ?? this.config.fallbackRpc;
      this.publicClient = createPublicClient({
        chain:     this.config.viemChain,
        transport: http(rpcUrl),
      });
    }
    return this.publicClient;
  }

  /** Lazily build the viem wallet client from the app private key. */
  private getWalletClient(): WalletClient {
    if (!this.walletClient) {
      const privateKey = process.env.EVM_APP_WALLET_PRIVATE_KEY as `0x${string}` | undefined;
      if (!privateKey) {
        throw new ChainError(
          ChainErrorCode.BROADCAST_FAILED,
          'EVM_APP_WALLET_PRIVATE_KEY is not set',
        );
      }
      const account = privateKeyToAccount(privateKey);
      const rpcUrl  = process.env[this.config.rpcEnvVar] ?? this.config.fallbackRpc;
      this.walletClient = createWalletClient({
        account,
        chain:     this.config.viemChain,
        transport: http(rpcUrl),
      });
    }
    return this.walletClient;
  }

  validateAddress(address: string): AddressValidation {
    const isEvm = /^0x[0-9a-fA-F]{40}$/.test(address);
    if (isEvm) return { valid: true };
    return { valid: false, reason: `"${address}" is not a valid EVM address (expected 0x + 40 hex chars)` };
  }

  async broadcast(record: ServiceRecord): Promise<BroadcastResult> {
    if (this.config.isMainnet && process.env.ALLOW_EVM_MAINNET !== 'true') {
      throw new ChainError(
        ChainErrorCode.MAINNET_FORBIDDEN,
        `EVMAdapter: mainnet broadcast forbidden for chainId "${this.chainId}". ` +
        `Set ALLOW_EVM_MAINNET=true to override.`,
      );
    }

    const memo = this.buildMemo(record);
    const wc   = this.getWalletClient();

    try {
      // Check if a registry contract is configured; if not, send a self-transfer with calldata.
      const registryAddress = process.env.EVM_REGISTRY_ADDRESS as `0x${string}` | undefined;

      let txHash: `0x${string}`;

      if (registryAddress) {
        // Call the on-chain EPS registry contract.
        const data = encodeFunctionData({
          abi:          EPS_REGISTRY_ABI,
          functionName: 'recordDelivery',
          args:         [memo],
        });
        txHash = await wc.sendTransaction({
          to:    registryAddress,
          data,
          value: 0n,
        } as Parameters<typeof wc.sendTransaction>[0]);
      } else {
        // No contract deployed yet — send 0-value tx to self with memo as data.
        // This anchors the memo immutably on-chain at minimal cost.
        const account = privateKeyToAccount(
          process.env.EVM_APP_WALLET_PRIVATE_KEY as `0x${string}`,
        );
        const memoHex = ('0x' + Buffer.from(memo, 'utf8').toString('hex')) as `0x${string}`;
        txHash = await wc.sendTransaction({
          to:    account.address,
          data:  memoHex,
          value: parseEther('0'),
        } as Parameters<typeof wc.sendTransaction>[0]);
      }

      return { txId: txHash, chainId: this.chainId };
    } catch (err) {
      throw new ChainError(
        ChainErrorCode.BROADCAST_FAILED,
        `EVMAdapter broadcast failed on ${this.chainId}: ${String(err)}`,
        err,
      );
    }
  }

  async confirm(txId: string): Promise<ConfirmationResult> {
    const pc = this.getPublicClient();
    try {
      const receipt = await pc.waitForTransactionReceipt({
        hash:               txId as `0x${string}`,
        confirmations:      1,
        pollingInterval:    4_000,
        retryCount:         40,
      });

      const block = await pc.getBlock({ blockHash: receipt.blockHash });

      return {
        txId,
        chainId:        this.chainId,
        blockNumber:    Number(receipt.blockNumber),
        blockTimestamp: block.timestamp ? Number(block.timestamp) : null,
        confirmedMemo:  await this.getMemo(txId),
      };
    } catch (err) {
      throw new ChainError(
        ChainErrorCode.CONFIRMATION_FAILED,
        `EVMAdapter confirm failed for ${txId} on ${this.chainId}: ${String(err)}`,
        err,
      );
    }
  }

  async getMemo(txId: string): Promise<string | null> {
    const pc = this.getPublicClient();
    try {
      const tx = await pc.getTransaction({ hash: txId as `0x${string}` });
      if (!tx?.input || tx.input === '0x') return null;
      // Decode hex calldata back to UTF-8
      const hex = tx.input.startsWith('0x') ? tx.input.slice(2) : tx.input;
      return Buffer.from(hex, 'hex').toString('utf8');
    } catch {
      return null;
    }
  }

  /** Build the canonical JSON memo string for a ServiceRecord. */
  private buildMemo(record: ServiceRecord): string {
    return JSON.stringify({ eps: 'v1', ...record });
  }
}
