"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface FieldErrors {
  [field: string]: string[] | undefined;
}

interface ENSResolution {
  address: string | null;
  displayName: string;
  wasENSName: boolean;
  primaryName: string | null;
}

/**
 * An ENS-like name is anything containing a dot that is not already an EVM/0x
 * address — Solana base58 wallets never contain a dot, so a dot is a clean
 * signal that the filer typed a name (e.g. `vitalik.eth`) to resolve. We mirror
 * the /api/ens/resolve floor of 3 characters to avoid pointless round-trips.
 */
function looksLikeENSName(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 3 || /^0x[0-9a-fA-F]{40}$/.test(trimmed)) return false;
  return trimmed.includes(".");
}

/**
 * New service-request intake form (P2/T-203).
 *
 * Collects the case caption and parties, the recipient ENS name or EVM wallet, an
 * optional court-order flag, and a required attestation. All values are
 * re-validated server-side by POST /api/service-requests before any quota is
 * consumed — this form's client checks are purely for fast feedback. Copy is
 * facilitation-safe (CLAUDE.md hard rule #6): EPS facilitates service and
 * generates court-ready proof; it does not "effect valid legal service".
 */
export default function NewServiceRequestPage() {
  const router = useRouter();

  const [caseCaption, setCaseCaption] = useState("");
  const [plaintiffName, setPlaintiffName] = useState("");
  const [defendantName, setDefendantName] = useState("");
  const [recipientWallet, setRecipientWallet] = useState("");
  const [courtOrderFlag, setCourtOrderFlag] = useState(false);
  const [attested, setAttested] = useState(false);

  // Live ENS lookup for the recipient field. `resolvedAddress` holds the
  // on-chain address an ENS name resolved to (submitted alongside the raw
  // input); `ensResolving`/`ensError` drive the inline feedback below the field.
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [ensResolving, setEnsResolving] = useState(false);
  const [ensError, setEnsError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Debounced ENS resolution: 500ms after the filer stops typing an ENS-like
  // name, resolve it. An AbortController cancels any in-flight request so a
  // stale response can never overwrite the latest input's result.
  useEffect(() => {
    const value = recipientWallet.trim();

    if (!looksLikeENSName(value)) {
      setResolvedAddress(null);
      setEnsResolving(false);
      setEnsError(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setEnsResolving(true);
      setEnsError(null);
      setResolvedAddress(null);
      try {
        const res = await fetch(`/api/ens/resolve?input=${encodeURIComponent(value)}`, {
          signal: controller.signal,
        });
        const data: (ENSResolution & { error?: string }) = await res.json();
        if (!res.ok || !data.address) {
          setResolvedAddress(null);
          setEnsError(
            "Could not verify this ENS name right now — you can still submit; the server will re-resolve it.",
          );
        } else {
          setResolvedAddress(data.address);
          setEnsError(null);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setResolvedAddress(null);
        setEnsError(
          "Could not verify this ENS name right now — you can still submit; the server will re-resolve it.",
        );
      } finally {
        // Don't flip off the spinner for a request we just aborted — its
        // replacement is already starting and owns the loading state.
        if (!controller.signal.aborted) setEnsResolving(false);
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [recipientWallet]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      const res = await fetch("/api/service-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseCaption,
          plaintiffName,
          defendantName,
          recipientWallet,
          // When the filer entered an ENS name, send the resolved on-chain
          // address too so the server can record both; null when the input was
          // a plain wallet or did not resolve.
          recipientEnsName: looksLikeENSName(recipientWallet) ? recipientWallet.trim() : null,
          recipientResolvedAddress: resolvedAddress,
          courtOrderFlag,
          attested,
        }),
      });
      const data: { id?: string; error?: string; issues?: FieldErrors } = await res.json();
      if (!res.ok) {
        if (data.issues) setFieldErrors(data.issues);
        throw new Error(data.error ?? "Could not stage the service request.");
      }
      router.push("/dashboard?staged=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not stage the service request.");
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">New service request</h1>
        <p className="text-foreground/70 text-sm">
          EPS facilitates service of process and generates court-ready proof of delivery. Enter the
          case details and the recipient&apos;s ENS name or EVM wallet address below.
        </p>
      </header>

      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
        <Field
          id="caseCaption"
          label="Case caption"
          hint="e.g. Smith v. Jones, No. 24-CV-1234"
          errors={fieldErrors.caseCaption}
        >
          <input
            id="caseCaption"
            name="caseCaption"
            type="text"
            required
            value={caseCaption}
            onChange={(e) => setCaseCaption(e.target.value)}
            className="rounded-lg border border-foreground/20 px-3 py-2 text-sm"
          />
        </Field>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field id="plaintiffName" label="Plaintiff" errors={fieldErrors.plaintiffName}>
            <input
              id="plaintiffName"
              name="plaintiffName"
              type="text"
              required
              value={plaintiffName}
              onChange={(e) => setPlaintiffName(e.target.value)}
              className="rounded-lg border border-foreground/20 px-3 py-2 text-sm"
            />
          </Field>

          <Field id="defendantName" label="Defendant" errors={fieldErrors.defendantName}>
            <input
              id="defendantName"
              name="defendantName"
              type="text"
              required
              value={defendantName}
              onChange={(e) => setDefendantName(e.target.value)}
              className="rounded-lg border border-foreground/20 px-3 py-2 text-sm"
            />
          </Field>
        </div>

        <Field
          id="recipientWallet"
          label="Recipient wallet or ENS name"
          hint="Enter the recipient's ENS name (e.g. vitalik.eth) or EVM wallet address (0x...)"
          errors={fieldErrors.recipientWallet}
        >
          <input
            id="recipientWallet"
            name="recipientWallet"
            type="text"
            required
            spellCheck={false}
            autoComplete="off"
            value={recipientWallet}
            onChange={(e) => setRecipientWallet(e.target.value)}
            className="rounded-lg border border-foreground/20 px-3 py-2 font-mono text-sm"
            aria-describedby="recipientWallet-ens"
          />
          <div id="recipientWallet-ens" aria-live="polite" className="min-h-[1rem]">
            {ensResolving ? (
              <p className="text-foreground/60 flex items-center gap-1.5 text-xs">
                <Spinner />
                Resolving ENS name…
              </p>
            ) : resolvedAddress ? (
              <p className="flex items-center gap-1 text-xs text-green-700">
                <span aria-hidden>↳</span>
                <span>
                  Resolves to <span className="font-mono">{resolvedAddress}</span>
                </span>
                <span aria-hidden>✓</span>
              </p>
            ) : ensError ? (
              <p className="flex items-start gap-1 rounded-md bg-yellow-50 px-2 py-1 text-xs text-yellow-800">
                <span aria-hidden>⚠️</span>
                <span>{ensError}</span>
              </p>
            ) : null}
          </div>
        </Field>

        <label className="flex items-start gap-3 rounded-lg border border-foreground/15 p-4">
          <input
            type="checkbox"
            checked={courtOrderFlag}
            onChange={(e) => setCourtOrderFlag(e.target.checked)}
            className="mt-1"
          />
          <span className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Service is authorized by a court order</span>
            <span className="text-foreground/60">
              Check this if a court has authorized service by this method (optional).
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={attested}
            onChange={(e) => setAttested(e.target.checked)}
            required
            className="mt-1"
          />
          <span className="text-sm">
            I attest that the case caption and party details above are accurate and that I am
            authorized to initiate this service request.
          </span>
        </label>

        <button
          type="submit"
          disabled={submitting || !attested}
          className="self-start rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background transition hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Staging…" : "Stage service request"}
        </button>
      </form>
    </main>
  );
}

/** A small inline loading spinner shown while an ENS name is being resolved. */
function Spinner() {
  return (
    <svg
      className="h-3 w-3 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label="Loading"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

/** A labelled form field with an optional hint and server-side error messages. */
function Field({
  id,
  label,
  hint,
  errors,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  errors?: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint ? <p className="text-foreground/50 text-xs">{hint}</p> : null}
      {errors?.length ? (
        <p role="alert" className="text-xs text-red-700">
          {errors.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
