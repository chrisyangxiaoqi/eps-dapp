import { fileURLToPath } from "node:url";

import { prisma } from "@/lib/db";
import { failServiceRequest } from "@/lib/failure";
import { processServiceRequest } from "@/worker/process";

/**
 * Fulfilment worker — DB-polled job loop (T-303).
 *
 * The worker is the process that drives STAGED service requests through on-chain
 * delivery. There is no Redis: the queue is the `ServiceRequest` table, polled
 * every {@link POLL_INTERVAL_MS}. Two run modes:
 *
 *  - long-running (`pnpm worker`): poll forever, claiming and processing one job
 *    per tick.
 *  - drain-and-exit (`pnpm worker:once`, `DRAIN_AND_EXIT=1`): process the entire
 *    backlog, then `exit(0)`. This is what the scheduled staging drain
 *    (P5/T-503) and integration tests invoke.
 *
 * Idempotent pickup (acceptance: "crash mid-job resumes idempotently"): a job is
 * claimed by atomically flipping its row to IN_PROGRESS with a conditional
 * `updateMany`, so two pollers can never both win the same row. Crucially the
 * claim also re-selects rows already IN_PROGRESS: in this single-worker model an
 * IN_PROGRESS row at poll time is necessarily one a previous worker died
 * mid-job, so re-claiming it resumes the work rather than stranding it. Each job
 * is driven to a terminal state (CONFIRMED / FAILED) before the next claim, so a
 * given request's delivery is attempted exactly once per successful run.
 *
 * Confidentiality: caption and document bytes are never logged (hard rule #3);
 * the worker logs only request ids and statuses.
 */

/** Poll interval for the long-running loop. */
export const POLL_INTERVAL_MS = 5_000;

/**
 * Statuses a poller may claim. STAGED is a fresh request; IN_PROGRESS is one
 * orphaned by a crashed worker (single-worker model) and is resumed.
 */
const CLAIMABLE: readonly string[] = ["STAGED", "IN_PROGRESS"];

/** The slice of a `ServiceRequest` row the worker needs to deliver. */
export interface ClaimableRequest {
  id: string;
  status: string;
  /**
   * Internal `Organization.id` that owns the request (the `ServiceRequest.orgId`
   * FK). Needed to credit the quota unit back if the delivery fails terminally
   * (T-306).
   */
  orgId: string;
  recipientWallet: string;
  noticeToken: string | null;
  /**
   * SHA-256 (hex) of the served document, stamped at intake (T-204). Encoded
   * into the on-chain memo and re-read verified post-confirm (T-305). `null` for
   * rows staged before the column existed.
   */
  documentSha256: string | null;
  /**
   * The on-chain signature, if one has already been sent for this row (hard
   * rule #4). `null` on a fresh STAGED request; non-null on an IN_PROGRESS row
   * a crashed worker left after sending — the resumed worker re-confirms it
   * instead of re-sending.
   */
  txSignature: string | null;
  /**
   * The case caption (legal title of the case). Used by the Hedera integration
   * to label the HCS message and HTS NFT (Phase 3).
   */
  caseCaption: string;
  /**
   * The ENS name of the serving agent, if resolved (Phase 2).
   * Stored on the row at intake and forwarded to Hedera as `servedBy`.
   */
  agentENSName: string | null;
}

/**
 * Minimal Prisma surface the worker uses. Both the real `PrismaClient` and the
 * in-memory fake in the integration test satisfy it.
 */
export interface WorkerDb {
  serviceRequest: {
    findFirst(args: {
      where: { status: { in: readonly string[] } };
      orderBy: { createdAt: "asc" };
      select?: Record<string, boolean>;
    }): Promise<ClaimableRequest | null>;
    updateMany(args: {
      where: { id: string; status: { in: readonly string[] } };
      data: { status: string };
    }): Promise<{ count: number }>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<unknown>;
  };
}

/** A unit of delivery work: take a claimed row to a terminal state. */
export type ProcessFn = (row: ClaimableRequest, db: WorkerDb) => Promise<void>;

/**
 * Terminal-failure handler: park the row FAILED, restore its consumed quota
 * unit, and audit the transition (T-306). Injected so the loop is testable
 * without a live DB; defaults to {@link failServiceRequest}.
 */
export type FailFn = (row: ClaimableRequest, reason: string) => Promise<void>;

