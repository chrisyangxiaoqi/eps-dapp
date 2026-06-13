# T103 - API Route Integration Tests - All Green

Status: PENDING
Depends on: T101, T102
Estimated turns: 40

## Goal
Every API route returns correct HTTP status for valid and invalid inputs.
Run via: pnpm test:integration --run

## Routes to Test

GET /api/ens/resolve -> tests/integration/ens-resolve.test.ts
- Mock ENSResolver (do not hit mainnet)
- ?input=vitalik.eth -> 200; ?input=0xd8dA... -> 200; missing input -> 400; unresolvable -> 404

GET /api/ens/agent -> tests/integration/ens-agent.test.ts
- Returns 200 with { agentAddress, agentENSName, ensip25Url, ensip26Url }
- If EPS_AGENT_ENS_NAME not configured -> 200 with graceful fallback

POST /api/payments/flow-session -> tests/integration/payments-flow.test.ts
- Without auth -> 401
- With auth, DYNAMIC_BEARER_TOKEN unset -> 503 (NOT 500)
- Response body has { error, retryAfter }

POST /api/payments/dynamic-webhook -> tests/integration/payments-webhook.test.ts
- Missing signature -> 400; invalid signature -> 401; valid payload -> 200

POST /api/service-requests -> tests/integration/service-requests.test.ts
- Valid with ENS recipient -> 201 with ensDisplayName
- Valid with plain address -> 201
- Invalid address -> 422

## Steps
1. cat vitest.integration.config.ts
2. Write the 5 test files above
3. pnpm test:integration --run 2>&1
4. Fix all failures
5. git add -A && git commit -m "test(T103): integration tests for all new API routes - all green"

## Definition of Done
- pnpm test:integration --run exits 0
- All routes covered with auth tests
- Mark this file Status: DONE and commit
