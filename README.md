# EPS — E-Process Server

On-chain legal process service. Court-ready Proof of Service Certificates.
Multi-chain: Solana (live) · Ethereum/Base/Arbitrum/Hedera EVM · Bitcoin (roadmap)

## ETHGlobal NYC 2026 — Hackathon Submission

**Track:** Continuity Track (existing product, new features built this weekend)
**Event:** https://ethglobal.com/events/newyork2026

### Bounty integrations

| Sponsor | Tracks | Prize | What we built |
|---------|--------|-------|---------------|
| ENS | AI Agents + Creative + Pool + Continuity | $20,000 | `createEnsPublicClient` forward/reverse resolution; ENSIP-25/26 agent identity + text records; live form ENS resolution; ENS names on PDF certificates |
| Hedera | No Solidity Allowed + AI & Agentic Payments | up to $9,000 | HCS proof-of-service timestamps + HTS NFT receipts via `@hashgraph/sdk` (zero Solidity); EPS delivery worker is the autonomous agent executing token operations on Hedera Testnet |
| Dynamic | Flow + Agentic Build + Wallet Glow Up | $7,000 | Dynamic Flow any-chain fee acceptance; MPC server wallet via `@dynamic-labs-wallet/node`; Pay with Crypto UI tab |
| Unlink | Add Privacy | $1,500 | `deposit()` pattern for private legal fee payments (package pending npm publish) |

### Multi-chain Architecture

EPS delivers legal process documents to any blockchain wallet:
- **Solana** — live (spl-memo + SystemProgram transfer)
- **EVM chains** — new (viem calldata encoding, EPS_SELECTOR + ABI-encoded ServiceRecord)
- **Bitcoin** — roadmap (OP_RETURN, 80-byte compressed ServiceRecord)
- **Hedera** — new (EVM-compatible + HCS/HTS native services)

### Hedera Testnet Resources

- HCS Topic ID: `HEDERA_HCS_TOPIC_ID` (set in env)
- HTS Token ID: `HEDERA_NFT_TOKEN_ID` (set in env)
- Verify: https://testnet.mirrornode.hedera.com

### Privacy Layer (Unlink)

**Before:** All legal fee payment amounts visible on-chain.
**After:** Unlink `deposit()` shields payment amounts and counterparties from on-chain observers.

### Setup

See `CLAUDE.md`. Requires Node.js 20+, pnpm, Postgres 16.

```env
# EVM / ENS
EVM_APP_WALLET_PRIVATE_KEY=0x...
EVM_APP_WALLET_ADDRESS=0x...
EVM_RPC_ETH_MAINNET=https://eth.llamarpc.com
EVM_RPC_ETH_SEPOLIA=https://rpc.sepolia.org

# Hedera Testnet
HEDERA_OPERATOR_ID=0.0.XXXXX
HEDERA_OPERATOR_KEY=<DER private key>
HEDERA_HCS_TOPIC_ID=0.0.XXXXX
HEDERA_NFT_TOKEN_ID=0.0.XXXXX
HEDERA_NETWORK=testnet

# Dynamic
NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID=<uuid>
DYNAMIC_BEARER_TOKEN=<token>
DYNAMIC_WALLET_PASSWORD=eps-agent-secure-pw-2026
```

---

# BLI E-Process Server (EPS) dApp

Private — work in progress. See `docs/EPS_SOW_v1.1.md` for the full scope of work.

## Quick start

```bash
pnpm install
pnpm db:up        # docker compose: Postgres + MinIO
pnpm db:migrate   # prisma migrate dev
pnpm dev          # Next.js app
pnpm worker       # fulfilment worker
```

See `CLAUDE.md` for the full build guide and `docs/PHASES.md` for task tracking.
