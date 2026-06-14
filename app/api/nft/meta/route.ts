import { NextResponse } from "next/server";

/**
 * GET /api/nft/meta?topic=0.0.9225885&seq=8
 *
 * Hedera HTS NFT metadata JSON. The on-chain NFT metadata is only a ~62-byte
 * URI pointing here (under the 100-byte HTS cap); HashScan fetches this endpoint
 * to render the certificate image + attributes for the judge view (issue #161).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const topic = searchParams.get("topic") ?? "0.0.9225885";
  const seq = searchParams.get("seq") ?? "0";
  const base = "https://eps-dapp.vercel.app";
  return NextResponse.json(
    {
      name: "EPS Proof of Service — HCS #" + seq,
      description:
        "Blockchain proof of service of process anchored on Hedera Consensus Service. Topic " +
        topic +
        ", sequence #" +
        seq +
        ". Delivered by youhavebeenserved.eth — ENSIP-25 compliant AI process server agent.",
      image:
        base + "/api/nft/image?topic=" + encodeURIComponent(topic) + "&seq=" + seq,
      external_url: "https://hashscan.io/testnet/topic/" + topic,
      attributes: [
        { trait_type: "App", value: "EPS — E-Process Server" },
        { trait_type: "HCS Topic", value: topic },
        { trait_type: "HCS Sequence", value: seq },
        { trait_type: "Agent ENS", value: "youhavebeenserved.eth" },
        {
          trait_type: "Agent Address",
          value: "0xd116A147A95f406a4A4F589c44d588cfE58ef6E0",
        },
        { trait_type: "Standard", value: "ENSIP-25 / ENSIP-26" },
        { trait_type: "Network", value: "Hedera Testnet" },
        { trait_type: "Type", value: "Proof of Service NFT" },
      ],
    },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
