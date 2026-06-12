# PHASES.md — EPS Build Task Tracker (repo-canonical)
Claude Code: work ONE task at a time, top-down, within the current phase. Update your task's row (Status, SHA, Notes) in the same commit as the work. Do not begin the next phase until the current phase's gate PR is approved by a human. Statuses: NOT STARTED / IN PROGRESS / BLOCKED / DONE.

**Current phase: P0**

## P0 — Scaffold — GATE: CI fully green on hello-world; secret-scan + mainnet-grep active
| ID | Task | Acceptance criteria | Status | SHA | Notes |
|---|---|---|---|---|---|
| T-001 | Repo hygiene: .gitignore, .github/ (CI workflow, claude workflow, phase-gate PR template), devcontainer.json | Devcontainer pins Node 20, pnpm, Solana CLI, Stripe CLI; PR template has gate checklist | DONE | _pending_ | Added `.devcontainer/` (Node 20 base + pnpm/Solana/Stripe CLI via post-create) and `.github/pull_request_template.md` with gate checklist. `.gitignore` already covers node/env/secrets. CI workflow now in place at `.github/workflows/ci.yml` (gitleaks + mainnet-grep + lint/typecheck/unit). |
| T-002 | Next.js 15 + TS strict + Tailwind v4 scaffold | `pnpm dev` serves; `tsc --noEmit` clean | DONE | d4e37cb | Next.js 15.5 App Router (no `src/`, `app/` at root) + React 19. TS `strict: true`. Tailwind v4 via `@tailwindcss/postcss` + `@import "tailwindcss"` in `app/globals.css` (no `tailwind.config.js`). ESLint 9 flat config extending `next/core-web-vitals` + `next/typescript`. Hello-world `app/page.tsx`. Added vitest + smoke test so CI `pnpm test` is green (full suite in T-005). Verified locally: `typecheck`, `lint`, `test`, `build` all exit 0. |
| T-003 | docker compose: Postgres 16 + MinIO; Prisma init + seed | `pnpm db:up && pnpm db:migrate` succeed; seed runs | DONE | _pending_ | `docker-compose.yml`: `postgres:16-alpine` + `minio/minio` with healthchecks (`pg_isready` / `mc ready`) and named volumes. `prisma/schema.prisma` postgresql datasource + placeholder `Health` model; initial migration `20260612193123_init` committed. Scripts `db:up`/`db:down`/`db:migrate`/`db:seed` added; `db:seed` runs via `prisma db seed` → `tsx prisma/seed.ts` logging "seed ok". `DATABASE_URL` in `.env.example`. Verified locally end-to-end: `db:up` (both healthy) → `db:migrate` (applied) → `db:seed` (clean); `typecheck`/`lint`/`test` green. |
| T-004 | Clerk integration (email verify + 2FA) + server-side token helper | Protected route rejects missing/invalid token; userId/orgId derived server-side only | DONE | _pending_ | Added `@clerk/nextjs` 7.5.2. `app/layout.tsx` wrapped in `<ClerkProvider>`. `middleware.ts` runs `clerkMiddleware`, calling `auth.protect()` on `/dashboard(.*)` so unauthenticated requests are rejected at the edge. `lib/auth.ts` exposes `requireAuth()` → `{ userId, orgId }` derived from the verified session token via `auth()`; throws `UnauthorizedError` when no user or no active org (never reads client input). `app/dashboard/page.tsx` is a server component calling the helper. Clerk env vars added to `.env.example` (test keys only). Unit tests in `test/auth.test.ts` cover unauthenticated / no-org / success. `typecheck`, `lint`, `test` all green. Email verify + 2FA are enabled in the Clerk dev instance dashboard (instance config, not code). |
| T-005 | CI: lint, typecheck, unit, integration (solana-test-validator service), e2e, gitleaks, mainnet-grep | All jobs green on PR | DONE | _pending_ | CI split into jobs: `secret-scan` (gitleaks) + `mainnet-grep` (kept), `lint` (`pnpm lint`), `typecheck` (`pnpm tsc --noEmit`), `unit` (`pnpm test -- --run`), `integration` (solana-test-validator service on :8899 + `pnpm test:integration`), `e2e` (echo placeholder until P5/T-502). Added `vitest.config.ts` (unit; excludes `tests/integration`) and `vitest.integration.config.ts` (integration-only). Scripts: `test` → `vitest`, `test:integration` → `vitest run --config vitest.integration.config.ts`. `test/smoke.test.ts` + new `tests/integration/smoke.integration.test.ts` pass. Also ignored generated `next-env.d.ts` in eslint (its triple-slash ref tripped `next/typescript`). Verified locally: lint, typecheck, unit (4), integration (2) all green. |

