// scripts/seed-demo.ts — seed demo service requests for a live demo (e.g. ETHGlobal judges).
//
// Inserts three ServiceRequest rows for a single Clerk user so the dashboard
// shows a full lifecycle instead of an empty "No services yet." state.
//
// Usage:
//   pnpm tsx scripts/seed-demo.ts --userId=user_xxxxxxxxxxxxxxxxxxxxx
//   SEED_USER_ID=user_xxxxxxxxxxxxxxxxxxxxx pnpm tsx scripts/seed-demo.ts
//
// The userId is resolved (in order) from:
//   1. the --userId=<id> CLI argument
//   2. the SEED_USER_ID environment variable
//   3. a placeholder constant below — REPLACE THIS with the real Clerk userId of
//      the account you'll sign in as during the demo. Find it in the Clerk
//      dashboard (Users → the user → "User ID", looks like `user_...`).
//
// NOTE ON STATUS VALUES: the issue refers to COMPLETE / PAID / STAGED, but the
// real `ServiceStatus` enum (prisma/schema.prisma) is STAGED | IN_PROGRESS |
// CONFIRMED | FAILED — there is no payment status on ServiceRequest. The
// requested statuses map onto the lifecycle as:
//   COMPLETE -> CONFIRMED    (delivered + finalized on-chain)
//   PAID     -> IN_PROGRESS  (picked up by the worker, delivering)
//   STAGED   -> STAGED       (intake done, awaiting fulfilment)

// Load .env.local via Node's built-in env-file loader (no dotenv dependency).
try { process.loadEnvFile('.env.local'); } catch { /* .env.local is optional */ }

import { PrismaClient, ServiceStatus } from '@prisma/client';

// ⬇️  REPLACE with the real Clerk userId you'll demo as (overridden by --userId / SEED_USER_ID).
const PLACEHOLDER_USER_ID = 'user_REPLACE_ME';

function resolveUserId(): string {
  const cliArg = process.argv.find((a) => a.startsWith('--userId='));
  if (cliArg) return cliArg.slice('--userId='.length);
  if (process.env.SEED_USER_ID) return process.env.SEED_USER_ID;
  return PLACEHOLDER_USER_ID;
}

// Three demo requests, newest-first ordering is handled by the dashboard.
// `attestedAt` is required by the schema; we backdate them so the timeline reads
// naturally. Confirmed/in-progress rows carry the extra proof fields a real
// fulfilment would have stamped, so the demo dashboard looks complete.
const demoRequests = [
  {
    // COMPLETE -> CONFIRMED: full lifecycle, on-chain proof present.
    caseCaption: 'Doe v. Smith',
    plaintiffName: 'Jane Doe',
    defendantName: 'John Smith',
    recipientWallet: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    status: ServiceStatus.CONFIRMED,
    txSignature: '5Vfd8mWm9Q3kq2cZ8sJpN7yR1tT4uX6wY9bC2dE3fG4hJ5kL6mN7pQ8rS9tU1vW2xY3z',
    slot: BigInt(287654321),
    blockTime: new Date('2026-06-13T18:00:00Z'),
    documentSha256: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
    // Hedera proof (Phase 3) — present on a fully-delivered notice.
    hcsTxId: '0.0.12345@1718340000.000000000',
    hcsTopicId: '0.0.12345',
    hcsMirrorUrl: 'https://hashscan.io/testnet/transaction/0.0.12345@1718340000.000000000',
    ensDisplayName: 'smith.eth',
    attestedAt: new Date('2026-06-13T17:55:00Z'),
  },
  {
    // PAID -> IN_PROGRESS: picked up by the worker, delivering on-chain.
    caseCaption: 'Acme Corp v. Defendant',
    plaintiffName: 'Acme Corp',
    defendantName: 'Defendant',
    recipientWallet: '7ygrkX9z8mP2vQ4nR6tT3uX1wY5bC8dE2fG7hJ9kL3mN',
    status: ServiceStatus.IN_PROGRESS,
    attestedAt: new Date('2026-06-14T03:30:00Z'),
  },
  {
    // STAGED -> STAGED: intake done, awaiting fulfilment.
    caseCaption: 'Demo Case v. Test Recipient',
    plaintiffName: 'Demo Plaintiff',
    defendantName: 'Test Recipient',
    recipientWallet: 'C8dE2fG7hJ9kL3mN7yQ4rS9tU1vW2xY3z5aB6cD8eF1g',
    status: ServiceStatus.STAGED,
    attestedAt: new Date('2026-06-14T04:15:00Z'),
  },
] as const;

async function main() {
  const userId = resolveUserId();
  if (userId === PLACEHOLDER_USER_ID) {
    console.error(
      'Refusing to seed with the placeholder userId. Pass a real Clerk userId:\n' +
        '  pnpm tsx scripts/seed-demo.ts --userId=user_xxx\n' +
        '  SEED_USER_ID=user_xxx pnpm tsx scripts/seed-demo.ts\n' +
        '(or edit PLACEHOLDER_USER_ID in scripts/seed-demo.ts).',
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    console.log(`Seeding ${demoRequests.length} demo service requests for user ${userId}...`);
    for (const data of demoRequests) {
      const created = await prisma.serviceRequest.create({
        data: { userId, ...data },
      });
      console.log(`  ✓ ${created.status.padEnd(11)} ${created.caseCaption} (${created.id})`);
    }
    console.log('Done. Sign in as that user to see the populated dashboard.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
