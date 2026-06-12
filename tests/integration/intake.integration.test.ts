import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * T-205 integration test: prove `createServiceRequest` is all-or-nothing.
 *
 * The CI integration job has no Postgres service, so rather than a live DB this
 * test drives the real `createServiceRequest` (and the real `checkAndDecrementQuota`
 * inside it) against an in-memory Prisma fake that implements genuine
 * `$transaction` ROLLBACK semantics: the callback runs against a clone of the
 * tables, which is committed back only if the callback resolves and discarded
 * if it throws. Storage is mocked to throw mid-transaction (e.g. MinIO down),
 * and we assert the quota decrement is rolled back and no ServiceRequest /
 * AuditLog row survives.
 */

// Storage fails mid-transaction by default; the happy-path test overrides it.
vi.mock("@/lib/storage", () => ({
  storeDocument: vi.fn(async () => {
    throw new Error("storage unavailable");
  }),
}));

// In-memory transactional Prisma fake. Hoisted so the `@/lib/db` mock factory
// and the test body share one instance (vi.mock factories are hoisted above
// imports, so they cannot close over ordinary top-level consts).
const h = vi.hoisted(() => {
  interface SubRow {
    id: string;
    orgId: string;
    clerkOrgId: string;
    tierId: string;
    status: string;
    periodStart: Date;
    periodEnd: Date;
    usageCount: number;
  }
  interface Tables {
    subscriptions: SubRow[];
    serviceRequests: Record<string, unknown>[];
    auditLogs: Record<string, unknown>[];
  }

  // Query-arg shapes the production code actually issues (just the fields used).
  interface FindFirstArgs {
    where?: { status?: string; organization?: { clerkOrgId?: string } };
    orderBy?: { periodEnd?: "asc" | "desc" };
  }
  interface UpdateManyArgs {
    where?: { id?: string; usageCount?: { lt?: number } };
    data?: { usageCount?: { increment?: number } };
  }
  interface UpdateArgs {
    where: { id: string };
    data: Partial<SubRow>;
  }
  interface CreateArgs {
    data: Record<string, unknown> & {
      organization?: { connect?: { clerkOrgId?: string } };
    };
    select?: Record<string, boolean>;
  }

  const state: Tables = { subscriptions: [], serviceRequests: [], auditLogs: [] };
  let idCounter = 0;
  const nextId = (prefix: string): string => `${prefix}_${++idCounter}`;

  // Build a client bound to a specific tables object (live state, or a tx clone).
  function makeClient(store: Tables) {
    return {
      subscription: {
        // Supports the exact shapes checkAndDecrementQuota issues.
        async findFirst({ where, orderBy }: FindFirstArgs): Promise<SubRow | null> {
          let rows = store.subscriptions.filter((s) => {
            if (where?.status && s.status !== where.status) return false;
            if (
              where?.organization?.clerkOrgId &&
              s.clerkOrgId !== where.organization.clerkOrgId
            ) {
              return false;
            }
            return true;
          });
          if (orderBy?.periodEnd === "desc") {
            rows = [...rows].sort(
              (a, b) => b.periodEnd.getTime() - a.periodEnd.getTime(),
            );
          }
          return rows[0] ?? null;
        },
        async updateMany({ where, data }: UpdateManyArgs): Promise<{ count: number }> {
          let count = 0;
          for (const s of store.subscriptions) {
            if (where?.id && s.id !== where.id) continue;
            if (
              where?.usageCount?.lt !== undefined &&
              !(s.usageCount < where.usageCount.lt)
            ) {
              continue;
            }
            if (data?.usageCount?.increment !== undefined) {
              s.usageCount += data.usageCount.increment;
            }
            count++;
          }
          return { count };
        },
        async update({ where, data }: UpdateArgs): Promise<SubRow> {
          const s = store.subscriptions.find((x) => x.id === where.id);
          if (!s) throw new Error("subscription not found");
          Object.assign(s, data);
          return { ...s };
        },
      },
      serviceRequest: {
        async create({ data, select }: CreateArgs): Promise<Record<string, unknown>> {
          const clerkOrgId = data.organization?.connect?.clerkOrgId;
          const sub = store.subscriptions.find((s) => s.clerkOrgId === clerkOrgId);
          const row: Record<string, unknown> = {
            id: nextId("svc"),
            orgId: sub?.orgId ?? clerkOrgId,
            caseCaption: data.caseCaption,
            plaintiffName: data.plaintiffName,
            defendantName: data.defendantName,
            recipientWallet: data.recipientWallet,
            courtOrderFlag: data.courtOrderFlag,
            attestedAt: data.attestedAt,
            noticeToken: data.noticeToken,
            status: data.status,
          };
          store.serviceRequests.push(row);
          if (select) {
            const out: Record<string, unknown> = {};
            for (const k of Object.keys(select)) if (select[k]) out[k] = row[k];
            return out;
          }
          return { ...row };
        },
      },
      auditLog: {
        async create({ data }: { data: Record<string, unknown> }): Promise<Record<string, unknown>> {
          const row = { id: nextId("audit"), ...data };
          store.auditLogs.push(row);
          return { ...row };
        },
      },
    };
  }

  type FakeClient = ReturnType<typeof makeClient>;

  const db = {
    ...makeClient(state),
    // Interactive transaction with real rollback: run the callback against a
    // CLONE; commit it back to live state only on success.
    async $transaction(fn: (tx: FakeClient) => Promise<unknown>): Promise<unknown> {
      const working: Tables = structuredClone(state);
      const result = await fn(makeClient(working));
      state.subscriptions = working.subscriptions;
      state.serviceRequests = working.serviceRequests;
      state.auditLogs = working.auditLogs;
      return result;
    },
  };

  function seed() {
    idCounter = 0;
    // periodEnd far in the future so quota takes the normal (non-rollover) path
    // regardless of the wall clock when CI runs.
    state.subscriptions = [
      {
        id: "sub_1",
        orgId: "org_internal_1",
        clerkOrgId: "org_1",
        tierId: "tier2", // limit 9
        status: "ACTIVE",
        periodStart: new Date("2020-01-01T00:00:00Z"),
        periodEnd: new Date("2099-12-31T00:00:00Z"),
        usageCount: 3,
      },
    ];
    state.serviceRequests = [];
    state.auditLogs = [];
  }

  return { db, state, seed };
});

