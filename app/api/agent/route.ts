import { NextResponse } from 'next/server';
import { getAgentENSName, getAgentTextRecord } from '@/lib/ens/ENSResolver';

/**
 * GET /api/agent — the public agent card advertised by the `agent.endpoint`
 * ENSIP-25 text record on the agent's ENS name. Returns the agent's identity,
 * capabilities, and the proof rails it uses (ENS + Hedera HCS/HTS) so other
 * agents / verifiers can discover what this agent does.
 */
export async function GET() {
  const agentENSName = await getAgentENSName();
  const agentAddress = process.env.EVM_APP_WALLET_ADDRESS ?? null;

  let did = agentENSName ? `did:ens:${agentENSName}` : null;
  if (agentENSName) {
    const onChainDid = await getAgentTextRecord(agentENSName, 'agent.did');
    if (onChainDid) did = onChainDid;
  }

  return NextResponse.json({
    name: 'EPS — E-Process Server',
    description:
      'AI-powered legal process server. Facilitates service of process and generates ' +
      'court-ready proof of delivery anchored on Hedera HCS, with an ENS agent identity.',
    ens: agentENSName,
    address: agentAddress,
    did,
    category: 'legal',
    version: '1.0.0',
    capabilities: ['service-of-process', 'proof-of-delivery', 'hedera-hcs-anchor', 'hts-nft-receipt'],
    proofRails: {
      ens: { ensip25: true, ensip26: true },
      hedera: { hcsTopicId: process.env.HEDERA_HCS_TOPIC_ID ?? null, htsTokenId: process.env.HEDERA_NFT_TOKEN_ID ?? null },
    },
    endpoints: {
      resolve: '/api/ens/resolve',
      agentIdentity: '/api/ens/agent',
      hederaStatus: '/api/hedera/status',
    },
  });
}
