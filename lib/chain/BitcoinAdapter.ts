/**
 * lib/chain/BitcoinAdapter.ts
 * Bitcoin adapter stub for EPS — ETHGlobal NYC 2026.
 *
 * Bitcoin uses OP_RETURN to carry an immutable memo (max 80 bytes).
 * The ServiceRecord must be compressed to hash + id before encoding
 * (full JSON exceeds the 80-byte limit).
 *
 * Future implementation: use @scure/btc-signer to build a P2WPKH tx
 * with an OP_RETURN output carrying SHA256(deliveryId + documentHash).
 *
 * STATUS: NOT_IMPLEMENTED — stub throws ChainError on all methods.
 */
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

export class BitcoinAdapter implements ChainAdapter {
  readonly chainId: ChainId;

  constructor(chainId: ChainId) {
    if (
      chainId !== ChainId.BITCOIN_MAINNET &&
      chainId !== ChainId.BITCOIN_TESTNET &&
      chainId !== ChainId.BITCOIN_SIGNET
    ) {
      throw new ChainError(
        ChainErrorCode.NOT_IMPLEMENTED,
        `BitcoinAdapter: invalid chainId "${chainId}"`,
      );
    }
    this.chainId = chainId;
  }

  validateAddress(address: string): AddressValidation {
    // Basic bech32 / legacy pattern check — full validation requires @scure/btc-signer.
    const isBech32   = /^(bc1|tb1|sb1)[a-z0-9]{6,87}$/i.test(address);
    const isLegacy   = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address);
    const isTestnet  = /^[mn2][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address);
    const valid = isBech32 || isLegacy || isTestnet;
    return valid
      ? { valid: true }
      : { valid: false, reason: `"${address}" does not match any known Bitcoin address format` };
  }

  async broadcast(_record: ServiceRecord): Promise<BroadcastResult> {
    throw new ChainError(
      ChainErrorCode.NOT_IMPLEMENTED,
      'BitcoinAdapter.broadcast() is not yet implemented. ' +
      'Future: build P2WPKH tx with OP_RETURN(sha256(deliveryId+documentHash)) using @scure/btc-signer.',
    );
  }

  async confirm(_txId: string): Promise<ConfirmationResult> {
    throw new ChainError(
      ChainErrorCode.NOT_IMPLEMENTED,
      'BitcoinAdapter.confirm() is not yet implemented.',
    );
  }

  async getMemo(_txId: string): Promise<string | null> {
    throw new ChainError(
      ChainErrorCode.NOT_IMPLEMENTED,
      'BitcoinAdapter.getMemo() is not yet implemented.',
    );
  }
}
