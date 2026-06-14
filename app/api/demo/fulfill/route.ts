import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  Client,
  PrivateKey,
  TopicId,
  TopicMessageSubmitTransaction,
} from "@hashgraph/sdk";
import { mintAndTransferProofNFT } from "@/lib/hedera/mintAndTransferProofNFT";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/demo/fulfill
 *
 * DEMO ONLY (NEXT_PUBLIC_DEMO_MODE === "true"). Runs a LIVE Hedera HCS + HTS
 * proof for a STAGED or IN_PROGRESS service request and advances it to CONFIRMED.
 * Lets ETHGlobal judges see the full end-to-end flow without Stripe.
 *
 * Body: { "id": string }
 * Returns: { id, status, hcsTxId, hcsSequenceNumber, nftSerial, ... }
 */
const Body = z.object({ id: z.string().min(1) });

export async function POST(req: Request): Promise<Response> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let authContext;
  try {
    authContext = await requireUser();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const existing = await prisma.serviceRequest.findFirst({
    where: { id: parsed.data.id, userId: authContext.userId },
    select: { id: true, status: true, caseCaption: true, recipientEnsName: true, recipientWallet: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Service request not found" }, { status: 404 });
  }
  if (existing.status === "CONFIRMED") {
    return NextResponse.json({ error: "Already confirmed", id: existing.id, status: existing.status }, { status: 409 });
  }
  if (existing.status === "FAILED") {
    return NextResponse.json({ error: "Service request has failed; create a new one.", id: existing.id, status: existing.status }, { status: 409 });
  }

  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;
  const topicId = process.env.HEDERA_HCS_TOPIC_ID;
  if (!operatorId || !operatorKey || !topicId) {
    return NextResponse.json({ error: "Hedera not configured" }, { status: 503 });
  }

  const timestamp = new Date().toISOString();
  const isMainnet = process.env.HEDERA_NETWORK === "mainnet";
  const client = isMainnet ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(operatorId, PrivateKey.fromStringDer(operatorKey));

  let hcsTxId: string;
  let hcsSequenceNumber: number;
  try {
    const message = JSON.stringify({
      app: "EPS",
      event: "service-of-process",
      serviceId: existing.id,
      caseCaption: existing.caseCaption,
      recipient: existing.recipientEnsName ?? existing.recipientWallet,
      agent: "youhavebeenserved.eth",
      timestamp,
    });
    const response = await new TopicMessageSubmitTransaction()
      .setTopicId(TopicId.fromString(topicId))
      .setMessage(message)
      .execute(client);
    const receipt = await response.getReceipt(client);
    hcsTxId = response.transactionId.toString();
    hcsSequenceNumber = receipt.topicSequenceNumber?.toNumber() ?? 0;
  } catch (err) {
    client.close();
    console.error("[demo/fulfill] HCS submit failed:", err);
    return NextResponse.json({ error: "HCS submit failed", detail: String(err) }, { status: 502 });
  } finally {
    client.close();
  }

  let nftTokenId: string | null = null;
  let nftSerial: number | null = null;
  let nftTransferTx: string | null = null;
  let mintError: string | null = null;
  try {
    const nft = await mintAndTransferProofNFT({
      caseId: existing.id,
      hcsTopicId: topicId,
      hcsSequenceNumber,
    });
    if (nft) {
      nftTokenId = nft.tokenId;
      nftSerial = nft.serial;
      nftTransferTx = nft.transferTx;
    }
  } catch (err) {
    mintError = err instanceof Error ? err.message : String(err);
  }

  const network = isMainnet ? "mainnet" : "testnet";
  const mirrorBase = `https://hashscan.io/${network}`;

  const updated = await prisma.serviceRequest.update({
    where: { id: existing.id },
    data: {
      status: "CONFIRMED",
      hcsTopicId: topicId,
      hcsSequenceNumber,
      hcsConsensusTime: timestamp,
      hcsTxId,
      hcsMirrorUrl: `${mirrorBase}/topic/${topicId}/messages?seq=${hcsSequenceNumber}`,
      ...(nftTokenId && {
        htsTokenId: nftTokenId,
        htsSerialNumber: nftSerial,
        htsTxId: nftTransferTx,
        htsMirrorUrl: nftSerial ? `${mirrorBase}/token/${nftTokenId}/${nftSerial}` : null,
        htsNftSerial: nftSerial,
        htsTransferTx: nftTransferTx,
      }),
    },
    select: { id: true, status: true, hcsSequenceNumber: true, htsNftSerial: true },
  });

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    hcsTxId,
    hcsSequenceNumber,
    nftSerial,
    nftTransferTx,
    mintError,
    timestamp,
    hashscan: `${mirrorBase}/topic/${topicId}`,
  });
}
