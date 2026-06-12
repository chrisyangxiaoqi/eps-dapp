import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  claimNext,
  drain,
  runOnce,
  type ClaimableRequest,
  type WorkerDb,
  type WorkerDeps,
} from "@/worker/index";

/**
 * T-303 fault test: prove idempotent pickup and exactly-once delivery.
 *
 * The CI integration job has no Postgres, so this drives the REAL worker loop
 * (`drain` / `runOnce` / `claimNext` — the body of `worker:once`) against an
 * in-memory `ServiceRequest` table implementing the same atomic-claim semantics
 * Prisma gives us: `updateMany` only mutates rows still matching the status
 * guard. Delivery is a spy standing in for the chain send, so we can assert it
 * fires exactly once per request.
 *
 * The crash scenario: a row left IN_PROGRESS by a worker that died mid-job. On
 * the next `worker:once`, the worker must RE-CLAIM and re-process it (resume),
 * sending exactly once.
 */

interface Row {
  id: string;
  status: string;
  recipientWallet: string;
  noticeToken: string | null;
  txSignature: string | null;
  createdAt: number;
}

/** Minimal in-memory table with Prisma-compatible claim semantics. */
function makeDb(rows: Row[]): WorkerDb {
  return {
    serviceRequest: {
      async findFirst({ where, orderBy, select }) {
        const matches = rows
          .filter((r) => where.status.in.includes(r.status))
          .sort((a, b) =>
            orderBy.createdAt === "asc"
              ? a.createdAt - b.createdAt
              : b.createdAt - a.createdAt,
          );
        const row = matches[0];
        if (!row) return null;
        if (!select) return { ...row } as unknown as ClaimableRequest;
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(select)) {
          if (select[k]) out[k] = (row as unknown as Record<string, unknown>)[k];
        }
        return out as unknown as ClaimableRequest;
      },
      async updateMany({ where, data }) {
        let count = 0;
        for (const r of rows) {
          if (r.id !== where.id) continue;
          if (!where.status.in.includes(r.status)) continue; // guard failed
          r.status = data.status;
          count += 1;
        }
        return { count };
      },
      async update({ where, data }) {
        const r = rows.find((x) => x.id === where.id);
        if (!r) throw new Error(`row ${where.id} not found`);
        Object.assign(r, data);
        return { ...r };
      },
    },
  };
}

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: "svc_1",
    status: "STAGED",
    recipientWallet: "RecipientWalletAddress1111111111111111111111",
    noticeToken: "0123456789abcdef0123456789abcdef",
    txSignature: null,
    createdAt: 1,
    ...overrides,
  };
}

/** Build deps whose `process` delivers via a spy and marks the row CONFIRMED. */
function makeDeps(rows: Row[]) {
  const sendTransaction = vi.fn(async () => "sig_delivered");
  const deps: WorkerDeps = {
    db: makeDb(rows),
    log: () => {},
    process: async (claimed, db) => {
      // Stand-in for the chain send (the real processor calls the adapter,
      // which calls sendAndConfirmTransaction under the hood).
      const signature = await sendTransaction();
      await db.serviceRequest.update({
        where: { id: claimed.id },
        data: { status: "CONFIRMED", txSignature: signature },
      });
    },
  };
  return { deps, sendTransaction };
}

describe("worker drain loop (T-303)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("re-processes a row left IN_PROGRESS by a crash, sending exactly once", async () => {
    // Fault injection: a request orphaned mid-job (worker died after claiming).
    const rows = [row({ status: "IN_PROGRESS" })];
    const { deps, sendTransaction } = makeDeps(rows);

    const processed = await drain(deps);

    // Idempotent pickup: the IN_PROGRESS row was re-claimed and delivered.
    expect(processed).toBe(1);
    expect(sendTransaction).toHaveBeenCalledTimes(1);
    expect(rows[0]).toMatchObject({
      status: "CONFIRMED",
      txSignature: "sig_delivered",
    });
  });

  it("claims a STAGED row, flips it to IN_PROGRESS, and drives it to CONFIRMED", async () => {
    const rows = [row({ status: "STAGED" })];
    const { deps, sendTransaction } = makeDeps(rows);

    const processed = await drain(deps);

    expect(processed).toBe(1);
    expect(sendTransaction).toHaveBeenCalledTimes(1);
    expect(rows[0].status).toBe("CONFIRMED");
  });

  it("does not re-send for an already-terminal row (no double delivery)", async () => {
    const rows = [row({ status: "CONFIRMED", txSignature: "sig_old" })];
    const { deps, sendTransaction } = makeDeps(rows);

    const processed = await drain(deps);

    expect(processed).toBe(0);
    expect(sendTransaction).not.toHaveBeenCalled();
    expect(rows[0].txSignature).toBe("sig_old");
  });

  it("drains the whole backlog in createdAt order", async () => {
    const rows = [
      row({ id: "svc_a", status: "STAGED", createdAt: 2 }),
      row({ id: "svc_b", status: "IN_PROGRESS", createdAt: 1 }),
      row({ id: "svc_c", status: "STAGED", createdAt: 3 }),
    ];
    const { deps, sendTransaction } = makeDeps(rows);

    const processed = await drain(deps);

    expect(processed).toBe(3);
    expect(sendTransaction).toHaveBeenCalledTimes(3);
    expect(rows.every((r) => r.status === "CONFIRMED")).toBe(true);
  });

  it("parks a row in FAILED when delivery throws, so drain terminates", async () => {
    const rows = [row({ status: "STAGED" })];
    const deps: WorkerDeps = {
      db: makeDb(rows),
      log: () => {},
      process: async () => {
        throw new Error("rpc down");
      },
    };

    const processed = await drain(deps);

    expect(processed).toBe(1); // claimed once...
    expect(rows[0].status).toBe("FAILED"); // ...then parked terminal (T-306 adds quota restore)
  });

  it("claimNext loses the race when the row is already claimed (count === 0)", async () => {
    const rows = [row({ status: "STAGED" })];
    const deps = makeDeps(rows).deps;

    // First claim wins and flips to IN_PROGRESS.
    const first = await claimNext(deps);
    expect(first?.status).toBe("IN_PROGRESS");

    // Simulate the row now being delivered/terminal by another worker before a
    // second concurrent claim's updateMany lands: guard no longer matches.
    rows[0].status = "CONFIRMED";
    const second = await claimNext(deps);
    expect(second).toBeNull();
  });

  it("runOnce returns false on an empty queue", async () => {
    const { deps } = makeDeps([]);
    expect(await runOnce(deps)).toBe(false);
  });
});
