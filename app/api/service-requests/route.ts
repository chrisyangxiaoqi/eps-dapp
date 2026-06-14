import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, UnauthorizedError } from "@/lib/auth";
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
import { recordOnHedera } from "@/lib/hedera/HederaService";
import { rateLimit, clientKey, rateLimitHeaders } from "@/lib/rate-limit";

// Intake is quota-metered downstream, but rate-limit the endpoint itself
// (10/min/IP, T107) so a runaway client can't hammer auth + quota checks.
const INTAKE_LIMIT = { limit: 10, windowMs: 60_000 };

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
  // Optional hints sent by the intake form: the raw ENS name the filer typed and
  // the address it resolved to client-side. The server still re-resolves
  // authoritatively, but falls back to `recipientResolvedAddress` when its own
  // (possibly rate-limited) RPC lookup fails — so a transient ENS hiccup is a
  // soft warning, not a hard block (Section 1).
  recipientEnsName: z.string().trim().min(1).max(255).nullish(),
  recipientResolvedAddress: z.string().trim().nullish(),
  courtOrderFlag: z.boolean().optional().default(false),
  attested: z.literal(true, {
    message: "You must attest to the accuracy of the case caption.",
  }),
});

/**
 * POST /api/service-requests — stage a new service-of-process request.
 *
 * Auth is required; the user (and org, if any) come from the verified Clerk
 * session token, never the request body. The request is owned by the filer's
 * `userId`, so a user with NO active organization can still file (issue #112).
 * The flow, in order:
 *   1. validate the body server-side (zod) — bad input is rejected BEFORE any
 *      quota is consumed (P2 gate: "bad input rejected pre-quota");
 *   2. validate the recipient wallet is an on-curve Solana address;
 *   3. if the filer has an active org, decrement that org's quota
 *      (`checkAndDecrementQuota`); a user with no org has no subscription to
 *      meter, so this step is skipped for them;
 *   4. create the {@link ServiceRequest} in the STAGED state, stamped with the
 *      filer's `userId` and connected to their org when they have one.
 *
 * Caption fields are confidential legal-filing metadata and are never logged
 * (CLAUDE.md hard rule #3).
 *
 * Body: `{ caseCaption, plaintiffName, defendantName, recipientWallet,
 *          courtOrderFlag?, attested: true }`
 * Returns: `{ id, status }` for the staged request.
 */
export async function POST(req: Request): Promise<Response> {
  const rl = rateLimit(`service-requests:${clientKey(req)}`, INTAKE_LIMIT);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again shortly." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  let authContext;
  try {
    authContext = await requireUser();
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

  // If it looks like an ENS name (contains a dot, not a plain IP), resolve it.
  // The server re-resolves authoritatively, but an ENS lookup failing here must
  // NOT hard-block intake (Section 1): when our own resolution comes back empty
  // we fall back to the address the form already resolved client-side. The
  // request is only rejected if neither the server nor the client could turn the
  // name into a usable wallet address.
  if (recipientInput.includes('.') && !recipientInput.match(/^[0-9.]+$/)) {
    const ensResult = await resolveENS(recipientInput);
    const clientResolved = input.recipientResolvedAddress?.trim() ?? null;
    const clientHasEvmAddress = !!clientResolved && /^0x[0-9a-fA-F]{40}$/.test(clientResolved);

    if (ensResult.address) {
      resolvedWallet = ensResult.address;
      ensDisplayName = ensResult.displayName !== ensResult.address ? ensResult.displayName : null;
    } else if (clientHasEvmAddress) {
      // Server lookup failed (likely a transient/rate-limited RPC) but the form
      // already resolved this name — trust that address and record the name.
      console.warn(
        `[service-requests] server ENS resolution empty for "${recipientInput}"; ` +
          `using client-resolved address.`,
      );
      resolvedWallet = clientResolved!;
      ensDisplayName = recipientInput;
    } else if (ensResult.wasENSName) {
      return NextResponse.json(
        { error: `ENS name "${recipientInput}" does not resolve to a wallet address.` },
        { status: 400 },
      );
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

  // (3) Consume quota BEFORE creating the record — but only when the filer has
  // an active org to meter against. A user with no org has no subscription, so
  // there is nothing to decrement (issue #112). A missing/exhausted plan for an
  // org filer is a client-correctable condition (402/403), not a server error.
  if (authContext.orgId) {
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
  }

  // (4) Stage the request. `attestedAt` is stamped server-side at the moment of
  // attestation; the owner (`userId`) and org both come from the verified token,
  // not the body. The org is connected only when the filer has an active one.
  const created = await prisma.serviceRequest.create({
    data: {
      userId: authContext.userId,
      ...(authContext.orgId
        ? { organization: { connect: { clerkOrgId: authContext.orgId } } }
        : {}),
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

  // (5) Anchor an immutable proof-of-intake on Hedera (HCS consensus timestamp +
  // HTS proof-of-service NFT). This runs at creation so the proof is visible on
  // the service detail page immediately for the demo. Hedera is best-effort: any
  // failure is logged and swallowed — it must never fail intake (CLAUDE.md: HCS/HTS
  // calls wrapped in try/catch, Hedera failure must not fail delivery).
  await anchorOnHedera(created.id, {
    deliveryId: created.id,
    documentHash: "",
    caseRef: input.caseCaption,
    servedTo: resolvedWallet,
    servedBy: agentENSName ?? process.env.EVM_APP_WALLET_ADDRESS ?? "eps-agent",
  });

  return NextResponse.json({ id: created.id, status: created.status }, { status: 201 });
}

/**
 * Best-effort Hedera anchoring for a freshly-staged request: records an HCS
 * consensus timestamp and mints an HTS proof-of-service NFT, then persists the
 * returned ids/sequence numbers so the detail page can render the proof. Never
 * throws — Hedera failures are logged and the request proceeds regardless.
 */
async function anchorOnHedera(
  id: string,
  payload: { deliveryId: string; documentHash: string; caseRef: string; servedTo: string; servedBy: string },
): Promise<void> {
  try {
    const result = await recordOnHedera(payload);
    const updates: Record<string, unknown> = {};
    if (result.hcs) {
      updates.hcsTopicId = result.hcs.topicId;
      updates.hcsSequenceNumber = result.hcs.sequenceNumber;
      updates.hcsConsensusTime = result.hcs.consensusTimestamp;
      updates.hcsTxId = result.hcs.transactionId;
      updates.hcsMirrorUrl = result.hcs.mirrorNodeUrl;
    }
    if (result.hts) {
      updates.htsTokenId = result.hts.tokenId;
      updates.htsSerialNumber = result.hts.serialNumber;
      updates.htsTxId = result.hts.transactionId;
      updates.htsMirrorUrl = result.hts.mirrorNodeUrl;
    }
    if (Object.keys(updates).length > 0) {
      await prisma.serviceRequest.update({ where: { id }, data: updates });
    }
  } catch (err) {
    console.error("[service-requests] Hedera anchoring non-fatal error:", err);
  }
}
