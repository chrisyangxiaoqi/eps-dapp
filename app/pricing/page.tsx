"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Tier } from "@/lib/stripe";

// In demo mode (NEXT_PUBLIC_DEMO_MODE=true) we never call Stripe or the crypto
// payment provider — the buttons short-circuit straight to the dashboard so the
// platform can be demoed end-to-end without live payment credentials.
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

interface TierCard {
  id: Tier;
  name: string;
  price: string;
  cadence: string;
  blurb: string;
  features: string[];
  highlighted?: boolean;
}

// Pricing mirrors scripts/stripe-bootstrap.ts (Tier1 $200 / Tier2 $600 / Tier3 $1000).
// Quotas mirror docs/PHASES.md T-105 (1 / 9 / 999 services per period).
const TIERS: TierCard[] = [
  {
    id: "tier1",
    name: "Tier 1",
    price: "$200",
    cadence: "/month",
    blurb: "For occasional filers.",
    features: ["1 service per month", "Court-ready proof certificate", "On-chain delivery record"],
  },
  {
    id: "tier2",
    name: "Tier 2",
    price: "$600",
    cadence: "/month",
    blurb: "For active practices.",
    features: ["9 services per month", "Court-ready proof certificate", "On-chain delivery record"],
    highlighted: true,
  },
  {
    id: "tier3",
    name: "Tier 3",
    price: "$1000",
    cadence: "/month",
    blurb: "For high-volume firms.",
    features: ["999 services per month", "Court-ready proof certificate", "On-chain delivery record"],
  },
];

type PaymentTab = "card" | "crypto";

export default function PricingPage() {
  const router = useRouter();
  const [loadingTier, setLoadingTier] = useState<Tier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentTab, setPaymentTab] = useState<PaymentTab>("card");
  const [cryptoLoading, setCryptoLoading] = useState(false);
  const [cryptoError, setCryptoError] = useState<string | null>(null);
  const [cryptoUrl, setCryptoUrl] = useState<string | null>(null);

  async function subscribe(tier: Tier) {
    // Demo bypass: skip Stripe entirely and land on the dashboard.
    if (DEMO_MODE) {
      router.push("/dashboard?subscribed=demo");
      return;
    }
    setError(null);
    setLoadingTier(tier);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data: { url?: string; error?: string } = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Could not start checkout. Please try again.");
      }
      if (!data.url) {
        throw new Error("Checkout session did not return a URL.");
      }
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout.");
      setLoadingTier(null);
    }
  }

  async function getCryptoPaymentLink(tier: Tier) {
    setCryptoError(null);
    setCryptoUrl(null);
    setCryptoLoading(true);
    // Map tiers to cent amounts matching Stripe prices
    const amountMap: Record<Tier, number> = { tier1: 20000, tier2: 60000, tier3: 100000 };
    try {
      const res = await fetch("/api/payments/flow-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deliveryId: `pricing-${tier}-${Date.now()}`,
          amountCents: amountMap[tier],
          email: "",
        }),
      });
      if (res.status === 503) {
        setCryptoError("Crypto payments temporarily unavailable. Please pay with card.");
        return;
      }
      const data: { paymentUrl?: string; error?: string } = await res.json();
      if (!res.ok || !data.paymentUrl) {
        setCryptoError(data.error ?? "Could not create crypto payment link. Please pay with card.");
        return;
      }
      setCryptoUrl(data.paymentUrl);
      window.location.assign(data.paymentUrl);
    } catch {
      setCryptoError("Crypto payments temporarily unavailable. Please pay with card.");
    } finally {
      setCryptoLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center gap-8 px-6 py-16">
      <header className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-4xl font-bold">Choose a plan</h1>
        <p className="text-foreground/70 max-w-2xl">
          EPS facilitates service of process and generates court-ready proof. Pick the monthly
          volume that fits your practice — you can apply a promo code at checkout.
        </p>
      </header>

      {/* Payment method tabs */}
      <div className="flex gap-1 rounded-lg border border-foreground/15 p-1">
        <button
          type="button"
          onClick={() => { setPaymentTab("card"); setError(null); setCryptoError(null); setCryptoUrl(null); }}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
            paymentTab === "card"
              ? "bg-foreground text-background"
              : "text-foreground/60 hover:text-foreground"
          }`}
        >
          Pay with Card
        </button>
        <button
          type="button"
          onClick={() => { setPaymentTab("crypto"); setError(null); }}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
            paymentTab === "crypto"
              ? "bg-foreground text-background"
              : "text-foreground/60 hover:text-foreground"
          }`}
        >
          Pay with Crypto
        </button>
      </div>

      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {cryptoError ? (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">
          {cryptoError}
        </p>
      ) : null}

      {cryptoUrl ? (
        <p className="rounded-md bg-green-50 px-4 py-2 text-sm text-green-700">
          Redirecting to crypto checkout…{" "}
          <a href={cryptoUrl} className="underline">Click here if not redirected</a>
        </p>
      ) : null}

      <section className="grid w-full gap-6 sm:grid-cols-3">
        {TIERS.map((tier) => (
          <div
            key={tier.id}
            className={`flex flex-col gap-6 rounded-2xl border p-6 ${
              tier.highlighted ? "border-foreground shadow-lg" : "border-foreground/15"
            }`}
          >
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">{tier.name}</h2>
              <p className="text-foreground/60 text-sm">{tier.blurb}</p>
            </div>
            <p className="flex items-baseline gap-1">
              <span className="text-4xl font-bold">{tier.price}</span>
              <span className="text-foreground/60 text-sm">{tier.cadence}</span>
            </p>
            <ul className="flex flex-1 flex-col gap-2 text-sm">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <span aria-hidden className="text-foreground/40">
                    ✓
                  </span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            {paymentTab === "card" ? (
              <button
                type="button"
                onClick={() => subscribe(tier.id)}
                disabled={loadingTier !== null}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-60 ${
                  tier.highlighted
                    ? "bg-foreground text-background hover:opacity-90"
                    : "border border-foreground/20 hover:bg-foreground/5"
                }`}
              >
                {loadingTier === tier.id ? "Redirecting…" : "Subscribe"}
              </button>
            ) : DEMO_MODE ? (
              <div className="flex flex-col gap-2">
                <p className="text-foreground/60 text-xs">
                  Demo mode — crypto payments via Dynamic. Click to continue.
                </p>
                <button
                  type="button"
                  onClick={() => router.push("/dashboard?paid=demo")}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-60 ${
                    tier.highlighted
                      ? "bg-foreground text-background hover:opacity-90"
                      : "border border-foreground/20 hover:bg-foreground/5"
                  }`}
                >
                  Continue
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => getCryptoPaymentLink(tier.id)}
                disabled={cryptoLoading}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-60 ${
                  tier.highlighted
                    ? "bg-foreground text-background hover:opacity-90"
                    : "border border-foreground/20 hover:bg-foreground/5"
                }`}
              >
                {cryptoLoading ? "Getting link…" : "Get Crypto Payment Link"}
              </button>
            )}
          </div>
        ))}
      </section>

      <p className="text-foreground/50 text-xs">
        {paymentTab === "card"
          ? "Have a promo code? Enter it on the checkout page."
          : "Crypto payments powered by Dynamic Flow — pay from any chain or token."}
      </p>
    </main>
  );
}
