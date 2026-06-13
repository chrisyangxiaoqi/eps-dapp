# T102 - Unit Tests (Vitest) - All Green

Status: PENDING
Depends on: T101
Estimated turns: 40

## Goal
pnpm test exits 0. Every Vitest unit test passes. Coverage for new modules >= 80%.

## Steps

### 1. Run existing tests
pnpm test --run 2>&1
Note every failure.

### 2. Fix failing tests
Fix root cause in source or test. Do NOT skip tests with .skip.

### 3. Write missing unit tests for new modules

#### lib/ens/ENSResolver.ts -> __tests__/ens/ENSResolver.test.ts
- Mock createEnsPublicClient with vi.mock
- Test: resolveAddress('vitalik.eth') returns { address: '0xd8dA...', displayName: 'vitalik.eth' }
- Test: resolveAddress('0xd8dA...') returns primary name via reverse lookup
- Test: invalid input throws ENSResolutionError

#### lib/hedera/HederaService.ts -> __tests__/hedera/HederaService.test.ts
- Mock @hashgraph/sdk Client, TopicMessageSubmitTransaction, TokenMintTransaction
- Test: submitHCSMessage(deliveryId) returns { sequenceNumber, consensusTimestamp, mirrorUrl }
- Test: mintNFT returns { serialNumber, mirrorUrl }
- Test: graceful error when SDK throws (returns null, does not throw)

#### lib/payments/DynamicFlow.ts -> __tests__/payments/DynamicFlow.test.ts
- Mock fetch
- Test: createFlowSession returns null when DYNAMIC_BEARER_TOKEN is unset
- Test: parseFlowWebhook extracts { amount, currency, payer }

#### lib/payments/UnlinkPrivacy.ts -> __tests__/payments/UnlinkPrivacy.test.ts
- Mock dynamic import of @unlink-xyz/sdk
- Test: depositToPrivateAccount calls deposit() with correct args
- Test: graceful failure when SDK throws

#### lib/chain/EVMAdapter.ts -> __tests__/chain/EVMAdapter.test.ts
- Mock viem createPublicClient, createWalletClient
- Test: validateRecipientAddress('0x...') returns { valid: true, normalised: '0x...' }
- Test: validateRecipientAddress('notanaddress') returns { valid: false }

### 4. Run coverage
pnpm test --run --coverage 2>&1 | tail -30

### 5. Commit
git add -A
git commit -m "test(T102): vitest unit tests - all green, coverage >=80% for new modules"

## Definition of Done
- pnpm test --run exits 0
- No .skip or .todo added without explanation
- All new modules have test files
- Mark this file Status: DONE and commit
