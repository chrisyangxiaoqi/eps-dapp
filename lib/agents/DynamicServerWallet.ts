/**
 * lib/agents/DynamicServerWallet.ts
 * Dynamic MPC server wallet for the EPS delivery agent.
 * Prize: Best Agentic Build ($2,000).
 * Package: @dynamic-labs-wallet/node
 * SERVER-SIDE ONLY.
 */

export interface AgentWalletInfo {
  walletId:  string;
  address:   string;
}

export async function createAgentWallet(): Promise<AgentWalletInfo | null> {
  const authToken     = process.env.DYNAMIC_BEARER_TOKEN;
  const environmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID;
  if (!authToken || !environmentId) {
    console.warn('[DynamicAgent] Credentials not configured');
    return null;
  }

  try {
    const mod = await import('@dynamic-labs-wallet/node').catch(() => null);
    if (!mod) {
      console.warn('[DynamicAgent] @dynamic-labs-wallet/node not available');
      return null;
    }

    const { authenticatedEvmClient, ThresholdSignatureScheme } = mod as {
      authenticatedEvmClient: (opts: { authToken: string; environmentId: string }) => Promise<{
        createWalletAccount: (opts: unknown) => Promise<{ walletMetadata?: { id?: string }; publicKeyHex?: string; externalServerKeyShares?: unknown }>;
      }>;
      ThresholdSignatureScheme: { TWO_OF_TWO: string };
    };

    const evmClient = await authenticatedEvmClient({ authToken, environmentId });

    const { walletMetadata, publicKeyHex, externalServerKeyShares } =
      await evmClient.createWalletAccount({
        thresholdSignatureScheme: ThresholdSignatureScheme.TWO_OF_TWO,
        password:                 process.env.DYNAMIC_WALLET_PASSWORD ?? 'eps-agent-secure-pw-2026',
        onError: (error: Error) => console.error('[DynamicAgent] Error:', error),
        backUpToDynamic:          true,
      });

    const walletId = walletMetadata?.id ?? 'unknown';
    const address  = publicKeyHex ?? 'unknown';

    console.log(`[DynamicAgent] Wallet created: ${walletId} | Address: ${address}`);
    console.log('[DynamicAgent] Key shares (store securely):', JSON.stringify(externalServerKeyShares));
    console.log(`[DynamicAgent] ADD TO .env.local → EPS_AGENT_WALLET_ID=${walletId}`);

    return { walletId, address };
  } catch (err) {
    console.error('[DynamicAgent] createAgentWallet failed:', err);
    return null;
  }
}