/** Injected collaborators, so the loop is testable without a live DB/cluster. */
export interface WorkerDeps {
  db: WorkerDb;
  process: ProcessFn;
  fail: FailFn;
  log: (message: string) => void;
}

/** Default production dependencies: shared Prisma + real chain delivery. */
export function defaultDeps(): WorkerDeps {
  return {
    db: prisma as unknown as WorkerDb,
    process: processServiceRequest,
    fail: (row, reason) =>
      failServiceRequest({
        serviceRequestId: row.id,
        orgId: row.orgId,
        reason,
        txSignature: row.txSignature,
      }).then(() => undefined),
    log: (message) => console.log(`[worker] ${message}`),
  };
}

/**
 * Atomically claim the oldest claimable request, flipping it to IN_PROGRESS.
 *
 * The two-step find-then-conditional-update is the lock: the `updateMany` guard
 * (`status in CLAIMABLE`) only mutates the row if it is still claimable, so a
 * concurrent poller that already took it leaves `count === 0` here and we move
 * on. Re-selecting IN_PROGRESS rows is what makes a crashed job resumable.
 *
 * @returns the claimed row (status IN_PROGRESS), or `null` if the queue is empty
 *   or the row was claimed by someone else first.
 */
export async function claimNext(deps: WorkerDeps): Promise<ClaimableRequest | null> {
  const candidate = await deps.db.serviceRequest.findFirst({
    where: { status: { in: CLAIMABLE } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      status: true,
      orgId: true,
      recipientWallet: true,
      noticeToken: true,
      documentSha256: true,
      txSignature: true,
      caseCaption: true,
      agentENSName: true,
    },
  });
  if (!candidate) return null;

  const { count } = await deps.db.serviceRequest.updateMany({
    where: { id: candidate.id, status: { in: CLAIMABLE } },
    data: { status: "IN_PROGRESS" },
  });
  if (count === 0) return null; // lost the race to another poller.

  return { ...candidate, status: "IN_PROGRESS" };
}

/**
 * Claim and process a single job. A terminal delivery error (send failure, memo
 * mismatch, timeout) is caught and routed through {@link FailFn}, which parks the
 * row FAILED, restores the consumed quota unit, and audits the transition
 * (T-306) — so the row reaches a terminal state (the drain loop can't spin on it)
 * and the customer is not billed for a failed delivery. A crash (uncaught,
 * process dies) leaves the row IN_PROGRESS to be resumed next run.
 *
 * @returns `true` if a job was claimed (regardless of delivery outcome),
 *   `false` if the queue was empty.
 */
export async function runOnce(deps: WorkerDeps): Promise<boolean> {
  const row = await claimNext(deps);
  if (!row) return false;

  try {
    await deps.process(row, deps.db);
    deps.log(`delivered ${row.id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    deps.log(`delivery failed for ${row.id}: ${message}`);
    await deps.fail(row, message);
  }
  return true;
}

/**
 * Drain the entire backlog: keep claiming and processing until no claimable
 * request remains. This is the body of `worker:once`.
 * @returns the number of jobs processed.
 */
export async function drain(deps: WorkerDeps): Promise<number> {
  let processed = 0;
  while (await runOnce(deps)) {
    processed += 1;
  }
  return processed;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Long-running poll loop: process one job per tick, then wait
 * {@link POLL_INTERVAL_MS}. Runs until the process is signalled.
 */
async function pollForever(deps: WorkerDeps): Promise<void> {
  deps.log(`polling every ${POLL_INTERVAL_MS}ms`);
  for (;;) {
    try {
      await runOnce(deps);
    } catch (err) {
      // Never let an infrastructure error (e.g. DB blip) kill the loop.
      const message = err instanceof Error ? err.message : String(err);
      deps.log(`poll error: ${message}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

/** Process entry point: branch on `DRAIN_AND_EXIT`. */
async function main(): Promise<void> {
  const deps = defaultDeps();

  if (process.env.DRAIN_AND_EXIT === "1") {
    const processed = await drain(deps);
    deps.log(`drained ${processed} job(s); exiting`);
    await prisma.$disconnect();
    process.exit(0);
  }

  await pollForever(deps);
}

// Only auto-run when invoked directly (`tsx worker/index.ts`), not when this
// module is imported by tests.
const invokedDirectly =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  main().catch((err) => {
    console.error("[worker] fatal:", err);
    process.exit(1);
  });
}
