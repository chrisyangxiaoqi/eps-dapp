import { NextResponse } from 'next/server'
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'
import { normalize } from 'viem/ens'

const client = createPublicClient({
  chain: mainnet,
  transport: http(
    process.env.NEXT_PUBLIC_ALCHEMY_URL ??
    'https://eth-mainnet.g.alchemy.com/v2/demo'
  ),
})

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const raw = (searchParams.get('name') ?? searchParams.get('q') ?? '').trim()

  if (!raw || raw.length < 3) {
    return NextResponse.json({ error: 'input required, min 3 chars' }, { status: 400 })
  }

  if (!raw.includes('.')) {
    return NextResponse.json({ error: 'must be a valid ENS name e.g. vitalik.eth' }, { status: 400 })
  }

  try {
    const name = normalize(raw)
    const address = await client.getEnsAddress({ name })
    if (!address) {
      return NextResponse.json({ error: 'name not found or not registered' }, { status: 404 })
    }
    return NextResponse.json({ name: raw, address })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'resolution failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
