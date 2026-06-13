/**
 * lib/ens/ENSResolver.ts
 * ENS resolution for EPS — 4 prize tracks, $20,000 total.
 * SDK: @ensdomains/ensjs
 * SERVER-SIDE ONLY.
 */
import { http } from 'viem';
import { mainnet } from 'viem/chains';
import { createEnsPublicClient } from '@ensdomains/ensjs';

const ensClient = createEnsPublicClient({
  chain: mainnet,
  transport: http(process.env.EVM_RPC_ETH_MAINNET ?? 'https://eth.llamarpc.com'),
});

export interface ENSResolution {
  address:     string | null;
  displayName: string;
  wasENSName:  boolean;
  primaryName: string | null;
}

export async function resolveENS(input: string): Promise<ENSResolution> {
  const trimmed = input.trim();
  const isEvmAddress = /^0x[0-9a-fA-F]{40}$/.test(trimmed);
  const isName = !isEvmAddress && trimmed.includes('.');

  if (isName) {
    try {
      const result = await ensClient.getAddressRecord({ name: trimmed });
      return { address: result?.value ?? null, displayName: trimmed, wasENSName: true, primaryName: null };
    } catch {
      return { address: null, displayName: trimmed, wasENSName: true, primaryName: null };
    }
  }

  if (isEvmAddress) {
    try {
      const result = await ensClient.getName({ address: trimmed as `0x${string}` });
      const name = result?.name ?? null;
      return { address: trimmed, displayName: name ?? trimmed, wasENSName: false, primaryName: name };
    } catch {
      return { address: trimmed, displayName: trimmed, wasENSName: false, primaryName: null };
    }
  }

  return { address: null, displayName: trimmed, wasENSName: false, primaryName: null };
}

export async function getAgentENSName(): Promise<string | null> {
  const addr = process.env.EVM_APP_WALLET_ADDRESS;
  if (!addr || !/^0x[0-9a-fA-F]{40}$/.test(addr)) return null;
  try {
    const result = await ensClient.getName({ address: addr as `0x${string}` });
    return result?.name ?? null;
  } catch {
    return null;
  }
}

export async function getAgentTextRecord(ensName: string, key: string): Promise<string | null> {
  try {
    const result = await ensClient.getTextRecord({ name: ensName, key });
    return result ?? null;
  } catch {
    return null;
  }
}
