import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { prisma } from "@/lib/db";

/**
 * Certificate PDF generation (T-403).
 *
 * Produces a single-page A4 certificate for a served notice: the case caption,
 * the served document's SHA-256, the on-chain proof (tx signature + devnet
 * explorer link + slot + blockTime), and the first-view record (or "Not yet
 * viewed"). The layout is deterministic — fields are drawn top-down at fixed
 * coordinates so the same notice always renders the same document.
 *
 * The certificate is a court-facing artefact: it carries only the proof fields
 * the public cover sheet already exposes plus the document digest — never the
 * document bytes themselves, and only the MASKED viewer IP (hard rule #3).
 */

/** The fields the certificate renders, fetched from the notice + its addendum. */
interface CertificateData {
  caseCaption: string;
  plaintiffName: string;
  defendantName: string;
  recipientWallet: string;
  documentSha256: string | null;
  txSignature: string | null;
  slot: bigint | null;
  blockTime: Date | null;
  noticeToken: string | null;
  firstViewedAt: Date | null;
  firstViewerIp: string | null;
  // Hedera fields (Phase 3)
  hcsTopicId: string | null;
  hcsSequenceNumber: number | null;
  hcsConsensusTime: string | null;
  hcsMirrorUrl: string | null;
  htsTokenId: string | null;
  htsSerialNumber: number | null;
  htsMirrorUrl: string | null;
}

/** A4 page size in PDF points. */
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 56;

/** Devnet explorer link for a signature (never mainnet — hard rule #2). */
function solscanTxUrl(signature: string): string {
  return `https://solscan.io/tx/${signature}?cluster=devnet`;
}

/** Format a date in UTC, e.g. `2026-06-13 01:34:56 UTC`. */
function formatUtc(when: Date): string {
  return `${when.toISOString().replace("T", " ").replace(/\.\d+Z$/, "")} UTC`;
}

/**
 * Generate the certificate PDF for a notice and return the raw bytes.
 *
 * @throws when no service request exists for `noticeId`.
 */
export async function generateCertificatePdf(noticeId: string): Promise<Uint8Array> {
  const notice = await prisma.serviceRequest.findUnique({
    where: { id: noticeId },
    select: {
      caseCaption: true,
      plaintiffName: true,
      defendantName: true,
      recipientWallet: true,
      documentSha256: true,
      txSignature: true,
      slot: true,
      blockTime: true,
      noticeToken: true,
      hcsTopicId: true,
      hcsSequenceNumber: true,
      hcsConsensusTime: true,
      hcsMirrorUrl: true,
      htsTokenId: true,
      htsSerialNumber: true,
      htsMirrorUrl: true,
      addendum: { select: { viewedAt: true, viewerIp: true } },
    },
  });

  if (!notice) {
    throw new Error(`No notice found for id ${noticeId}`);
  }

  return renderCertificatePdf({
    caseCaption: notice.caseCaption,
    plaintiffName: notice.plaintiffName,
    defendantName: notice.defendantName,
    recipientWallet: notice.recipientWallet,
    documentSha256: notice.documentSha256,
    txSignature: notice.txSignature,
    slot: notice.slot,
    blockTime: notice.blockTime,
    noticeToken: notice.noticeToken,
    firstViewedAt: notice.addendum?.viewedAt ?? null,
    firstViewerIp: notice.addendum?.viewerIp ?? null,
    hcsTopicId: notice.hcsTopicId,
    hcsSequenceNumber: notice.hcsSequenceNumber,
    hcsConsensusTime: notice.hcsConsensusTime,
    hcsMirrorUrl: notice.hcsMirrorUrl,
    htsTokenId: notice.htsTokenId,
    htsSerialNumber: notice.htsSerialNumber,
    htsMirrorUrl: notice.htsMirrorUrl,
  });
}

/**
 * Render the certificate from already-resolved data. Split out from the DB
 * lookup so it can be unit-tested without a database.
 */
