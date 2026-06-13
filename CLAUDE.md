# CLAUDE.md â BLI E-Process Server (EPS)
This file governs autonomous work by Claude Code in this repository. Read fully before any task.

## Mission
Build the EPS dApp per `docs/EPS_SOW_v1.1.md`, phase by phase, per `docs/AUTONOMOUS_BUILD_PLAYBOOK.md` and the phase gates in `docs/EPS_Build_Workbook.xlsx` (mirrored in `docs/PHASES.md`). Never skip a phase gate.

## Stack (do not substitute without an ADR)
- Next.js 15 App Router + TypeScript strict + Tailwind v4 (matches existing DARA frontend conventions)
- Clerk (auth, email verify, 2FA) â verify session token server-side on EVERY API route; `userId`/`orgId` come from the token, never the client
- Postgres 16 + Prisma; job queue = DB table polled by `worker/` process (no Redis)
- Stripe Billing (subscriptions + promotion codes) via stripe-node; webhooks signature-verified, event-id deduped in `WebhookEvent` table
- Solana: `@solana/web3.js` + `@solana/spl-memo`; all chain calls behind `lib/chain/ChainAdapter.ts`
- Object storage: S3-compatible (MinIO locally); files encrypted at rest (AES-256-GCM, key refs only in DB)
- PDF certificates: `pdf-lib` server-side; Resend for email

## Environments
| Env | Chain | How |
|---|---|---|
| test (unit/integration) | `solana-test-validator` (localhost:8899) | started by `pnpm test:chain` / CI service |
| dev | devnet | `SOLANA_RPC=https://api.devnet.solana.com`, airdrop-funded app wallet |
| staging | devnet | Vercel preview + Neon branch DB |
| prod (later) | mainnet-beta | NOT in scope; never point at mainnet |

## Commands
- `pnpm dev` â app; `pnpm worker` â fulfilment worker
- `pnpm db:up` â docker compose Postgres+MinIO; `pnpm db:migrate` â prisma migrate dev
- `pnpm test` â vitest unit; `pnpm test:int` â integration (spawns solana-test-validator); `pnpm test:e2e` â Playwright
- `pnpm stripe:listen` â Stripe CLI webhook forwarding (dev only)
- `pnpm lint && pnpm typecheck` â must pass before every commit

## Hard rules (security/compliance)
1. NEVER write a private key, seed phrase, or API secret into code, fixtures, logs, or the DB. App wallet key comes from `APP_WALLET_KEYPAIR_PATH` (local/test) or KMS env ref (deployed). Test keypairs are generated at test setup, never committed.
2. NEVER point any code, test, or script at mainnet-beta. Guard: `assertNotMainnet()` in ChainAdapter constructor.
3. Documents are confidential legal filings: no document bytes in logs, no public IPFS, storage objects private + encrypted.
4. Persist the tx signature BEFORE awaiting confirmation. Confirm at `finalized`.
5. Every state transition writes an `AuditLog` row in the same DB transaction.
6. UI/email copy must not claim the platform "effects valid legal service" â it "facilitates service and generates court-ready proof." Copy changes touching legal language require human review (tag PR `needs-legal-copy-review`).
7. Real money: Stripe in test mode only; never create live-mode keys or products.

## Definition of Done (every task)
- Code + tests written; `pnpm lint && pnpm typecheck && pnpm test` green locally
- Integration tests green if the task touches chain, Stripe, storage, or the worker
- Prisma migration included if schema changed; seed updated
- `docs/PHASES.md` task row updated (status, commit SHA, notes)
- Conventional commit; one logical change per commit; push to feature branch `phase-N/<slug>`; open PR with the phase-gate checklist template

## Working style
- Work ONE task at a time from the current phase in `docs/PHASES.md`; do not start phase N+1 until phase N's gate checklist is fully checked and the human has approved the gate PR.
- If blocked >2 attempts on the same error, write a `docs/blockers/<date>-<slug>.md` with reproduction + hypotheses and move to the next unblocked task in the same phase.
- Decisions that deviate from the SOW require `docs/adr/NNN-<slug>.md` (context, decision, consequences) and a note in the workbook Change Control tab.
- Prefer boring solutions. No new dependencies without an ADR.

## Test accounts & fixtures
- Clerk: dev instance, test users `filer@test.eps` (org owner) and `admin@test.eps`
- Stripe test: products/prices created by `scripts/stripe-bootstrap.ts` (Tier1 $200, Tier2 $600, Tier3 $1000, coupon EARLYADOPTER50 = 50% off 12 months)
- Recipient wallets in tests: fresh `Keypair.generate()` per test; rent-exempt transfer asserts on-curve handling; include one PDA/off-curve negative test


---

## CURRENT STATE (updated 2026-06-13)

### Completed phases (do not redo)
- Phase 1: Repo setup, 20 Vercel env vars, deps installed
- Phase 2: ENS — lib/ens/ENSResolver.ts, /api/ens/resolve, /api/ens/agent (ENSIP-25/26)
- Phase 3: Hedera — lib/hedera/HederaService.ts (HCS + HTS), HederaAgentKit.ts
- Phase 4: Dynamic — lib/payments/DynamicFlow.ts, lib/agents/DynamicServerWallet.ts
- Phase 5: Unlink — lib/payments/UnlinkPrivacy.ts
- Prisma schema: 11 new nullable fields on ServiceRequest
- DB migration 20260613020000_add_ens_hedera_fields: APPLIED (run 5, prisma@6)

### Env vars still needing real values
- NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID
- DYNAMIC_BEARER_TOKEN
- EPS_AGENT_WALLET_ID (run scripts/create-agent-wallet.ts)

### Task queue (tasks/ directory)
Execute in order: T101 -> T102 -> T103 -> T104 -> T105 -> T106 -> T107 -> T108

---

## CLAUDE CODE TASK PROTOCOL

When starting a task:
1. cat tasks/T1XX-name.md
2. git log --oneline -5 && git status
3. Execute steps in order — no skipping
4. Run every check in "Definition of Done" before committing
5. Commit with exact message from task file
6. Set Status: DONE in task file and commit
7. Move to next task

### Rules (enforce strictly)
NEVER:
- Skip Definition of Done checks
- Add @ts-ignore without explaining why in comment
- Remove existing tests
- Hardcode secrets or credentials
- Return 500 when 503 is correct (external service unconfigured)
- Touch lib/chain/SolanaAdapter.ts (existing, stable)

ALWAYS:
- pnpm build before committing source changes
- Wrap HCS/HTS calls in try/catch — Hedera failure must not fail delivery
- Keep all new nullable fields on ServiceRequest (do not remove)

### Quick reference
pnpm dev            # Next.js on port 3000
pnpm worker         # Delivery worker
pnpm test --run     # Vitest unit tests
pnpm test:integration --run   # Integration tests
pnpm exec playwright test     # E2E tests
pnpm exec tsc --noEmit        # TypeScript check
pnpm build                    # Production build
pnpm prisma studio            # DB GUI
pnpm prisma migrate dev       # Apply local schema changes
