import { NextRequest, NextResponse } from 'next/server';
import { parseFlowWebhook } from '@/lib/payments/DynamicFlow';

export async function POST(req: NextRequest) {
  const body    = await req.text();
  const payload = parseFlowWebhook(body);
  if (!payload) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  console.log('[DynamicWebhook] status:', payload.status, 'session:', payload.sessionId);

  if (payload.status === 'completed') {
    console.log('[DynamicWebhook] Payment completed for session:', payload.sessionId);
    // TODO: find ServiceRequest by sessionId and mark payment confirmed
  }

  return NextResponse.json({ received: true });
}
