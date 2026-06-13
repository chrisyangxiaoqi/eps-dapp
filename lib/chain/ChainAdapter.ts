/**
 * lib/chain/ChainAdapter.ts
 * Multi-chain adapter abstraction for EPS — ETHGlobal NYC 2026.
 *
 * Extends the existing Solana ChainAdapter (lib/chain/types.ts) with EVM and
 * Bitcoin chain support. The existing Solana files (solana.ts, tx-builder.ts,
 * types.ts) are NOT modified.
 *
 * Bitcoin note: OP_RETURN carries the memo (max 80 bytes — ServiceRecord must
 * be compressed to hash + id). BitcoinAdapter uses @scure/btc-signer
 * (no native memo field; OP_RETURN is the EVM calldata equivalent).
 */

// ─── Service Record ──────────────────────────────────────────────────────────

/** The structured data anchored on-chain for each service delivery. */
export interface ServiceRecord {
  /** Unique delivery ID (UUID). */
  deliveryId:   string;
  /** SHA-256 (hex) of the served document. */
  documentHash: string;
  /** Human-readable case reference (e.g. "2026-NYC-0042"). */
  caseRef:      string;
  /** On-chain address / identifier of the served party. */
  servedTo:     string;
  /** On-chain address / ENS name / agent ID of the serving agent. */
  servedBy:     string;
  /** ISO-8601 UTC timestamp of service. */
  servedAt:     string;
}

// ─── Broadcast / Confirmation results ────────────────────────────────────────

export interface BroadcastResult {
  /** The chain-specific transaction identifier (signature, hash, txId…). */
  txId:    string;
  /** Which chain the tx was broadcast on. */
  chainId: ChainId;
}

export interface ConfirmationResult {
  txId:           string;
  chainId:        ChainId;
  /** Block / slot number the tx was finalized in. */
  blockNumber:    number;
  /** Unix timestamp (seconds) of the block, or null if unavailable. */
  blockTimestamp: number | null;
  /** Memo / calldata / OP_RETURN payload that was confirmed on-chain. */
  confirmedMemo:  string | null;
}

export interface AddressValidation {
  valid:   boolean;
  reason?: string;
}

// ─── Chain IDs ───────────────────────────────────────────────────────────────

export enum ChainId {
  // Solana (handled by existing SolanaAdapter in lib/chain/solana.ts)
  SOLANA_MAINNET = 'solana-mainnet',
  SOLANA_DEVNET  = 'solana-devnet',
  SOLANA_TESTNET = 'solana-testnet',

  // EVM — handled by EVMAdapter
  ETH_MAINNET  = 'eip155:1',
  ETH_SEPOLIA  = 'eip155:11155111',
  POLYGON      = 'eip155:137',
  POLYGON_AMOY = 'eip155:80002',
  BASE         = 'eip155:8453',
  BASE_SEPOLIA = 'eip155:84532',
  ARB_ONE      = 'eip155:42161',
  ARB_SEPOLIA  = 'eip155:421614',
  OP_MAINNET   = 'eip155:10',
  OP_SEPOLIA   = 'eip155:11155420',

  // Bitcoin
  // OP_RETURN carries the memo (max 80 bytes — ServiceRecord must be
  // compressed to hash + id before encoding).
  BITCOIN_MAINNET = 'btc-mainnet',
  BITCOIN_TESTNET = 'btc-testnet',
  BITCOIN_SIGNET  = 'btc-signet',
}

/** Set of EVM chain IDs (use to route to EVMAdapter). */
export const EVM_CHAINS = new Set<ChainId>([
  ChainId.ETH_MAINNET,
  ChainId.ETH_SEPOLIA,
  ChainId.POLYGON,
  ChainId.POLYGON_AMOY,
  ChainId.BASE,
  ChainId.BASE_SEPOLIA,
  ChainId.ARB_ONE,
  ChainId.ARB_SEPOLIA,
  ChainId.OP_MAINNET,
  ChainId.OP_SEPOLIA,
]);

/** Set of Bitcoin chain IDs (use to route to BitcoinAdapter). */
export const BITCOIN_CHAINS = new Set<ChainId>([
  ChainId.BITCOIN_MAINNET,
  ChainId.BITCOIN_TESTNET,
  ChainId.BITCOIN_SIGNET,
]);

// ─── ChainAdapter interface ───────────────────────────────────────────────────

/**
 * Common interface every chain adapter must implement.
 * The Solana adapter (lib/chain/solana.ts) satisfies a subset of this interface;
 * EVMAdapter and BitcoinAdapter implement it fully.
 */
export interface ChainAdapter {
  /** The chain this adapter is configured for. */
  readonly chainId: ChainId;

  /**
   * Validate a chain-native address without making an RPC call.
   * Returns `{ valid: true }` or `{ valid: false, reason: '...' }`.
   */
  validateAddress(address: string): AddressValidation;

  /**
   * Broadcast a service record on-chain and return the tx identifier
   * IMMEDIATELY, without waiting for confirmation. Persist the returned txId
   * BEFORE calling confirm() (hard rule #4).
   */
  broadcast(record: ServiceRecord): Promise<BroadcastResult>;

  /**
   * Wait for a previously-broadcast tx to reach finality and return proof.
   * Safe to call on a txId from a prior process (resume semantics).
   */
  confirm(txId: string): Promise<ConfirmationResult>;

  /**
   * Re-read the on-chain memo / calldata for a finalized tx. Used for
   * post-confirm verification (T-305 equivalent for EVM/BTC).
   */
  getMemo(txId: string): Promise<string | null>;
}

// ─── ChainError ───────────────────────────────────────────────────────────────

export enum ChainErrorCode {
  NOT_IMPLEMENTED    = 'NOT_IMPLEMENTED',
  INVALID_ADDRESS    = 'INVALID_ADDRESS',
  BROADCAST_FAILED   = 'BROADCAST_FAILED',
  CONFIRMATION_FAILED = 'CONFIRMATION_FAILED',
  MAINNET_FORBIDDEN  = 'MAINNET_FORBIDDEN',
  MEMO_MISMATCH      = 'MEMO_MISMATCH',
  UNKNOWN            = 'UNKNOWN',
}

export class ChainError extends Error {
  constructor(
    public readonly code: ChainErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ChainError';
  }
}

// ─── Adapter factory ─────────────────────────────────────────────────────────

/**
 * Return the correct ChainAdapter for the given chainId.
 * Lazy-imports each adapter to avoid loading all SDKs at startup.
 */
export async function getAdapter(chainId: ChainId): Promise<ChainAdapter> {
  // Bitcoin: OP_RETURN carries the memo (max 80 bytes — ServiceRecord must be
  // compressed to hash + id). BitcoinAdapter uses @scure/btc-signer
  // (no native memo field; OP_RETURN is the EVM calldata equivalent).
  if (
    chainId === ChainId.BITCOIN_MAINNET ||
    chainId === ChainId.BITCOIN_TESTNET ||
    chainId === ChainId.BITCOIN_SIGNET
  ) {
    const { BitcoinAdapter } = await import('./BitcoinAdapter');
    return new BitcoinAdapter(chainId);
  }

  if (EVM_CHAINS.has(chainId)) {
    const { EVMAdapter } = await import('./EVMAdapter');
    return new EVMAdapter(chainId);
  }

  throw new ChainError(
    ChainErrorCode.NOT_IMPLEMENTED,
    `No adapter registered for chainId "${chainId}". ` +
    `For Solana use getSolanaAdapter() from lib/chain/solana.ts.`,
  );
}
