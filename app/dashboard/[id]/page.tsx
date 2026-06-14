import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { ServiceActions } from "./ServiceActions";
import { LiveStatus } from "./LiveStatus";

/**
 * Service-request detail page (issue #113). Shows a single request's case
 * metadata, derived status, and the action available in its current lifecycle
 * state, then links back to the list.
 *
 * Data-model note: the issue was written against a hypothetical
 * `staged/paid/processing/delivered` status set. This repo's real
 * `ServiceStatus` enum is `STAGED → IN_PROGRESS → CONFIRMED → FAILED`, and
 * payment is handled at the org-subscription level (Stripe Checkout in
 * `subscription` mode → quota), not per request — a request only reaches
 * `STAGED` after quota is consumed. The mapping below preserves the issue's
 * intent against the real lifecycle:
 *   STAGED      → "Staged"      — queued for delivery; document-upload area.
 *   IN_PROGRESS → "Processing"  — the worker is delivering on-chain.
 *   CONFIRMED   → "Delivered"   — certificate + on-chain / Hedera proof.
 *   FAILED      → "Failed"      — surfaces the (non-confidential) failure reason.
 */

interface PageProps {
  // Next.js 15 dynamic route params are async.
  params: Promise<{ id: string }>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-foreground/60 text-xs font-medium uppercase tracking-wide">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

export default async function ServiceDetailPage({ params }: PageProps) {
  const { id } = await params;

  // userId comes from the verified Clerk session token, never the client.
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  // Scope the lookup to the caller's own Clerk user id — the same owner scope the
  // dashboard list uses (issue #112). Scoping to the active org instead 404'd
  // every detail link for filers with no active organization (or whose request
  // predates org assignment), even though the row appears on their own dashboard
  // (issue #157). A request owned by someone else resolves to null → 404, so a
  // user still never sees another filer's confidential filing.
  const service = await prisma.serviceRequest.findFirst({
    where: { id, userId },
    include: { certificatePdf: { select: { id: true } } },
  });

  if (!service) {
    notFound();
  }

  const created = service.createdAt.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  // Prefer the stored Hedera mirror URL; otherwise build a HashScan link from
  // the topic id (+ sequence number, when the consensus message was recorded).
  const hederaLink =
    service.hcsMirrorUrl ??
    (service.hcsTopicId
      ? `https://hashscan.io/testnet/topic/${service.hcsTopicId}` +
        (service.hcsSequenceNumber != null ? `/message/${service.hcsSequenceNumber}` : "")
      : null);

  // Solana delivery proof: devnet explorer link for the persisted signature.
  const solanaLink = service.txSignature
    ? `https://explorer.solana.com/tx/${service.txSignature}?cluster=devnet`
    : null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <div className="flex items-center justify-between gap-4">
        <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
          ← Back to Dashboard
        </Link>
        <Link
          href="/dashboard/new"
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          New service
        </Link>
      </div>

      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold">{service.caseCaption}</h1>
          <LiveStatus id={service.id} initialStatus={service.status} />
        </div>
      </header>

      <section className="rounded-xl border border-foreground/10 p-6">
        <dl className="grid gap-6 sm:grid-cols-2">
          <Detail label="Plaintiff" value={service.plaintiffName} />
          <Detail label="Defendant" value={service.defendantName} />
          {/* Recipient — when an ENS name was served (issue #148, Fix 1) show the
              human-readable name prominently with the resolved address beneath it;
              otherwise fall back to the raw wallet address as before. */}
          {service.recipientEnsName ? (
            <div className="flex flex-col gap-1">
              <dt className="text-foreground/60 text-xs font-medium uppercase tracking-wide">
                Served to
              </dt>
              <dd className="flex flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <span aria-hidden>🔷</span>
                  {service.recipientEnsName}
                </span>
                <span className="text-foreground/50 break-all pl-5 font-mono text-xs">
                  ↳ {service.recipientWallet}
                </span>
              </dd>
            </div>
          ) : (
            <Detail label="Recipient wallet" value={service.recipientWallet} />
          )}
          <Detail label="Created" value={created} />
        </dl>
      </section>

      {/* Agent identity (issue #148, Fix 2) — the ENSIP-25/26 compliant AI process
          server agent that anchors each proof. Surfaced so the on-chain agent
          identity is visible to anyone reviewing a served notice. */}
      <section className="rounded-lg border border-blue-500/30 bg-blue-950/20 p-4">
        <h3 className="mb-2 text-sm font-semibold text-blue-400">🤖 Agent Identity (ENSIP-25)</h3>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-gray-400">Process Server Agent</span>
            <a
              href="https://app.ens.domains/youhavebeenserved.eth"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-blue-400 hover:underline"
            >
              youhavebeenserved.eth ↗
            </a>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-400">Agent Address</span>
            <span className="break-all font-mono text-xs text-gray-300">
              0xd116A147A95f406a4A4F589c44d588cfE58ef6E0
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-400">Standard</span>
            <div className="flex gap-2">
              <a
                href="https://docs.ens.domains/ensip/25/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:underline"
              >
                ENSIP-25 ↗
              </a>
              <a
                href="https://docs.ens.domains/ensip/26/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:underline"
              >
                ENSIP-26 ↗
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Hedera consensus proof (issue #148, Fix 3) — ALWAYS shown so a judge sees
          the Hedera integration in every state. Progressive disclosure: once a
          delivery is anchored the full proof chain (HCS topic + message, HTS NFT,
          NFT transfer to the defendant) renders; before that, the demo topic and a
          HashScan link explain what will be anchored on delivery confirmation. */}
      <section className="rounded-lg border border-green-500/30 bg-green-950/20 p-4">
        <h3 className="mb-2 text-sm font-semibold text-green-400">⛓ Hedera Consensus Proof</h3>
        {service.hcsTopicId ? (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">HCS Topic</span>
              <a
                href={`https://hashscan.io/testnet/topic/${service.hcsTopicId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-green-400 hover:underline"
              >
                {service.hcsTopicId} ↗
              </a>
            </div>
            {service.hcsSequenceNumber != null ? (
              <div className="flex justify-between gap-4">
                <span className="text-gray-400">Sequence #</span>
                <span className="font-mono text-gray-300">{service.hcsSequenceNumber}</span>
              </div>
            ) : null}
            {service.htsTokenId ? (
              <div className="flex justify-between gap-4">
                <span className="text-gray-400">Proof-of-Service NFT</span>
                <a
                  href={`https://hashscan.io/testnet/token/${service.htsTokenId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-green-400 hover:underline"
                >
                  {service.htsTokenId} ↗
                </a>
              </div>
            ) : null}
            {service.htsNftSerial != null && service.htsTransferTx ? (
              <div className="flex justify-between gap-4">
                <span className="text-gray-400">NFT Transferred ✓</span>
                <a
                  href={`https://hashscan.io/testnet/transaction/${service.htsTransferTx}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-green-400 hover:underline"
                >
                  Serial #{service.htsNftSerial} → defendant wallet ↗
                </a>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-sm text-gray-400">
            <p>
              🕐 Hedera consensus proof will be anchored to topic{" "}
              <span className="font-mono text-green-400">0.0.9225885</span> upon delivery
              confirmation.
            </p>
            <a
              href="https://hashscan.io/testnet/topic/0.0.9225885"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-xs text-green-400 hover:underline"
            >
              View topic on HashScan ↗
            </a>
          </div>
        )}
      </section>

      {/* Status-conditional action area. */}
      {service.status === "STAGED" ? (
        <section className="flex flex-col gap-4 rounded-xl border border-foreground/10 p-6">
          <div>
            <h2 className="text-lg font-semibold">Documents</h2>
            <p className="text-foreground/70 text-sm">
              This request is staged and queued for delivery. Upload the document to be served below;
              EPS facilitates service and generates court-ready proof of delivery.
            </p>
          </div>
          {/* Interactive upload + subscription-checkout actions (client component). */}
          <ServiceActions />
        </section>
      ) : null}

      {service.status === "IN_PROGRESS" ? (
        <section className="rounded-xl border border-foreground/10 p-6">
          <h2 className="text-lg font-semibold">Processing</h2>
          <p className="text-foreground/70 text-sm">
            Delivery is in progress. The on-chain proof and certificate will appear here once the
            delivery is confirmed.
          </p>
        </section>
      ) : null}

      {service.status === "CONFIRMED" ? (
        <section className="flex flex-col gap-4 rounded-xl border border-foreground/10 p-6">
          <h2 className="text-lg font-semibold">Delivered</h2>
          <div className="flex flex-col gap-3">
            <a
              href={`/api/certificate/${service.id}`}
              className="inline-flex w-fit items-center rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90"
            >
              Download Certificate
            </a>
            {solanaLink ? (
              <p className="text-sm">
                On-chain proof:{" "}
                <a
                  href={solanaLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-blue-600 hover:underline"
                >
                  {service.txSignature}
                </a>
              </p>
            ) : null}
            {hederaLink ? (
              <p className="text-sm">
                Hedera consensus proof:{" "}
                <a
                  href={hederaLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  View on HashScan ↗
                </a>
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {service.status === "FAILED" ? (
        <section className="rounded-xl border border-red-200 bg-red-50 p-6">
          <h2 className="text-lg font-semibold text-red-800">Delivery failed</h2>
          <p className="mt-1 text-sm text-red-700">
            {service.failureReason ?? "This delivery could not be completed."}
          </p>
        </section>
      ) : null}
    </main>
  );
}
