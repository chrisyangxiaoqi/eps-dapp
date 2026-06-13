/**
 * lib/hedera/HederaAgentKit.ts
 * Demonstrates @hashgraph/hedera-agent-kit v4 for AI & Agentic Payments track.
 * SERVER-SIDE ONLY.
 */
export async function verifyAgentKitAvailable(): Promise<boolean> {
  try {
    const core    = await import('@hashgraph/hedera-agent-kit').catch(() => null);
    const plugins = await import('@hashgraph/hedera-agent-kit/plugins').catch(() => null);
    if (!core || !plugins) {
      console.warn('[HederaAgentKit] Package not available — Hedera SDKs direct mode active');
      return false;
    }
    const { HederaAgentAPI } = core as { HederaAgentAPI?: unknown };
    const { coreTokenPlugin } = plugins as { coreTokenPlugin?: unknown };
    if (typeof HederaAgentAPI === 'function' && coreTokenPlugin) {
      console.log('[HederaAgentKit] v4 confirmed: HederaAgentAPI + coreTokenPlugin');
      return true;
    }
    console.warn('[HederaAgentKit] Package present but expected exports not found');
    return false;
  } catch (err) {
    console.error('[HederaAgentKit] Import check failed:', err);
    return false;
  }
}
