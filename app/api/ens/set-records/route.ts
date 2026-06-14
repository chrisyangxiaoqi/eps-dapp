import { NextResponse } from 'next/server'
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { namehash, normalize } from 'viem/ens'

const ENS_PUBLIC_RESOLVER = '0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63' as const
const AGENT_ENS = 'youhavebeenserved.eth'
const VALID_TOKEN = 'eps-bounty-2026'

const RESOLVER_ABI = parseAbi([
  'function setText(bytes32 node, string calldata key, string calldata value) external',
])

const TEXT_RECORDS: Record<string, string> = {
  agentType: 'process-server',
  agentVersion: '1.0.0',
  description: 'ENSIP-25 compliant AI legal process server — delivers blockchain-anchored proof of service via Hedera HCS + HTS',
  url: 'https://eps-dapp.vercel.app',
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('token') !== VALID_TOKEN) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Reuse HEDERA_OPERATOR_KEY — same ECDSA key that owns youhavebeenserved.eth
  const rawKey = process.env.EVM_APP_WALLET_PRIVATE_KEY ?? process.env.HEDERA_OPERATOR_KEY
  if (!rawKey) {
    return NextResponse.json({ error: 'No wallet private key configured (EVM_APP_WALLET_PRIVATE_KEY or HEDERA_OPERATOR_KEY)' }, { status: 500 })
  }

  const pk = rawKey.startsWith('0x') ? rawKey as `0x${string}` : `0x${rawKey}` as `0x${string}`

  let account: ReturnType<typeof privateKeyToAccount>
  try {
    account = privateKeyToAccount(pk)
  } catch (e) {
    return NextResponse.json({ error: 'Invalid private key', detail: String(e) }, { status: 500 })
  }

  const rpcUrl = process.env.EVM_RPC_ETH_MAINNET ?? 'https://eth-mainnet.g.alchemy.com/v2/demo'

  const publicClient = createPublicClient({ chain: mainnet, transport: http(rpcUrl) })
  const walletClient = createWalletClient({ account, chain: mainnet, transport: http(rpcUrl) })

  // Check ETH balance first
  const balance = await publicClient.getBalance({ address: account.address })
  const balanceEth = Number(balance) / 1e18

  if (balance < BigInt(1e14)) { // < 0.0001 ETH
    return NextResponse.json({
      error: 'Insufficient ETH for gas',
      address: account.address,
      balanceEth,
      needed: '~0.001 ETH for 2 setText transactions'
    }, { status: 402 })
  }

  const node = namehash(normalize(AGENT_ENS))
  const results: { key: string; value: string; txHash: string }[] = []

  for (const [key, value] of Object.entries(TEXT_RECORDS)) {
    const txHash = await walletClient.writeContract({
      address: ENS_PUBLIC_RESOLVER,
      abi: RESOLVER_ABI,
      functionName: 'setText',
      args: [node, key, value],
    })
    results.push({ key, value, txHash })
  }

  return NextResponse.json({
    success: true,
    address: account.address,
    balanceEth,
    records: results,
    verifyAt: `https://app.ens.domains/${AGENT_ENS}`,
  })
}
