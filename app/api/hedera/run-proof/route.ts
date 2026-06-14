/**
 * app/api/hedera/run-proof/route.ts
 *
 * POST /api/hedera/run-proof?token=eps-bounty-2026
 *
 * Generates a LIVE Hedera bounty proof against the production-configured operator:
 *   1. Submits an HCS consensus message to HEDERA_HCS_TOPIC_ID.
 *   2. Mints + transfers a proof-of-service NFT (real HTS token transfer) via
 *      mintAndTransferProofNFT (see lib/hedera/mintAndTransferProofNFT.ts).
 *
 * The NFT step is best-effort: if the mint/transfer fails we still return the
 * HCS data (partial proof) rather than throwing — CLAUDE.md hard rule: a Hedera
 * HTS failure must never fail the consensus anchor.
 *
 * SERVER-SIDE ONLY. Reads credentials from env (CLAUDE.md hard rule #1 — never
 * hard-coded): HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY, HEDERA_HCS_TOPIC_ID,
 * HEDERA_NFT_TOKEN_ID, HEDERA_NETWORK.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  Client,
  PrivateKey,
  TopicId,
  TopicMessageSubmitTransaction,
} from "@hashgraph/sdk";
import { mintAndTransferProofNFT } from "@/lib/hedera/mintAndTransferProofNFT";

export const runtime = "nodejs";
export const maxDuration = 60;

const BOUNTY_TOKEN = "eps-bounty-2026";
const PROOF_ENS = "youhavebeenserved.eth";

export async function POST(req: NextRequest) {
  // Simple bounty auth: ?token=eps-bounty-2026
  if (req.nextUrl.searchParams.get("token") !== BOUNTY_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;
  const topicId = process.env.HEDERA_HCS_TOPIC_ID;
  if (!operatorId || !operatorKey || !topicId) {
    const missing = [
      !operatorId && "HEDERA_OPERATOR_ID",
      !operatorKey && "HEDERA_OPERATOR_KEY",
      !topicId && "HEDERA_HCS_TOPIC_ID",
    ].filter(Boolean);
    return NextResponse.json(
      { error: "Hedera not configured", missing },
      { status: 503 },
    );
  }

  const timestamp = new Date().toISOString();
  const isMainnet = process.env.HEDERA_NETWORK === "mainnet";

  // (1) Submit the HCS consensus message with the bounty proof payload.
  const client = isMainnet ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(operatorId, PrivateKey.fromStringDer(operatorKey));

  let hcsTxId: string;
  let hcsSequenceNumber: number;
  try {
    const message = JSON.stringify({
      app: "EPS",
      event: "bounty-proof",
      ens: PROOF_ENS,
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
    console.error("[run-proof] HCS submit failed:", err);
    return NextResponse.json(
      { error: "HCS submit failed", detail: String(err) },
      { status: 502 },
    );
  } finally {
    client.close();
  }

  // (2) Mint + transfer the proof-of-service NFT. Best-effort: on any failure we
  // return the HCS data we already have rather than throwing.
  let nftTokenId: string | null = null;
  let nftSerial: number | null = null;
  let nftTransferTx: string | null = null;
  let mintError: string | null = null;
  try {
    const nft = await mintAndTransferProofNFT({
      caseId: "bounty-proof",
      hcsTopicId: topicId,
      hcsSequenceNumber,
    });
    if (nft) {
      nftTokenId = nft.tokenId;
      nftSerial = nft.serial;
      nftTransferTx = nft.transferTx;
    }
  } catch (err) {
    console.error("[run-proof] NFT mint/transfer failed (returning HCS-only proof):", err);
    mintError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({
    hcsTxId,
    hcsSequenceNumber,
    nftTokenId,
    nftSerial,
    nftTransferTx,
    mintError,
    timestamp,
  });
}
