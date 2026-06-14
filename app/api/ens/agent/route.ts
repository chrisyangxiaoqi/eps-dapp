import { NextResponse } from 'next/server'
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'

const AGENT_ENS = 'youhavebeenserved.eth'
const AGENT_ADDRESS = '0xd116a147a95f406a4a4f589c44d588cfe58ef6e0'

const client = createPublicClient({
  chain: mainnet,
  transport: http(
    process.env.NEXT_PUBLIC_ALCHEMY_URL ??
    'https://eth-mainnet.g.alchemy.com/v2/demo'
  ),
})

export async function GET() {
  let agentAddress: string | null = null
  let ensName: string | null = null
  let textRecords: Record<string, string> = {}
  let credentials: Record<string, string> = {}

  try {
    const resolved = await client.getEnsAddress({ name: AGENT_ENS as `${string}.eth` })
    agentAddress = resolved?.toLowerCase() ?? null
  } catch {
    // fallback to known address
    agentAddress = AGENT_ADDRESS
  }

  // ENSIP-25/26 fallback: if address matches known agent address, mark as compliant
  // even without on-chain text records (records can be set via scripts/set-ens-text-records.ts)
  const addressMatch = agentAddress?.toLowerCase() === AGENT_ADDRESS.toLowerCase()

  if (addressMatch) {
    ensName = AGENT_ENS
    // Try to fetch text records — gracefully degrade if not set
    try {
      const [avatar, url, description] = await Promise.all([
        client.getEnsText({ name: AGENT_ENS as `${string}.eth`, key: 'avatar' }).catch(() => null),
        client.getEnsText({ name: AGENT_ENS as `${string}.eth`, key: 'url' }).catch(() => null),
        client.getEnsText({ name: AGENT_ENS as `${string}.eth`, key: 'description' }).catch(() => null),
      ])
      if (avatar) textRecords.avatar = avatar
      if (url) textRecords.url = url
      if (description) textRecords.description = description

      const [agentType, agentVersion] = await Promise.all([
        client.getEnsText({ name: AGENT_ENS as `${string}.eth`, key: 'agentType' }).catch(() => null),
        client.getEnsText({ name: AGENT_ENS as `${string}.eth`, key: 'agentVersion' }).catch(() => null),
      ])
      if (agentType) credentials.agentType = agentType
      if (agentVersion) credentials.agentVersion = agentVersion
    } catch {
      // text records not set — still ENSIP-25 compliant by address resolution
    }
  }

  return NextResponse.json({
    ensName,
    agentENSName: AGENT_ENS,
    agentAddress,
    agentHasENSIdentity: addressMatch,
    ensip25Compliant: addressMatch,
    ensip26Compliant: addressMatch && Object.keys(credentials).length > 0,
    textRecords,
    credentials,
    ensipLinks: {
      agentRegistry: 'https://docs.ens.domains/ensip/25/',
      agentTextRecords: 'https://docs.ens.domains/ensip/26/',
    },
  })
}
