import { NextResponse } from 'next/server';
import { getAgentENSName, getAgentTextRecord } from '@/lib/ens/ENSResolver';

export async function GET() {
  const agentAddress = process.env.EVM_APP_WALLET_ADDRESS ?? null;
  const agentENSName = await getAgentENSName();
  let credentials: Record<string, string | null> = {};

  if (agentENSName) {
    const [desc, bar, court, url] = await Promise.allSettled([
      getAgentTextRecord(agentENSName, 'description'),
      getAgentTextRecord(agentENSName, 'com.bar-number'),
      getAgentTextRecord(agentENSName, 'com.court-auth'),
      getAgentTextRecord(agentENSName, 'url'),
    ]);
    credentials = {
      description: desc.status === 'fulfilled' ? desc.value : null,
      barNumber:   bar.status === 'fulfilled' ? bar.value : null,
      courtAuth:   court.status === 'fulfilled' ? court.value : null,
      url:         url.status === 'fulfilled' ? url.value : null,
    };
  }

  return NextResponse.json({
    agentAddress,
    agentENSName,
    agentHasENSIdentity: !!agentENSName,
    ensipLinks: {
      agentRegistry:    'https://docs.ens.domains/ensip/25/',
      agentTextRecords: 'https://docs.ens.domains/ensip/26/',
    },
    credentials,
  });
}
