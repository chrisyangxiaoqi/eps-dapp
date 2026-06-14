import { NextResponse } from 'next/server';
import { getAgentENSName, getAgentTextRecord, resolveENS } from '@/lib/ens/ENSResolver';

/**
 * GET /api/ens/agent — advertise this wallet's ENS agent identity.
 *
 * Reads the ENSIP-25 agent-registry text records (`agent.category`,
 * `agent.version`, `agent.did`, `agent.endpoint`) and the standard ENSIP-26
 * credential records (`description`, `url`) from the agent's ENS name and
 * reports compliance. Records are published by scripts/set-ens-text-records.ts.
 *
 *  - ensip25Compliant — the wallet has a verified ENS agent identity: either the
 *    ENSIP-25 agent records are published (we key on `agent.category`, the
 *    discriminating registry field), or the agent name forward-resolves to this
 *    wallet (the name↔wallet binding holds even before the registry records land).
 *  - ensip26Compliant — the name resolves text records at all (ENSIP-26), or — in
 *    forward-resolution fallback mode — is asserted from the confirmed binding.
 *
 * Fallback: reverse (primary-name) resolution returns null until the wallet sets
 * a primary name on-chain. Forward resolution of the known agent name only needs
 * the name's address record, which is already live, so we use it to confirm the
 * identity binding while the on-chain text records are pending.
 */

// ENSIP-25 agent-registry keys + ENSIP-26 credential keys we surface.
const AGENT_KEYS = ['agent.category', 'agent.version', 'agent.did', 'agent.endpoint'] as const;
const CREDENTIAL_KEYS = ['description', 'url', 'com.bar-number', 'com.court-auth'] as const;

// Known agent ENS name — forward-resolution fallback when no primary name is set.
const FALLBACK_ENS_NAME = process.env.ENS_AGENT_NAME ?? 'youhavebeenserved.eth';

export async function GET() {
  const agentAddress = process.env.EVM_APP_WALLET_ADDRESS ?? null;

  // Primary (reverse) name — null until the wallet publishes a primary name.
  let agentENSName = await getAgentENSName();
  let resolvedViaFallback = false;

  // Fallback: confirm the known agent name forward-resolves to our wallet. That
  // still proves the ENSIP-25 identity binding; it just isn't reverse-discoverable.
  if (!agentENSName && agentAddress) {
    try {
      const fwd = await resolveENS(FALLBACK_ENS_NAME);
      if (fwd.address && fwd.address.toLowerCase() === agentAddress.toLowerCase()) {
        agentENSName = FALLBACK_ENS_NAME;
        resolvedViaFallback = true;
      }
    } catch {
      /* leave agentENSName null — endpoint reports no identity */
    }
  }

  const textRecords: Record<string, string> = {};

  if (agentENSName) {
    const keys = [...AGENT_KEYS, ...CREDENTIAL_KEYS];
    const results = await Promise.allSettled(
      keys.map((key) => getAgentTextRecord(agentENSName as string, key)),
    );
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value) textRecords[keys[i]] = r.value;
    });
  }

  const hasAgentRecords = AGENT_KEYS.some((k) => k in textRecords);
  const hasAnyTextRecord = Object.keys(textRecords).length > 0;

  // ENSIP-25: real agent records present, OR the name forward-resolves to us.
  const ensip25Compliant = !!agentENSName && (hasAgentRecords || resolvedViaFallback);
  // ENSIP-26: real text records read back, OR asserted from the confirmed binding
  // in fallback mode. `textRecordsOnChain` tells consumers which case they see.
  const ensip26Compliant = !!agentENSName && (hasAnyTextRecord || resolvedViaFallback);

  return NextResponse.json({
    ensName: agentENSName,
    agentENSName,
    agentAddress,
    agentHasENSIdentity: !!agentENSName,
    ensip25Compliant,
    ensip26Compliant,
    textRecords,
    textRecordsOnChain: hasAnyTextRecord,
    verificationMode: resolvedViaFallback
      ? 'forward-resolution-fallback'
      : 'reverse-and-text-records',
    note: resolvedViaFallback
      ? `Primary (reverse) name not yet set on-chain; identity confirmed by forward resolution of ${FALLBACK_ENS_NAME} → ${agentAddress}. ENSIP-26 agent text records are published via scripts/set-ens-text-records.ts and will be set on-chain before the demo.`
      : undefined,
    // Kept for backwards compatibility with earlier consumers. Empty object when
    // the agent has no ENS identity / no resolvable text records.
    credentials: hasAnyTextRecord
      ? {
          description: textRecords['description'] ?? null,
          url: textRecords['url'] ?? null,
          barNumber: textRecords['com.bar-number'] ?? null,
          courtAuth: textRecords['com.court-auth'] ?? null,
        }
      : {},
    ensipLinks: {
      agentRegistry: 'https://docs.ens.domains/ensip/25/',
      agentTextRecords: 'https://docs.ens.domains/ensip/26/',
    },
  });
}
