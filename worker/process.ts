import { buildServiceMemo, getRentExemptMinimum, getSolanaAdapter } from "@/lib/chain";
import type { ClaimableRequest, WorkerDb } from "@/worker/index";
import { recordOnHedera } from "@/lib/hedera/HederaService";

/**
 * Thrown when the finalized on-chain memo does not match the memo we intended to
 * send (T-305). A terminal failure: the worker parks the row FAILED and restores
 * quota (T-306). The message carries only ids/signature — never document bytes.
 */
export class MemoMismatchError extends Error {
  constructor(serviceRequestId: string, signature: string) {
    super(
      `On-chain memo for service request ${serviceRequestId} (sig ${signature}) ` +
        `does not match the expected delivery memo.`,
    );
    this.name = "MemoMismatchError";
  }
}

/**
 * Default delivery for one claimed service request (T-303 loop, T-304 contract).
 *
 * Persist-signature-before-confirm (CLAUDE.md hard rule #4): the chain delivery
 * is split into two halves so the signature is durable before we wait on
 * finalization.
 *
 *   1. If the claimed row has NO `txSignature` yet, this is a fresh attempt:
 *      send the rent-exempt transfer + Memo through the {@link ChainAdapter}
 *      seam, then IMMEDIATELY persist `txSignature` (the row stays IN_PROGRESS).
 *   2. Confirm at `finalized`, then read back the authoritative slot/blockTime
 *      and advance the row to CONFIRMED.
 *
 * Resume semantics (acceptance: "retry re-confirms, never re-sends"): if a
 * worker crashes after step 1 but before CONFIRMED, the row is left IN_PROGRESS
 * with `txSignature` set. The next `worker:once` re-claims it (single-worker
 * model resumes IN_PROGRESS rows) and, seeing the signature already on record,
 * SKIPS the send and goes straight to confirm — so a request is broadcast at
 * most once even across a crash/restart.
 *
 * The transfer amount is the cluster's rent-exempt minimum, so the recipient is
 * left with a durable, non-purgeable balance.
 *
 * Post-confirm re-read verification (T-305): the memo we send is the canonical
 * `${sha256}|${noticeToken}|${serviceId}` ({@link buildServiceMemo}). After
 * finalization we re-read the transaction's memo from the chain and compare it
 * to that expected value; on ANY mismatch an alert is logged and this throws a
 * {@link MemoMismatchError}, so a delivery whose on-chain proof does not match
 * what we intended is never reported as CONFIRMED. The throw is a terminal
 * failure: the worker's failure handler (T-306) parks the row FAILED, restores
 * the consumed quota unit, and audits it. No caption or document bytes are
 * logged or sent off-box (hard rule #3) — the memo carries only a hash and ids.
 */
export async function processServiceRequest(
  row: ClaimableRequest,
  db: WorkerDb,
): Promise<void> {
  const adapter = getSolanaAdapter();

  // The single source of truth for this delivery's memo — used both to send and
  // to verify on the re-read, so the two can never drift apart.
  const expectedMemo = buildServiceMemo({
    sha256: row.documentSha256 ?? "",
    noticeToken: row.noticeToken ?? "",
    serviceId: row.id,
  });

  let signature = row.txSignature;

  if (signature === null) {
    // Fresh attempt: build + send, then persist the signature BEFORE awaiting
    // confirmation (hard rule #4). The row stays IN_PROGRESS.
    const lamports = await getRentExemptMinimum();
    signature = await adapter.send({
      recipientWallet: row.recipientWallet,
      lamports,
      memoParts: [expectedMemo],
    });

    await db.serviceRequest.update({
      where: { id: row.id },
      data: { txSignature: signature },
    });
  }

  // Confirm at `finalized` (re-confirms on resume — never re-sends), then stamp
  // the authoritative slot/blockTime.
  const { slot, blockTime } = await adapter.confirm(signature);

  // Post-confirm re-read verification (T-305): re-read the on-chain memo and
  // compare it to what we intended to send. A mismatch means the finalized proof
  // does not match this request — alert and throw a terminal failure rather than
  // claiming a verified delivery. The worker's failure handler (T-306) then parks
  // the row FAILED, restores the consumed quota unit, and audits the transition.
  const onChainMemo = await adapter.getMemo(signature);
  if (onChainMemo !== expectedMemo) {
    console.error(
      `[worker] memo verification FAILED for ${row.id} (sig ${signature}): ` +
        `expected "${expectedMemo}" but on-chain memo is "${onChainMemo ?? "<none>"}"`,
    );
    throw new MemoMismatchError(row.id, signature);
  }

  await db.serviceRequest.update({
    where: { id: row.id },
    data: {
      status: "CONFIRMED",
      slot: BigInt(slot),
      blockTime: blockTime === null ? null : new Date(blockTime * 1000),
    },
  });

  // Non-blocking Hedera recording: HCS timestamp + HTS NFT receipt (Phase 3).
  // Failures are logged but never throw — they must not block delivery confirmation.
  recordOnHedera({
    deliveryId:   row.id,
    documentHash: row.documentSha256 ?? "",
    caseRef:      row.caseCaption,
    servedTo:     row.recipientWallet,
    servedBy:     row.agentENSName ?? process.env.EVM_APP_WALLET_ADDRESS ?? "eps-agent",
  }).then(async (result) => {
    const updates: Record<string, unknown> = {};
    if (result.hcs) {
      updates.hcsTopicId        = result.hcs.topicId;
      updates.hcsSequenceNumber = result.hcs.sequenceNumber;
      updates.hcsConsensusTime  = result.hcs.consensusTimestamp;
      updates.hcsTxId           = result.hcs.transactionId;
      updates.hcsMirrorUrl      = result.hcs.mirrorNodeUrl;
    }
    if (result.hts) {
      updates.htsTokenId      = result.hts.tokenId;
      updates.htsSerialNumber = result.hts.serialNumber;
      updates.htsTxId         = result.hts.transactionId;
      updates.htsMirrorUrl    = result.hts.mirrorNodeUrl;
    }
    if (Object.keys(updates).length > 0) {
      await db.serviceRequest.update({ where: { id: row.id }, data: updates });
    }
  }).catch(err => console.error("[worker] Hedera non-fatal error:", err));
}
