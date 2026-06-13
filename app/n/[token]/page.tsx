import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { loadNotice, type NoticeView } from "@/lib/notice";
import { clientIpFromHeaders, rateLimit } from "@/lib/rateLimit";

// Public page: no Clerk auth (the middleware matcher only protects /dashboard).
// Rendered per-request so the rate limiter and lookup run on every hit.
export const dynamic = "force-dynamic";

// Abuse throttle: 20 requests per IP per minute (T-401 acceptance criteria).
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

/** Shorten a Solana address for display: first 4 … last 4. */
function truncateWallet(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

/** Devnet explorer link for a signature (never mainnet — hard rule #2). */
function solscanTxUrl(signature: string): string {
  return `https://solscan.io/tx/${signature}?cluster=devnet`;
}

/** Service date is the on-chain blockTime, shown in UTC. */
function formatUtc(when: Date | null): string {
  if (!when) return "Pending confirmation";
  return `${when.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC")}`;
}

function RateLimited() {
  return (
    <main
      data-status="429"
      className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <h1 className="text-2xl font-bold">Too many requests</h1>
      <p className="text-foreground/60">
        You&apos;ve viewed this notice too many times in a short window. Please
        wait a minute and try again.
      </p>
    </main>
  );
}

function CoverSheet({ request }: { request: NoticeView }) {
  const token = request.noticeToken ?? "";
  return (
    <main
      data-status="200"
      className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 p-8"
    >
      <header className="flex flex-col gap-2 border-b border-foreground/10 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
          Notice of service
        </p>
        <h1 className="text-2xl font-bold">{request.caseCaption}</h1>
        <p className="text-sm text-foreground/60">
          This page facilitates service of process and provides court-ready
          proof of on-chain delivery. It does not itself effect valid legal
          service.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
        <Field label="Plaintiff" value={request.plaintiffName} />
        <Field label="Defendant" value={request.defendantName} />
        <Field
          label="Recipient wallet"
          value={truncateWallet(request.recipientWallet)}
          title={request.recipientWallet}
          mono
        />
        <Field label="Service date (UTC)" value={formatUtc(request.blockTime)} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">On-chain proof</h2>
        {request.txSignature ? (
          <a
            className="break-all text-sm text-blue-600 underline underline-offset-2"
            href={solscanTxUrl(request.txSignature)}
            target="_blank"
            rel="noopener noreferrer"
          >
            View transaction on Solana (devnet): {request.txSignature}
          </a>
        ) : (
          <p className="text-sm text-foreground/60">
            Delivery has not yet been confirmed on-chain.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-foreground/10 p-4">
        <h2 className="text-sm font-semibold">Served document</h2>
        {/* Document viewer is delivered in T-402. The document bytes are never
            served from this page directly; they remain private + encrypted. */}
        <p className="text-sm text-foreground/60">
          A secure viewer for the served document will be available here.
        </p>
      </section>

      <div className="flex flex-wrap gap-3">
        {/* Certificate generation is the T-403 endpoint; this is the link to it. */}
        <a
          className="inline-flex items-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
          href={`/api/n/${token}/certificate`}
        >
          Download certificate
        </a>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  title,
  mono,
}: {
  label: string;
  value: string;
  title?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
        {label}
      </span>
      <span
        className={`text-sm ${mono ? "font-mono" : ""}`}
        title={title}
      >
        {value}
      </span>
    </div>
  );
}

export default async function NoticePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Rate-limit per client IP BEFORE the DB lookup so a flood can't probe tokens.
  const ip = clientIpFromHeaders(await headers());
  const { ok } = rateLimit(`notice:${ip}`, {
    limit: RATE_LIMIT,
    windowMs: RATE_WINDOW_MS,
  });
  if (!ok) return <RateLimited />;

  const request = await loadNotice(token);
  // Unknown / malformed token → 404 (unguessable: 128-bit token, no enumeration).
  if (!request) notFound();

  return <CoverSheet request={request} />;
}
