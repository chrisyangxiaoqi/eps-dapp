# T105 - Stripe Integration - Payments Working End-to-End

Status: PENDING
Depends on: T101
Estimated turns: 35

## Goal
A filer can pay via Stripe. Webhook correctly marks order as paid and triggers delivery.

## Steps

1. Verify env vars: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
   Check with: grep -r "stripe" app/ lib/ --include="*.ts" -l

2. Complete webhook handler at app/api/webhooks/stripe/route.ts
   - Verify signature: stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)
   - Deduplicate: check WebhookEvent table for event.id before processing
   - On payment_intent.succeeded: update ServiceRequest.status = PAID, create DeliveryJob
   - Log event to WebhookEvent table
   - Return 200 { received: true }

3. Add WebhookEvent model to prisma/schema.prisma if missing:
   model WebhookEvent {
     id            String   @id @default(uuid())
     stripeEventId String   @unique
     type          String
     createdAt     DateTime @default(now())
   }
   Then: pnpm prisma migrate dev --name add_webhook_event

4. Test locally with Stripe CLI:
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   stripe trigger payment_intent.succeeded
   Assert: ServiceRequest.status changes to PAID

5. Write unit tests at __tests__/webhooks/stripe.test.ts:
   - Valid payment_intent.succeeded -> 200, order PAID
   - Invalid signature -> 400
   - Duplicate event -> 200 idempotent

6. Commit:
   git add -A && git commit -m "feat(T105): stripe webhook - payment_intent.succeeded -> PAID + DeliveryJob"

## Definition of Done
- Webhook verifies signature and deduplicates
- WebhookEvent table exists
- Unit tests pass
- Local stripe trigger works
- Mark this file Status: DONE and commit
