/**
 * Chain delivery seam (T-301). Import the {@link ChainAdapter} interface and the
 * Solana factory from here rather than reaching into the concrete module.
 */
export type {
  ChainAdapter,
  ChainDeliveryResult,
  DeliverParams,
} from "@/lib/chain/types";
export { SolanaAdapter, getSolanaAdapter } from "@/lib/chain/solana";
