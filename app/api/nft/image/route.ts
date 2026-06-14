/**
 * GET /api/nft/image?topic=0.0.9225885&seq=8
 *
 * Renders a 400x400 SVG "Proof of Service" certificate that HashScan displays as
 * the NFT image (referenced from /api/nft/meta). Built by string concatenation
 * (no nested template literals) so the topic/seq values drop in cleanly (issue #161).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const topic = searchParams.get("topic") ?? "0.0.9225885";
  const seq = searchParams.get("seq") ?? "0";

  // Escape any XML-significant characters from the query values.
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const topicSafe = esc(topic);
  const seqSafe = esc(seq);

  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">' +
    // Background gradient
    "<defs>" +
    '<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#0a0e1a"/>' +
    '<stop offset="1" stop-color="#0d1526"/>' +
    "</linearGradient>" +
    "</defs>" +
    '<rect x="0" y="0" width="400" height="400" rx="16" fill="url(#bg)"/>' +
    // Double gold border
    '<rect x="10" y="10" width="380" height="380" rx="12" fill="none" stroke="#f59e0b" stroke-width="2" opacity="0.6"/>' +
    '<rect x="18" y="18" width="364" height="364" rx="10" fill="none" stroke="#f59e0b" stroke-width="1" opacity="0.3"/>' +
    // Purple Hedera "H"
    '<g transform="translate(174,38)">' +
    '<rect x="0" y="0" width="8" height="28" rx="2" fill="#8b5cf6"/>' +
    '<rect x="18" y="0" width="8" height="28" rx="2" fill="#8b5cf6"/>' +
    '<rect x="0" y="10" width="26" height="8" rx="2" fill="#8b5cf6"/>' +
    "</g>" +
    // HEDERA TESTNET
    '<text x="200" y="84" font-family="Arial, sans-serif" font-size="9" fill="#8b5cf6" text-anchor="middle" letter-spacing="4">HEDERA TESTNET</text>' +
    // Gold divider
    '<line x1="60" y1="94" x2="340" y2="94" stroke="#f59e0b" stroke-width="1" opacity="0.4"/>' +
    // EPS
    '<text x="200" y="148" font-family="Arial, sans-serif" font-size="66" font-weight="900" fill="#f59e0b" text-anchor="middle">EPS</text>' +
    // PROOF OF SERVICE
    '<text x="200" y="172" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#e2e8f0" text-anchor="middle" letter-spacing="3">PROOF OF SERVICE</text>' +
    // Gold divider
    '<line x1="60" y1="183" x2="340" y2="183" stroke="#f59e0b" stroke-width="1" opacity="0.4"/>' +
    // Seal
    '<circle cx="200" cy="230" r="36" fill="none" stroke="#f59e0b" stroke-width="2" opacity="0.5"/>' +
    '<circle cx="200" cy="230" r="30" fill="none" stroke="#f59e0b" stroke-width="1" opacity="0.25"/>' +
    '<path d="M186 230 L196 242 L216 218" fill="none" stroke="#f59e0b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
    // HCS data
    '<text x="200" y="292" font-family="Arial, sans-serif" font-size="9" fill="#94a3b8" text-anchor="middle" letter-spacing="2">HCS TOPIC</text>' +
    '<text x="200" y="310" font-family="monospace" font-size="12" font-weight="700" fill="#34d399" text-anchor="middle">' +
    topicSafe +
    "</text>" +
    '<text x="200" y="326" font-family="Arial, sans-serif" font-size="9" fill="#94a3b8" text-anchor="middle" letter-spacing="2">SEQUENCE #' +
    seqSafe +
    "</text>" +
    // Gold divider
    '<line x1="60" y1="330" x2="340" y2="330" stroke="#f59e0b" stroke-width="1" opacity="0.4"/>' +
    // ENS + standard
    '<text x="200" y="350" font-family="monospace" font-size="9" fill="#60a5fa" text-anchor="middle">youhavebeenserved.eth</text>' +
    '<text x="200" y="364" font-family="Arial, sans-serif" font-size="7.5" fill="#64748b" text-anchor="middle" letter-spacing="1">ENSIP-25 COMPLIANT AI PROCESS SERVER</text>' +
    // Decorative gold circles
    '<circle cx="167" cy="378" r="2" fill="#f59e0b"/>' +
    '<circle cx="182" cy="378" r="2" fill="#f59e0b"/>' +
    '<circle cx="200" cy="378" r="3" fill="#f59e0b"/>' +
    '<circle cx="218" cy="378" r="2" fill="#f59e0b"/>' +
    '<circle cx="233" cy="378" r="2" fill="#f59e0b"/>' +
    "</svg>";

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
