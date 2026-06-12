import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { checkAndDecrementQuota } from "@/lib/quota";
import { storeDocument } from "@/lib/storage";

/**
 * Service intake as a single all-or-nothing unit of work (T-205).
 *
 * `createServiceRequest` stages a service-of-process request by consuming one
 * unit of the org's quota, encrypting + privately storing the document,
 * creating the {@link ServiceRequest} in the STAGED state with a fresh 128-bit
 * notice token, and writing an {@link AuditLog} row — all inside ONE
 * `prisma.$transaction`. If any step fails (including the storage PUT), the
 * whole transaction rolls back: the quota decrement is undone and no STAGED
 * record or audit row is committed ("rollback restores quota").
 */

/** Input for {@link createServiceRequest}. All identity comes from the verified
 * Clerk session token upstream — never from client-supplied fields. */
export interface CreateServiceRequestInput {
  /** Verified Clerk org id (the billable tenant). */
  orgId: string;
  /** Verified Clerk user id performing the intake (recorded on the audit row). */
  actorId: string;
  caseCaption: string;
  plaintiffName: string;
  defendantName: string;
  /** On-curve Solana recipient address (validated upstream). */
  recipientWallet: string;
  courtOrderFlag: boolean;
  /** Plaintext document bytes; encrypted + stored privately inside the tx. */
  document: Buffer;
}

/** Result of a successful, committed intake. */
export interface StagedServiceRequest {
  id: string;
  status: string;
  /** 128-bit (16-byte) unguessable notice token, hex-encoded (32 chars). */
  noticeToken: string;
  /** Private storage object key for the encrypted document. */
  objectKey: string;
  /** SHA-256 of the plaintext document, hex. */
  sha256: string;
}

/** Generate a 128-bit unguessable notice token, hex-encoded (32 chars). */
function generateNoticeToken(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Stage a new service request atomically. See the module doc above for the
 * transactional contract.
 *
 * Document bytes and caption fields are confidential legal-filing data and are
 * never logged (CLAUDE.md hard rule #3). The audit row records only key
 * references (object key, plaintext hash), not document bytes.
 *
 * @throws {NoActiveSubscriptionError} when the org has no ACTIVE subscription.
 * @throws {QuotaExceededError} when the period's quota is exhausted.
 */
export async function createServiceRequest(
  input: CreateServiceRequestInput,
): Promise<StagedServiceRequest> {
  return prisma.$transaction(async (tx) => {
    const noticeToken = generateNoticeToken();

    // (1) Consume one unit of quota within the tx, enforcing the tier limit.
    //     Because this runs in the same transaction as the writes below, ANY
    //     later failure rolls the decrement back — "rollback restores quota".
    await checkAndDecrementQuota(input.orgId, tx);

    // (2) Encrypt + persist the document to a private object. Storage is not
    //     itself transactional, but performing it here means a storage failure
    //     aborts the whole intake: the quota decrement above and the writes
    //     below never commit (no orphaned quota burn, no STAGED record).
    const stored = await storeDocument(input.document);

    // (3) Stage the request with the fresh notice token. `attestedAt` is stamped
    //     server-side; the org is resolved from the verified id, not the body.
    const created = await tx.serviceRequest.create({
      data: {
        organization: { connect: { clerkOrgId: input.orgId } },
        caseCaption: input.caseCaption,
        plaintiffName: input.plaintiffName,
        defendantName: input.defendantName,
        recipientWallet: input.recipientWallet,
        courtOrderFlag: input.courtOrderFlag,
        attestedAt: new Date(),
        noticeToken,
        status: "STAGED",
      },
      select: { id: true, status: true },
    });

    // (4) Audit the state transition in the SAME tx (CLAUDE.md hard rule #5).
    await tx.auditLog.create({
      data: {
        action: "SERVICE_REQUEST_STAGED",
        actorId: input.actorId,
        targetId: created.id,
        metadata: {
          orgId: input.orgId,
          objectKey: stored.objectKey,
          sha256: stored.sha256,
        },
      },
    });

    return {
      id: created.id,
      status: created.status,
      noticeToken,
      objectKey: stored.objectKey,
      sha256: stored.sha256,
    };
  });
}
