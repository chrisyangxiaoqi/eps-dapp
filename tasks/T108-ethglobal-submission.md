# T108 - ETHGlobal NYC 2026 Submission Assets

Status: PENDING
Depends on: T101-T107
Estimated turns: 25

## Bounties ($37,500 total)
ENS: $20,000 (4 tracks - Integration, ENSIP-25, ENSIP-26, Best Use)
Hedera: $9,000 (2 tracks - HCS, HTS NFT)
Dynamic: $7,000 (3 tracks - Flow, Server Wallet, Best Use)
Unlink: $1,500 (Privacy)

## Steps

### 1. Verify live deployment
curl -s https://eps-dapp.vercel.app/api/health
curl -s "https://eps-dapp.vercel.app/api/ens/resolve?input=vitalik.eth"
Both must return correct JSON.

### 2. Verify zero Solidity
find . -name "*.sol" -not -path "*/node_modules/*"
Must return nothing. This proves no Solidity to Hedera judges.

### 3. Package version proof
pnpm list @ensdomains/ensjs @hashgraph/sdk @hashgraph/hedera-agent-kit @dynamic-labs-wallet/node @unlink-xyz/sdk viem

### 4. Create screenshots directory
mkdir -p docs/screenshots
Required: ens-resolve-api.png, ens-agent-api.png, hedera-hcs-verified.png,
hedera-nft-verified.png, dynamic-payment-tab.png, pdf-certificate.png

### 5. Update README.md with live links section
Add:
## Live Demo
- App: https://eps-dapp.vercel.app
- ENS resolve: https://eps-dapp.vercel.app/api/ens/resolve?input=vitalik.eth
- Repo: https://github.com/matty33/eps-dapp

### 6. Final commit and push
git add -A
git commit -m "chore(T108): ETHGlobal submission assets - screenshots, live links, README"
git push origin main

## HUMAN GATE - Step 6.3
After T108 is complete, PAUSE and output:
"Ready to make repo public for Hedera bounty? Reply yes or no."
Wait for human confirmation before making repo public.

## Definition of Done
- Live URL health check passes
- ENS resolve endpoint returns vitalik.eth address
- Zero .sol files found
- README has live demo links
- docs/screenshots/ populated
- Mark this file Status: DONE and commit