export async function renderCertificatePdf(
  data: CertificateData,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const writer = new LineWriter(page, font, bold);

  writer.heading("EPS NOTICE CERTIFICATE");
  writer.gap();
  writer.paragraph(
    "This certificate facilitates service of process and provides court-ready " +
      "proof of on-chain delivery. It does not itself effect valid legal service.",
  );
  writer.gap();

  writer.section("Case");
  writer.field("Case reference", data.noticeToken ?? "—");
  writer.field("Case title", data.caseCaption);
  writer.field("Plaintiff", data.plaintiffName);
  writer.field("Defendant", data.defendantName);
  writer.field("Recipient wallet", data.recipientWallet);
  writer.gap();

  writer.section("Served document");
  writer.field("Filename", `notice-${data.noticeToken ?? "document"}.pdf`);
  writer.field("SHA-256", data.documentSha256 ?? "—");
  writer.gap();

  writer.section("On-chain proof (Solana devnet)");
  if (data.txSignature) {
    writer.field("Transaction", data.txSignature);
    writer.link("Explorer", solscanTxUrl(data.txSignature));
    writer.field("Slot", data.slot != null ? data.slot.toString() : "—");
    writer.field(
      "Block time (UTC)",
      data.blockTime ? formatUtc(data.blockTime) : "—",
    );
  } else {
    writer.field("Transaction", "Not yet confirmed on-chain");
  }
  writer.gap();

  writer.section("First viewed");
  if (data.firstViewedAt) {
    writer.field("Viewed at (UTC)", formatUtc(data.firstViewedAt));
    writer.field("Viewer IP (masked)", data.firstViewerIp ?? "—");
  } else {
    writer.field("Status", "Not yet viewed");
  }

  if (data.hcsTopicId) {
    writer.gap();
    writer.section("Hedera Consensus Service Timestamp");
    writer.field("Topic ID", data.hcsTopicId);
    writer.field("Sequence number", data.hcsSequenceNumber != null ? String(data.hcsSequenceNumber) : "—");
    writer.field("Consensus time (UTC)", data.hcsConsensusTime ?? "—");
    if (data.hcsMirrorUrl) {
      writer.link("Verify on mirror node", data.hcsMirrorUrl);
    }
  }

  if (data.htsTokenId) {
    writer.gap();
    writer.section("Hedera Proof of Service NFT");
    writer.field("Token ID", data.htsTokenId);
    writer.field("Serial number", data.htsSerialNumber != null ? String(data.htsSerialNumber) : "—");
    if (data.htsMirrorUrl) {
      writer.link("NFT on mirror node", data.htsMirrorUrl);
    }
  }

  writer.footer(`Certificate generated ${formatUtc(new Date())}`);

  return pdf.save();
}

/**
 * Tiny top-down text layout helper: tracks a vertical cursor and draws labelled
 * fields, sections, and links at a fixed left margin so layout is deterministic.
 */
class LineWriter {
  private y: number;
  private readonly black = rgb(0, 0, 0);
  private readonly grey = rgb(0.4, 0.4, 0.4);
  private readonly blue = rgb(0.1, 0.3, 0.8);

  constructor(
    private readonly page: PDFPage,
    private readonly font: PDFFont,
    private readonly bold: PDFFont,
  ) {
    this.y = A4_HEIGHT - MARGIN;
  }

  heading(text: string): void {
    this.y -= 18;
    this.page.drawText(text, {
      x: MARGIN,
      y: this.y,
      size: 18,
      font: this.bold,
      color: this.black,
    });
    this.y -= 8;
  }

  section(text: string): void {
    this.y -= 14;
    this.page.drawText(text, {
      x: MARGIN,
      y: this.y,
      size: 12,
      font: this.bold,
      color: this.black,
    });
    this.y -= 4;
  }

  field(label: string, value: string): void {
    this.y -= 16;
    this.page.drawText(`${label}:`, {
      x: MARGIN,
      y: this.y,
      size: 9,
      font: this.bold,
      color: this.grey,
    });
    this.page.drawText(value, {
      x: MARGIN + 130,
      y: this.y,
      size: 9,
      font: this.font,
      color: this.black,
    });
  }

  link(label: string, url: string): void {
    this.y -= 16;
    this.page.drawText(`${label}:`, {
      x: MARGIN,
      y: this.y,
      size: 9,
      font: this.bold,
      color: this.grey,
    });
    this.page.drawText(url, {
      x: MARGIN + 130,
      y: this.y,
      size: 9,
      font: this.font,
      color: this.blue,
    });
  }

  paragraph(text: string): void {
    const maxWidth = A4_WIDTH - 2 * MARGIN;
    for (const line of wrap(text, this.font, 9, maxWidth)) {
      this.y -= 13;
      this.page.drawText(line, {
        x: MARGIN,
        y: this.y,
        size: 9,
        font: this.font,
        color: this.grey,
      });
    }
  }

  gap(): void {
    this.y -= 8;
  }

  footer(text: string): void {
    this.page.drawText(text, {
      x: MARGIN,
      y: MARGIN,
      size: 8,
      font: this.font,
      color: this.grey,
    });
  }
}

/** Greedy word-wrap to a pixel width for the given font/size. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}
