import { getRentExemptMinimum, getSolanaAdapter } from "@/lib/chain";
import type { ClaimableRequest, WorkerDb } from "@/worker/index";

/**
 * Default delivery for one claimed service request (T-303).
 *
 * Sends the v1 on-chain anchor (rent-exempt transfer + Memo) through the
 * {@link ChainAdapter} seam, then stamps the proof fields and advances the row
 * to CONFIRMED. The transfer amount is the cluster's rent-exempt minimum so the
 * recipient is left with a durable, non-purgeable balance.
 *
 * Scope: T-303 is the loop + idempotent claim. The hardened delivery contract
 * lands next:
 *   - T-304 persists `txSignature` BEFORE confirming (hard rule #4) so a retry
 *     re-confirms instead of re-sending, and stores slot/blockTime.
 *   - T-305 re-reads the finalized tx to verify it, gating CONFIRMED vs FAILED.
 *   - The memo's `sha256:` field (T-302 format) is sourced from the stored
 *     document metadata here once T-304 threads it through; for now the memo
 *     carries the notice token and service id.
 *
 * No caption or document bytes are logged or sent off-box (hard rule #3).
 */
export async function processServiceRequest(
  row: ClaimableRequest,
  db: WorkerDb,
): Promise<void> {
  const adapter = getSolanaAdapter();
  const lamports = await getRentExemptMinimum();

  const result = await adapter.deliver({
    recipientWallet: row.recipientWallet,
    lamports,
    memoParts: [`notice:${row.noticeToken ?? ""}`, `svc:${row.id}`],
  });

  await db.serviceRequest.update({
    where: { id: row.id },
    data: {
      status: "CONFIRMED",
      txSignature: result.signature,
      slot: BigInt(result.slot),
      blockTime:
        result.blockTime === null ? null : new Date(result.blockTime * 1000),
    },
  });
}
