import { describe, it, expect } from "vitest";
import { POST, MAX_UPLOAD_BYTES } from "../app/api/upload/route";

// A minimal but structurally valid PDF — file-type sniffs the leading `%PDF-`
// signature and reports `application/pdf`.
const PDF_BYTES = new TextEncoder().encode(
  "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

function uploadRequest(file: File): Request {
  const form = new FormData();
  form.set("file", file);
  return new Request("http://localhost:3000/api/upload", {
    method: "POST",
    body: form,
  });
}

describe("POST /api/upload", () => {
  it("accepts a valid PDF", async () => {
    const file = new File([PDF_BYTES], "complaint.pdf", {
      type: "application/pdf",
    });
    const res = await POST(uploadRequest(file));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      mime: "application/pdf",
      ext: "pdf",
    });
  });

  it("rejects a file larger than the 25 MB cap", async () => {
    // 26 MB of PDF: real magic bytes, but over the limit — must be rejected
    // on size before the contents are ever sniffed.
    const oversize = new Uint8Array(26 * 1024 * 1024);
    oversize.set(PDF_BYTES, 0);
    expect(oversize.byteLength).toBeGreaterThan(MAX_UPLOAD_BYTES);

    const file = new File([oversize], "huge.pdf", { type: "application/pdf" });
    const res = await POST(uploadRequest(file));
    expect(res.status).toBe(413);
  });

  it("rejects a spoofed extension (declared PDF, non-PDF magic bytes)", async () => {
    // PNG signature bytes mislabelled as a PDF — magic-byte check must catch it.
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
    const file = new File([pngBytes], "evil.pdf", { type: "application/pdf" });
    const res = await POST(uploadRequest(file));
    expect(res.status).toBe(415);
    await expect(res.json()).resolves.toMatchObject({
      error: "File contents do not match the declared file type.",
    });
  });
});