vi.mock("@/lib/db", () => ({ prisma: h.db }));

import { createServiceRequest } from "@/lib/intake";
import { storeDocument } from "@/lib/storage";

function input(overrides: Record<string, unknown> = {}) {
  return {
    orgId: "org_1",
    actorId: "user_1",
    caseCaption: "Smith v. Jones, No. 24-CV-1234",
    plaintiffName: "Smith",
    defendantName: "Jones",
    recipientWallet: "RecipientWalletAddress1111111111111111111111",
    courtOrderFlag: false,
    document: Buffer.from("%PDF-1.7 confidential filing"),
    ...overrides,
  } as Parameters<typeof createServiceRequest>[0];
}

function usage(): number {
  return (h.state.subscriptions[0] as { usageCount: number }).usageCount;
}

describe("createServiceRequest — one-transaction intake (T-205)", () => {
  beforeEach(() => {
    h.seed();
    vi.clearAllMocks(); // clears call history; keeps the throwing default impl
  });

  it("rolls back the quota decrement and writes no rows when storage fails mid-transaction", async () => {
    const before = usage();

    await expect(createServiceRequest(input())).rejects.toThrow(/storage unavailable/);

    // Storage was reached mid-transaction — i.e. AFTER the quota decrement.
    expect(storeDocument).toHaveBeenCalledTimes(1);

    // All-or-nothing: usageCount unchanged, no ServiceRequest, no AuditLog.
    expect(usage()).toBe(before);
    expect(h.state.serviceRequests).toHaveLength(0);
    expect(h.state.auditLogs).toHaveLength(0);
  });

  it("commits quota decrement + STAGED row + audit together on success", async () => {
    vi.mocked(storeDocument).mockResolvedValueOnce({
      objectKey: "documents/abc-123",
      sha256: "deadbeef",
      iv: "00".repeat(12),
      authTag: "11".repeat(16),
    });

    const before = usage();
    const result = await createServiceRequest(input({ courtOrderFlag: true }));

    expect(result.status).toBe("STAGED");
    // 128-bit notice token: 16 random bytes => 32 hex chars.
    expect(result.noticeToken).toMatch(/^[0-9a-f]{32}$/);
    expect(result.objectKey).toBe("documents/abc-123");

    // Quota consumed, exactly one STAGED row + one audit row committed together.
    expect(usage()).toBe(before + 1);
    expect(h.state.serviceRequests).toHaveLength(1);
    expect(h.state.serviceRequests[0]).toMatchObject({
      status: "STAGED",
      noticeToken: result.noticeToken,
    });
    expect(h.state.auditLogs).toHaveLength(1);
    expect(h.state.auditLogs[0]).toMatchObject({
      action: "SERVICE_REQUEST_STAGED",
      actorId: "user_1",
      targetId: result.id,
    });
  });
});
