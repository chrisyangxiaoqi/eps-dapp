import { NextRequest, NextResponse } from 'next/server';
import { createFlowSession } from '@/lib/payments/DynamicFlow';
import { auth } from '@clerk/nextjs/server';

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { deliveryId, amountCents, email } = body as Record<string, unknown>;

  if (!deliveryId || !amountCents || !email) {
    return NextResponse.json({ error: 'deliveryId, amountCents, email required' }, { status: 400 });
  }

  const session = await createFlowSession({
    deliveryId:  String(deliveryId),
    amountCents: Number(amountCents),
    email:       String(email),
  });

  if (!session) {
    return NextResponse.json({ error: 'Flow not configured or session creation failed' }, { status: 503 });
  }

  return NextResponse.json(session);
}
