# T107 - Production Hardening

Status: PENDING
Depends on: T101-T106
Estimated turns: 30

## Goal
App is secure, observable, and ready for real traffic.

## Security Checklist

### 1. Rate limiting (lib/rate-limit.ts)
- /api/ens/resolve -> 60 req/min per IP
- /api/service-requests -> 10 req/min per user
- Use Upstash Redis or in-memory Map

### 2. Input validation
- grep -r "zod" app/api/ --include="*.ts" -l
- Every POST/PUT route must parse body with Zod schema. Add where missing.

### 3. Auth guard
- Every protected route must call auth() from @clerk/nextjs/server at top
- grep -r "auth()" app/api/ --include="*.ts" -l | wc -l
- Verify all protected routes covered

### 4. Security headers (next.config.ts)
Add headers: X-Content-Type-Options: nosniff, X-Frame-Options: DENY,
Referrer-Policy: strict-origin-when-cross-origin, Permissions-Policy: camera=()

### 5. Secrets scan
pnpm exec gitleaks detect --source . --config .gitleaks.toml
Must return zero findings.

## Observability

### Structured error logging
Every catch block: console.error({ event: 'name', deliveryId, error: err.message })

### Health endpoint
GET /api/health must check DB (SELECT 1) and return:
{ "status": "ok", "db": "connected", "timestamp": "...", "version": "1.0.0" }

## Performance

### DB indexes (prisma/schema.prisma)
@@index([status]) on ServiceRequest
@@index([createdAt]) on ServiceRequest
@@index([stripePaymentIntentId]) on ServiceRequest
Run: pnpm prisma migrate dev --name add_indexes if missing.

## Commit
git add -A && git commit -m "fix(T107): production hardening - rate limits, headers, zod, indexes"

## Definition of Done
- Zero gitleaks findings
- All public routes rate-limited
- All POST/PUT zod-validated
- Security headers present in next.config.ts
- /api/health checks DB
- DB indexes added
- Mark this file Status: DONE and commit
