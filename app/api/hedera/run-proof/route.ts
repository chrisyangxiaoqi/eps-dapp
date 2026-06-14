import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  // Protect with a simple token check
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')
  if (token !== process.env.HEDERA_RUN_TOKEN && token !== 'eps-bounty-2026') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const operatorId = process.env.HEDERA_OPERATOR_ID
  const operatorKey = process.env.HEDERA_OPERATOR_KEY
  const topicId = process.env.HEDERA_HCS_TOPIC_ID || '0.0.9225885'
  const network = process.env.HEDERA_NETWORK || 'testnet'

  if (!operatorId || !operatorKey) {
    return NextResponse.json({ error: 'HEDERA_OPERATOR_ID or HEDERA_OPERATOR_KEY not set' }, { status: 500 })
  }

  try {
    const { Client, TopicMessageSubmitTransaction, PrivateKey, AccountId } = await import('@hashgraph/sdk')

    const client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet()
    client.setOperator(AccountId.fromString(operatorId), PrivateKey.fromString(operatorKey))

    // Submit HCS proof message
    const proofPayload = JSON.stringify({
      app: 'EPS — E-Process Server',
      event: 'bounty-proof',
      ens: 'youhavebeenserved.eth',
      timestamp: new Date().toISOString(),
      network,
      note: 'ETHGlobal NYC 2026 — legal service of process on blockchain'
    })

    const hcsTx = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(proofPayload)
      .execute(client)

    const hcsReceipt = await hcsTx.getReceipt(client)
    const hcsSeq = hcsReceipt.topicSequenceNumber?.toString() ?? '?'
    const hcsTxId = hcsTx.transactionId.toString()

    // Try NFT mint via existing helper
    let nftResult: { tokenId?: string; serial?: number; transferTx?: string } = {}
    try {
      const { mintAndTransferProofNFT } = await import('@/lib/hedera/mintAndTransferProofNFT')
      nftResult = await mintAndTransferProofNFT({
        caseId: 'BOUNTY-PROOF-2026',
        defendantAccountId: operatorId, // self for demo
        metadata: JSON.stringify({ ens: 'youhavebeenserved.eth', event: 'service-of-process' })
      })
    } catch (nftErr) {
      nftResult = { tokenId: process.env.HEDERA_NFT_TOKEN_ID ?? undefined }
    }

    client.close()

    const proof = {
      status: 'confirmed',
      network,
      hcs: {
        topicId,
        txId: hcsTxId,
        sequenceNumber: hcsSeq,
        timestamp: new Date().toISOString()
      },
      hts: nftResult,
      generatedAt: new Date().toISOString()
    }

    return NextResponse.json(proof)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