## P1 — Subscriptions & quotas — GATE: tier quota correct on dashboard; webhook replay-safe; comp grant works
| ID | Task | Acceptance criteria | Status | SHA | Notes |
|---|---|---|---|---|---|
| T-101 | Prisma: Organization, Subscription, WebhookEvent | Migration applies; relations enforced | DONE | _pending_ | Added `Organization` (id, `clerkOrgId` @unique, name, createdAt), `Subscription` (id, `orgId` FK → Organization with `onDelete: Cascade` + `@@index`, tierId, `status` enum `SubscriptionStatus` ACTIVE/CANCELED/PAST_DUE, periodStart, periodEnd, `usageCount` Int @default(0)), and `WebhookEvent` (id, `eventId` @unique, processedAt) to `prisma/schema.prisma`. Migration `20260612200900_add_org_sub_webhook` created. Verified locally against `postgres:16-alpine`: `prisma validate` clean, `migrate deploy` applies both migrations, and `migrate diff --from-migrations --to-schema-datamodel` reports "No difference detected" (no drift). |
| T-102 | scripts/stripe-bootstrap.ts (Tier1 $200 / Tier2 $600 / Tier3 $1000 + EARLYADOPTER50, test mode) | Idempotent re-run; price IDs documented in .env.example | DONE | _pending_ | Added `scripts/stripe-bootstrap.ts` (stripe-node 22.x). Creates Tier1/2/3 products + monthly recurring prices (20000/60000/100000 cents USD) and the `EARLYADOPTER50` coupon (50% off, `repeating` 12 months). Idempotency via `metadata.bootstrapKey`: products looked up with `products.search`, prices via active-price scan on the product, coupon via list-scan — re-runs reuse existing objects instead of duplicating. `assertTestMode()` aborts on `sk_live_`/`rk_live_` keys (CLAUDE.md hard rule #7). Prints `STRIPE_TIER{1,2,3}_PRICE_ID` for `.env`; placeholders added to `.env.example` alongside `STRIPE_SECRET_KEY`. `lint` + `typecheck` green. |
| T-103 | Subscription checkout + promo code field | Subscription-mode session; promo applies 50% | NOT STARTED | | |
| T-104 | Webhook handler: signature verify + event-id dedupe | Replayed event is a no-op (test asserts) | NOT STARTED | | |
| T-105 | Quota meter + enforcement service | Tier1=1, Tier2=9, Tier3=999 per period; resets on rollover | NOT STARTED | | |
| T-106 | Comp-grant admin route (Founders Legacy, 24mo) | Admin-only; AuditLog row written | NOT STARTED | | |

## P2 — Service intake — GATE: submission yields STAGED record with encrypted object + notice token; bad input rejected pre-quota
| ID | Task | Acceptance criteria | Status | SHA | Notes |
|---|---|---|---|---|---|
| T-201 | Upload endpoint: MIME + magic bytes + 25MB cap | Spoofed-extension file rejected | NOT STARTED | | |
| T-202 | Solana address validation (base58 + on-curve) | PDA/off-curve rejected with clear error | NOT STARTED | | |
| T-203 | Case-caption form + attestation + optional court-order flag | Required-field validation; values persisted | NOT STARTED | | |
| T-204 | SHA-256 + AES-256-GCM encrypt + private object put | Hash stable on re-read; object not publicly readable | NOT STARTED | | |
| T-205 | Notice token (128-bit) + Service STAGED + AuditLog + quota decrement in ONE transaction | Rollback restores quota | NOT STARTED | | |

## P3 — Chain delivery — GATE: integration suite green on local validator incl. retry tests; ONE manual devnet delivery verified in explorer
| ID | Task | Acceptance criteria | Status | SHA | Notes |
|---|---|---|---|---|---|
| T-301 | ChainAdapter interface + Solana impl + assertNotMainnet | Constructor throws on mainnet RPC (unit test) | NOT STARTED | | |
| T-302 | Tx builder: transfer(rent-exempt min) + Memo(sha256\|notice\|svc) | Memo decodes to expected fields | NOT STARTED | | |
| T-303 | Worker: DB-polled loop + drain-and-exit mode (`worker:once`) | Crash mid-job resumes idempotently | NOT STARTED | | |
| T-304 | Persist signature pre-confirm; confirm finalized; store slot/blockTime | Retry re-confirms, never re-sends (fault-injection test) | NOT STARTED | | |
| T-305 | Post-confirm re-read verification | Mismatch -> FAILED + alert | NOT STARTED | | |
| T-306 | Failure path: quota restore + FAILED + dashboard surface | Asserted in integration test | NOT STARTED | | |
| T-307 | Manual devnet delivery (human-witnessed) | TXID in Notes; screenshot in docs/evidence/ | NOT STARTED | | |

## P4 — Notice link & certificate — GATE: certificate matches field spec; first-access addendum works; legal-copy PR approved
| ID | Task | Acceptance criteria | Status | SHA | Notes |
|---|---|---|---|---|---|
| T-401 | /n/<token> notice page (cover sheet + viewer/download) | Unauthenticated, unguessable, rate-limited | NOT STARTED | | |
| T-402 | NoticeAccess logging + first-access email + certificate addendum | UTC/IP/UA/geo stored; addendum regenerates | NOT STARTED | | |
| T-403 | Certificate PDF (pdf-lib): caption, file+hash, TXID+explorer, slot/blockTime UTC, addresses, access log, §1746 declaration block | All fields present; deterministic layout | NOT STARTED | | |
| T-404 | Resend emails: NOTIFIED receipt + first-access alert | Asserted via Resend API (test mode) | NOT STARTED | | |
| T-405 | Dashboard: services list, statuses, cert + notice downloads | e2e covers full happy path | NOT STARTED | | |
| T-406 | Legal copy review pass (facilitation language) | PR tagged needs-legal-copy-review approved by human | NOT STARTED | | |

## P5 — Hardening & staging — GATE: tester sign-off on devnet staging; zero open SEV-1/2; e2e green in CI
| ID | Task | Acceptance criteria | Status | SHA | Notes |
|---|---|---|---|---|---|
| T-501 | Rate limits; app-wallet balance monitor + low-SOL alert; error surfaces; audit-log viewer | Alert fires below 0.2 SOL on devnet | NOT STARTED | | |
| T-502 | Playwright e2e suite in CI | Green 3 consecutive runs | NOT STARTED | | |
| T-503 | Staging: Vercel Hobby + Neon branch + R2 + devnet; worker-drain.yml schedule + workflow_dispatch | Tester URL live; seed loaded; manual drain works | NOT STARTED | | |
| T-504 | Execute docs/TESTER_SCRIPT.md; triage tester issues | Zero open SEV-1/2 | NOT STARTED | | |

## P6 — v1.5 NFT Service Token (optional) — GATE: NFT visible in devnet wallet; integration green
| ID | Task | Acceptance criteria | Status | SHA | Notes |
|---|---|---|---|---|---|
| T-601 | Token-2022 mint + metadata + airdrop to recipient ATA behind ChainAdapter | NFT visible in devnet wallet; cert notes mint address | NOT STARTED | | |

## Blockers
(Claude: link docs/blockers/ files here)

## ADR index
(Claude: link docs/adr/ files here)
