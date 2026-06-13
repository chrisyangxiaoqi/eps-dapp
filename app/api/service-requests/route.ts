import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, UnauthorizedError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  assertValidRecipient,
  InvalidRecipientError,
} from "@/lib/solana/validate-address";
import {
  checkAndDecrementQuota,
  QuotaExceededError,
  NoActiveSubscriptionError,
} from "@/lib/quota";
import { resolveENS, getAgentENSName } from "@/lib/ens/ENSResolver";

/**
 * Server-side validation schema for a service-request intake. Mirrors the
 * required fields of the dashboard form. The recipient wallet is checked for
 * shape here and then asserted on-curve below (a PDA / off-curve key is a valid
 * base58 string but not a serviceable recipient). `attested` must be literally
 * `true` — the filer cannot submit without attesting to the caption's accuracy.
 */
const ServiceRequestInput = z.object({
  caseCaption: z.string().trim().min(1, "Case caption is required.").max(500),
  plaintiffName: z.string().trim().min(1, "Plaintiff name is required.").max(300),
  defendantName: z.string().trim().min(1, "Defendant name is required.").max(300),
  recipientWallet: z.string().trim().min(1, "Recipient wallet is required."),
  courtOrderFlag: z.boolean().optional().default(false),
  attested: z.literal(true, {
    message: "You must attest to the accuracy of the case caption.",
  }),
});

/**
 * POST /api/service-requests — stage a new service-of-process request.
 *
 * Auth is required; the org/user come from the verified Clerk session token,
 * never the request body. The flow, in order:
 *   1. validate the body server-side (zod) — bad input is rejected BEFORE any
 *      quota is consumed (P2 gate: "bad input rejected pre-quota");
 *   2. validate the recipient wallet is an on-curve Solana address;
 *   3. decrement the org's quota (`checkAndDecrementQuota`);
 *   4. create the {@link ServiceRequest} in the STAGED state.
 *
 * Caption fields are confidential legal-filing metadata and are never logged
 * (CLAUDE.md hard rule #3).
 *
 * Body: `{ caseCaption, plaintiffName, defendantName, recipientWallet,
 *          courtOrderFlag?, attested: true }`
 * Returns: `{ id, status }` for the staged request.
 */
export async function POST(req: Request): Promise<Response> {
  let authContext;
  try {
    authContext = await requireAuth();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // (1) Field validation — pre-quota, so malformed submissions never burn quota.
  const parsed = ServiceRequestInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // (2a) ENS resolution — handle ENS names and EVM addresses before Solana validation.
  const recipientInput = input.recipientWallet;
  let resolvedWallet = recipientInput;
  let ensDisplayName: string | null = null;
  let agentENSName: string | null = null;

  // If it looks like an ENS name (contains a dot, not a plain IP), resolve it
  if (recipientInput.includes('.') && !recipientInput.match(/^[0-9.]+$/)) {
    const ensResult = await resolveENS(recipientInput);
    if (ensResult.wasENSName && !ensResult.address) {
      return NextResponse.json(
        { error: `ENS name "${recipientInput}" does not resolve to a wallet address.` },
        { status: 400 },
      );
    }
    if (ensResult.address) {
      resolvedWallet = ensResult.address;
      ensDisplayName = ensResult.displayName !== ensResult.address ? ensResult.displayName : null;
    }
  }
  agentENSName = await getAgentENSName();

  // (2b) Recipient wallet must be a real, on-curve Solana account (not a PDA),
  //      OR a valid EVM address (0x...). EVM/ENS addresses skip Solana validation.
  const isEvmAddress = /^0x[0-9a-fA-F]{40}$/.test(resolvedWallet);
  if (!isEvmAddress) {
    try {
      assertValidRecipient(resolvedWallet);
    } catch (err) {
      if (err instanceof InvalidRecipientError) {
        return NextResponse.json(
          { error: err.message, reason: err.reason }, { status: 400 },
        );
      }
      throw err;
    }
  }

  // (3) Consume quota BEFORE creating the record. A missing/exhausted plan is a
  // client-correctable condition (402/403), not a server error.
  try {
    await checkAndDecrementQuota(authContext.orgId);
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof NoActiveSubscriptionError) {
      return NextResponse.json({ error: err.message }, { status: 402 });
    }
    throw err;
  }

  // (4) Stage the request. `attestedAt` is stamped server-side at the moment of
  // attestation; the org is resolved from the verified token, not the body.
  const created = await prisma.serviceRequest.create({
    data: {
      organization: {
        connect: { clerkOrgId: authContext.orgId },
      },
      caseCaption: input.caseCaption,
      plaintiffName: input.plaintiffName,
      defendantName: input.defendantName,
      recipientWallet: resolvedWallet,
      courtOrderFlag: input.courtOrderFlag,
      attestedAt: new Date(),
      status: "STAGED",
      ensDisplayName,
      agentENSName,
    },
    select: { id: true, status: true },
  });

  return NextResponse.json({ id: created.id, status: created.status }, { status: 201 });
}
