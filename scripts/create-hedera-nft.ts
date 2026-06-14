// scripts/create-hedera-nft.ts — create the EPS proof-of-service NFT collection.
//
// Creates a NON_FUNGIBLE_UNIQUE token on Hedera Token Service (HTS) that EPS
// mints one serial of per delivery (see lib/hedera/HederaService.ts → mintProofNFT).
// Run this ONCE, then add the printed token id to Vercel as HEDERA_NFT_TOKEN_ID.
//
// Requires (read from env — never hard-coded, CLAUDE.md hard rule #1):
//   HEDERA_OPERATOR_ID   — e.g. 0.0.xxxxx
//   HEDERA_OPERATOR_KEY   — DER-encoded private key (operator = treasury + supply key)
//   HEDERA_NETWORK        — "testnet" (default) or "mainnet"
//
// Run:
//   pnpm tsx scripts/create-hedera-nft.ts
//
// Guard: refuses to run against mainnet unless HEDERA_ALLOW_MAINNET=true.

try { process.loadEnvFile('.env.local'); } catch { /* .env.local is optional */ }

import {
  Client,
  PrivateKey,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
} from '@hashgraph/sdk';

async function main() {
  const id = process.env.HEDERA_OPERATOR_ID;
  const key = process.env.HEDERA_OPERATOR_KEY;
  if (!id || !key) throw new Error('HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set.');

  if (process.env.HEDERA_NFT_TOKEN_ID) {
    console.log(`HEDERA_NFT_TOKEN_ID already set (${process.env.HEDERA_NFT_TOKEN_ID}); nothing to do.`);
    return;
  }

  const isMainnet = process.env.HEDERA_NETWORK === 'mainnet';
  if (isMainnet && process.env.HEDERA_ALLOW_MAINNET !== 'true') {
    throw new Error('Refusing to create a token on mainnet. Set HEDERA_ALLOW_MAINNET=true to override.');
  }

  const operatorKey = PrivateKey.fromStringDer(key);
  const client = isMainnet ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(id, operatorKey);

  console.log(`Creating EPS proof-of-service NFT collection on Hedera ${isMainnet ? 'mainnet' : 'testnet'}…`);

  try {
    const tx = await new TokenCreateTransaction()
      .setTokenName('EPS Proof of Service')
      .setTokenSymbol('EPSPOS')
      .setTokenType(TokenType.NonFungibleUnique)
      .setSupplyType(TokenSupplyType.Infinite)
      .setInitialSupply(0)
      .setTreasuryAccountId(id)
      .setSupplyKey(operatorKey)
      .setAdminKey(operatorKey)
      .freezeWith(client);

    const signed = await tx.sign(operatorKey);
    const response = await signed.execute(client);
    const receipt = await response.getReceipt(client);
    const tokenId = receipt.tokenId?.toString();

    console.log(`\n✓ NFT collection created: ${tokenId}`);
    console.log(`\nAdd this to Vercel env:`);
    console.log(`  HEDERA_NFT_TOKEN_ID=${tokenId}`);
    console.log(`\nView: https://hashscan.io/${isMainnet ? 'mainnet' : 'testnet'}/token/${tokenId}`);
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
