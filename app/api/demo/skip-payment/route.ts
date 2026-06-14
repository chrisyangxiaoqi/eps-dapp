import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * POST /api/demo/skip-payment — advance a STAGED request without payment.
 *
 * DEMO ONLY. Available solely when NEXT_PUBLIC_DEMO_MODE === "true" (the same
 * flag the demo banner keys on); returns 404 otherwise so it is invisible in any
 * real deployment. It lets an ETHGlobal demo move a staged request straight into
 * delivery (IN_PROGRESS) without a Stripe subscription, so judges can walk the
 * full ENS → Hedera proof flow. No real money is ever involved (CLAUDE.md hard
 * rule #7: Stripe test mode only; here we bypass Stripe entirely in demo mode).
 *
 * The request is scoped to the authenticated filer's `userId` (from the verified
 * Clerk token, never the body), so a caller can only advance their own request.
 *
 * Body: `{ "id": string }`
 * Returns: `{ id, status }` for the advanced request.
 */
const Body = z.object({ id: z.string().min(1) });

export async function POST(req: Request): Promise<Response> {
  // Hard gate: only exists in demo mode.
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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

  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  // Scope to the caller's own request; an unknown/other-owner id is a 404.
  const existing = await prisma.serviceRequest.findFirst({
    where: { id: parsed.data.id, userId: authContext.userId },
    select: { id: true, status: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Service request not found" }, { status: 404 });
  }
  if (existing.status !== "STAGED") {
    return NextResponse.json(
      { error: `Cannot skip payment for a request in status ${existing.status}.` },
      { status: 409 },
    );
  }

  const updated = await prisma.serviceRequest.update({
    where: { id: existing.id },
    data: { status: "IN_PROGRESS" },
    select: { id: true, status: true },
  });

  return NextResponse.json({ id: updated.id, status: updated.status });
}
