/**
 * lib/payments/DynamicFlow.ts
 * Dynamic Flow — any-chain fee acceptance. Prize: Best Use of Flow ($3,000).
 * The existing Stripe payment path MUST remain unchanged as fallback.
 * SERVER-SIDE ONLY.
 */

export interface FlowSession {
  sessionId:   string;
  paymentUrl:  string;
  amountCents: number;
  deliveryId:  string;
}

/**
 * Create a Dynamic Flow payment session.
 * Based on https://www.dynamic.xyz/docs/overview/fireblocks-flow-api
 * Flow creates a hosted checkout URL — law firms pay from any chain/token.
 */
export async function createFlowSession(params: {
  deliveryId:  string;
  amountCents: number;
  email:       string;
}): Promise<FlowSession | null> {
  const environmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID;
  const bearerToken   = process.env.DYNAMIC_BEARER_TOKEN;
  if (!environmentId || !bearerToken || bearerToken === 'PLACEHOLDER') {
    console.warn('[DynamicFlow] Not configured — using placeholder');
    return null;
  }

  try {
    const response = await fetch(
      `https://app.dynamic.xyz/api/v0/environments/${environmentId}/flow/sessions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          amount: params.amountCents / 100,
          currency: 'USD',
          metadata: { deliveryId: params.deliveryId, email: params.email },
        }),
      }
    );

    if (!response.ok) {
      console.error('[DynamicFlow] API error:', response.status, await response.text());
      return null;
    }

    const data = await response.json() as { id?: string; url?: string; checkoutUrl?: string };
    const sessionId  = data.id ?? `flow-${Date.now()}`;
    const paymentUrl = data.url ?? data.checkoutUrl ?? `https://app.dynamic.xyz/pay/${sessionId}`;

    return { sessionId, paymentUrl, amountCents: params.amountCents, deliveryId: params.deliveryId };
  } catch (err) {
    console.error('[DynamicFlow] createFlowSession error:', err);
    return null;
  }
}

export function parseFlowWebhook(body: string): {
  sessionId: string; status: 'completed' | 'pending' | 'failed'; [key: string]: unknown;
} | null {
  try { return JSON.parse(body); } catch { return null; }
}
