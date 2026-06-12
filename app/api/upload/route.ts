import { NextResponse } from "next/server";
import { fileTypeFromBuffer } from "file-type";

// file-type inspects raw bytes, so this route must run on the Node runtime.
export const runtime = "nodejs";

/** 25 MB hard cap on a single uploaded document. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Declared MIME whitelist → the magic-byte signatures file-type reports for that
 * format. The declared `Content-Type` of the multipart part is only trusted if
 * the bytes themselves sniff to one of the allowed signatures, so a renamed /
 * spoofed-extension file (e.g. an `.exe` sent as `application/pdf`) is rejected.
 *
 * Note on the legacy `.doc` and modern `.docx` Office formats:
 *  - `.doc` is an OLE2 compound file; file-type reports `application/x-cfb`.
 *  - `.docx` is a ZIP container; file-type peeks inside and reports the precise
 *    OOXML wordprocessing MIME (falling back to `application/zip` on older libs).
 */
const ALLOWED_MIME: Record<string, readonly string[]> = {
  "application/pdf": ["application/pdf"],
  "application/msword": ["application/x-cfb"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip",
  ],
};

/**
 * POST /api/upload — validate an uploaded legal document before it is staged.
 *
 * Enforces, pre-quota:
 *  1. multipart/form-data with a `file` part,
 *  2. size ≤ 25 MB,
 *  3. declared MIME on the document whitelist,
 *  4. magic bytes that actually match the declared MIME (anti-spoofing).
 *
 * Document bytes are never logged (CLAUDE.md hard rule #3). This endpoint only
 * validates; persistence/encryption is T-204/T-205.
 *
 * Body: `multipart/form-data` with field `file`.
 * Returns: `{ ok: true, mime, ext, size }` on success.
 */
export async function POST(req: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data with a 'file' field." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing 'file' field in multipart body." },
      { status: 400 },
    );
  }

  // Reject oversize uploads before reading the whole buffer into memory.
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File exceeds the ${MAX_UPLOAD_BYTES} byte (25 MB) limit.` },
      { status: 413 },
    );
  }

  const declaredMime = file.type;
  const allowedSignatures = ALLOWED_MIME[declaredMime];
  if (!allowedSignatures) {
    return NextResponse.json(
      {
        error:
          "Unsupported file type. Allowed: PDF, Word (.doc), Word (.docx).",
      },
      { status: 415 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = await fileTypeFromBuffer(bytes);

  // The bytes must sniff to a signature consistent with the declared MIME;
  // an unrecognised or mismatched signature means a spoofed file.
  if (!sniffed || !allowedSignatures.includes(sniffed.mime)) {
    return NextResponse.json(
      { error: "File contents do not match the declared file type." },
      { status: 415 },
    );
  }

  return NextResponse.json({
    ok: true,
    mime: declaredMime,
    ext: sniffed.ext,
    size: file.size,
  });
}
