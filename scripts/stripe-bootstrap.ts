// scripts/stripe-bootstrap.ts
//
// Idempotently provisions the EPS subscription catalog in Stripe TEST mode:
//   - Tier1 ($200/mo), Tier2 ($600/mo), Tier3 ($1000/mo) products + recurring prices
//   - EARLYADOPTER50 coupon (50% off, 12 months)
//
// Idempotency: every object carries `metadata.bootstrapKey`. On re-run we look up
// the existing object by that key (via Stripe Search for products, list-scan for
// coupons) and reuse it instead of creating a duplicate. Prices are immutable in
// Stripe, so a price is only created when no active price with the matching
// bootstrapKey exists on the product.
//
// Safety: refuses to run against a live-mode key (CLAUDE.md hard rule #7 — Stripe
// test mode only). A live `sk_live_...` key aborts the script.
//
// Usage:
//   STRIPE_SECRET_KEY=sk_test_... pnpm tsx scripts/stripe-bootstrap.ts
//
// After a successful run it prints the price IDs to copy into your `.env`:
//   STRIPE_TIER1_PRICE_ID / STRIPE_TIER2_PRICE_ID / STRIPE_TIER3_PRICE_ID

import Stripe from "stripe";

// Stable identifiers stamped into Stripe `metadata.bootstrapKey` so re-runs are
// idempotent. Never change these values once objects exist in an account.
const TIERS = [
  { key: "eps_tier1", name: "EPS Tier 1", unitAmount: 20000, envVar: "STRIPE_TIER1_PRICE_ID" },
  { key: "eps_tier2", name: "EPS Tier 2", unitAmount: 60000, envVar: "STRIPE_TIER2_PRICE_ID" },
  { key: "eps_tier3", name: "EPS Tier 3", unitAmount: 100000, envVar: "STRIPE_TIER3_PRICE_ID" },
] as const;

const COUPON = {
  key: "eps_earlyadopter50",
  id: "EARLYADOPTER50",
  name: "Early Adopter 50% Off",
  percentOff: 50,
  durationInMonths: 12,
} as const;

const CURRENCY = "usd";

function assertTestMode(key: string): void {
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set. Use a test-mode key (sk_test_...).");
  }
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) {
    throw new Error(
      "Refusing to run against a LIVE Stripe key. EPS bootstrap is test-mode only (CLAUDE.md hard rule #7).",
    );
  }
}

// Find a product previously created by this script via its bootstrapKey.
async function findProductByKey(stripe: Stripe, key: string): Promise<Stripe.Product | null> {
  const res = await stripe.products.search({
    query: `metadata['bootstrapKey']:'${key}'`,
    limit: 1,
  });
  return res.data[0] ?? null;
}

// Find an active recurring price on a product matching the bootstrapKey + amount.
async function findPriceByKey(
  stripe: Stripe,
  productId: string,
  key: string,
  unitAmount: number,
): Promise<Stripe.Price | null> {
  for await (const price of stripe.prices.list({ product: productId, active: true, limit: 100 })) {
    if (
      price.metadata?.bootstrapKey === key &&
      price.unit_amount === unitAmount &&
      price.currency === CURRENCY &&
      price.recurring?.interval === "month"
    ) {
      return price;
    }
  }
  return null;
}

async function findCouponByKey(stripe: Stripe, key: string): Promise<Stripe.Coupon | null> {
  for await (const coupon of stripe.coupons.list({ limit: 100 })) {
    if (coupon.metadata?.bootstrapKey === key) {
      return coupon;
    }
  }
  return null;
}

async function upsertTier(
  stripe: Stripe,
  tier: (typeof TIERS)[number],
): Promise<string> {
  let product = await findProductByKey(stripe, tier.key);
  if (product) {
    console.log(`product ${tier.key}: reused ${product.id}`);
  } else {
    product = await stripe.products.create({
      name: tier.name,
      metadata: { bootstrapKey: tier.key },
    });
    console.log(`product ${tier.key}: created ${product.id}`);
  }

  let price = await findPriceByKey(stripe, product.id, tier.key, tier.unitAmount);
  if (price) {
    console.log(`price   ${tier.key}: reused ${price.id}`);
  } else {
    price = await stripe.prices.create({
      product: product.id,
      currency: CURRENCY,
      unit_amount: tier.unitAmount,
      recurring: { interval: "month" },
      metadata: { bootstrapKey: tier.key },
    });
    console.log(`price   ${tier.key}: created ${price.id}`);
  }

  // Keep the product pointing at the current canonical price.
  if (product.default_price !== price.id) {
    await stripe.products.update(product.id, { default_price: price.id });
  }

  return price.id;
}

async function upsertCoupon(stripe: Stripe): Promise<void> {
  const existing = await findCouponByKey(stripe, COUPON.key);
  if (existing) {
    console.log(`coupon  ${COUPON.key}: reused ${existing.id}`);
    return;
  }
  const coupon = await stripe.coupons.create({
    id: COUPON.id,
    name: COUPON.name,
    percent_off: COUPON.percentOff,
    duration: "repeating",
    duration_in_months: COUPON.durationInMonths,
    metadata: { bootstrapKey: COUPON.key },
  });
  console.log(`coupon  ${COUPON.key}: created ${coupon.id}`);
}

async function main(): Promise<void> {
  const secretKey = process.env.STRIPE_SECRET_KEY ?? "";
  assertTestMode(secretKey);

  const stripe = new Stripe(secretKey);

  const priceIds: Record<string, string> = {};
  for (const tier of TIERS) {
    priceIds[tier.envVar] = await upsertTier(stripe, tier);
  }
  await upsertCoupon(stripe);

  console.log("\nStripe bootstrap complete. Add these price IDs to your .env:");
  for (const tier of TIERS) {
    console.log(`${tier.envVar}=${priceIds[tier.envVar]}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
