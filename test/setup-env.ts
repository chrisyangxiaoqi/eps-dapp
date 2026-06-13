/**
 * Vitest global setup (T-508). Provides non-secret STUB env vars so modules that
 * validate the environment at import time — `lib/env` (imported by the Prisma
 * client) and `lib/email/resend-client` (`new Resend(key)`) — load cleanly under
 * the unit suite without real credentials.
 *
 * These are placeholders, NOT secrets (hard rule #1). `??=` preserves any value
 * already supplied by the surrounding environment (e.g. CI), so real runs win.
 */
process.env.DATABASE_URL ??= "postgresql://stub:stub@localhost:5432/stub";
process.env.RESEND_API_KEY ??= "STUB_NOT_A_SECRET";
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??= "STUB_NOT_A_SECRET";
process.env.CLERK_SECRET_KEY ??= "STUB_NOT_A_SECRET";
process.env.STRIPE_SECRET_KEY ??= "STUB_NOT_A_SECRET";
process.env.STRIPE_WEBHOOK_SECRET ??= "STUB_NOT_A_SECRET";
