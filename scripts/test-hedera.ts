// scripts/test-hedera.ts — run with: npx tsx scripts/test-hedera.ts
import { config } from 'dotenv';
config({ path: '.env.local' });

import { recordOnHedera } from '../lib/hedera/HederaService';
import { verifyAgentKitAvailable } from '../lib/hedera/HederaAgentKit';

async function main() {
  console.log('Checking Hedera Agent Kit availability...');
  const kitAvailable = await verifyAgentKitAvailable();
  console.log('Agent Kit available:', kitAvailable);

  const payload = {
    deliveryId:   `test-${Date.now()}`,
    documentHash: 'a'.repeat(64),
    caseRef:      '2026-TEST-001',
    servedTo:     '0x0000000000000000000000000000000000000001',
    servedBy:     'eps-test-agent',
  };

  console.log('\nSubmitting to HCS and minting HTS NFT...');
  const result = await recordOnHedera(payload);
  console.log('\nHCS result:', JSON.stringify(result.hcs, null, 2));
  console.log('\nHTS result:', JSON.stringify(result.hts, null, 2));
  console.log('\nBoth succeeded:', result.bothSucceeded);

  if (result.hcs?.mirrorNodeUrl) {
    console.log('\nHCS Mirror Node URL:', result.hcs.mirrorNodeUrl);
  }
  if (result.hts?.mirrorNodeUrl) {
    console.log('\nHTS NFT Mirror Node URL:', result.hts.mirrorNodeUrl);
  }

  if (!result.bothSucceeded) {
    console.log('\nTROUBLESHOOTING:');
    console.log('TOKEN_HAS_NO_SUPPLY_KEY → token created without Supply Key');
    console.log('INVALID_ACCOUNT_ID → check HEDERA_OPERATOR_ID format (0.0.XXXXX)');
    process.exit(1);
  }
}
main().catch(console.error);
