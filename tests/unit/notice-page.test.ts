import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// --- Mocks ----------------------------------------------------------------
// Prisma lookup the page uses via `loadNotice`.
const findUniqueMock = vi.fn<(arg: unknown) => Promise<unknown>>();
vi.mock("@/lib/db", () => ({
  prisma: {
    serviceRequest: { findUnique: (arg: unknown) => findUniqueMock(arg) },
  },
}));

// `headers()` from next/headers — return a real Headers carrying the client IP.
const headersMock = vi.fn<() => Headers>();
vi.mock("next/headers", () => ({ headers: () => headersMock() }));

// `notFound()` throws in Next; emulate with a sentinel we can assert on.
class NotFoundError extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFoundError("NEXT_NOT_FOUND");
  },
}));

import NoticePage from "@/app/n/[token]/page";
import { __resetRateLimit } from "@/lib/rateLimit";

const TOKEN = "a1b2c3d4e5f60718293a4b5c6d7e8f90"; // 32 hex chars (128-bit)
const TX = "5xSig111111111111111111111111111111111111111";

function seededRequest() {
  return {
    id: "svc_1",
    caseCaption: "Acme Corp v. Doe, No. 24-CV-001",
    plaintiffName: "Acme Corp",
    defendantName: "Jane Doe",
    recipientWallet: "9aBcDeFgHiJkLmNoPqRsTuVwXyZ12345678AbCdEfGh",
    status: "CONFIRMED",
    txSignature: TX,
    blockTime: new Date("2026-06-13T12:34:56.000Z"),
    noticeToken: TOKEN,
  };
}

/** Drive the async server component and render it to static HTML. */
async function render(token: string): Promise<string> {
  const element = await NoticePage({ params: Promise.resolve({ token }) });
  return renderToStaticMarkup(element);
}

function headersWithIp(ip: string): Headers {
  return new Headers({ "x-forwarded-for": ip });
}

describe("/n/[token] notice page", () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    headersMock.mockReset();
    __resetRateLimit();
  });

  it("renders the cover sheet for a seeded token", async () => {
    findUniqueMock.mockResolvedValue(seededRequest());
    headersMock.mockReturnValue(headersWithIp("203.0.113.1"));

    const html = await render(TOKEN);

    // Looked up case-insensitively by the (lowercased) notice token.
    expect(findUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { noticeToken: TOKEN } }),
    );
    expect(html).toContain('data-status="200"');
    // Caption + parties present.
    expect(html).toContain("Acme Corp v. Doe, No. 24-CV-001");
    expect(html).toContain("Jane Doe");
    // Recipient wallet shown truncated (first 4 … last 4).
    expect(html).toContain("9aBc…EfGh");
    // Service date in UTC.
    expect(html).toContain("2026-06-13 12:34:56 UTC");
    // Devnet (never mainnet) explorer link to the signature.
    expect(html).toContain(
      `https://solscan.io/tx/${TX}?cluster=devnet`,
    );
    expect(html).not.toContain("mainnet");
    // Certificate download stub points at the T-403 endpoint.
    expect(html).toContain(`/api/n/${TOKEN}/certificate`);
  });

  it("returns 404 (notFound) for an unknown token", async () => {
    findUniqueMock.mockResolvedValue(null);
    headersMock.mockReturnValue(headersWithIp("203.0.113.2"));

    await expect(render(TOKEN)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("returns 404 for a malformed token without hitting the DB", async () => {
    headersMock.mockReturnValue(headersWithIp("203.0.113.3"));

    await expect(render("not-a-valid-token")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("returns 429 once the per-IP rate limit (20/min) is breached", async () => {
    findUniqueMock.mockResolvedValue(seededRequest());
    headersMock.mockReturnValue(headersWithIp("198.51.100.7"));

    // First 20 requests render the cover sheet.
    for (let i = 0; i < 20; i++) {
      const html = await render(TOKEN);
      expect(html).toContain('data-status="200"');
    }

    // The 21st in the same window is rate-limited.
    const limited = await render(TOKEN);
    expect(limited).toContain('data-status="429"');
    expect(limited).toContain("Too many requests");
  });

  it("rate-limits each IP independently", async () => {
    findUniqueMock.mockResolvedValue(seededRequest());

    headersMock.mockReturnValue(headersWithIp("198.51.100.8"));
    for (let i = 0; i < 20; i++) await render(TOKEN);
    expect(await render(TOKEN)).toContain('data-status="429"');

    // A different IP is unaffected.
    headersMock.mockReturnValue(headersWithIp("198.51.100.9"));
    expect(await render(TOKEN)).toContain('data-status="200"');
  });
});
