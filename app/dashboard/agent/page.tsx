import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export const revalidate = 60;

async function getAgentData() {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://eps-dapp.vercel.app'}/api/ens/agent`, {
      next: { revalidate: 60 },
    });
    return res.json();
  } catch {
    return null;
  }
}

export default async function AgentPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const agent = await getAgentData();

  return (
    <main className="px-8 py-10 text-white">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Agent Identity</h1>
        <p className="mt-1 text-gray-400">
          EPS is operated by an ENSIP-25 registered AI process server agent anchored on both Ethereum and Hedera.
        </p>
      </div>

      {/* ENS Identity Card */}
      <div className="mb-6 rounded-xl border border-blue-500/30 bg-blue-950/20 p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl font-bold text-blue-400">youhavebeenserved.eth</span>
              {agent?.ensip25Compliant && (
                <span className="rounded-full bg-green-600/20 border border-green-500/40 px-2.5 py-0.5 text-xs font-semibold text-green-400">
                  ENSIP-25 Compliant
                </span>
              )}
              {agent?.ensip26Compliant && (
                <span className="rounded-full bg-purple-600/20 border border-purple-500/40 px-2.5 py-0.5 text-xs font-semibold text-purple-400">
                  ENSIP-26 Compliant
                </span>
              )}
            </div>
            <p className="text-sm text-gray-400 font-mono">{agent?.agentAddress ?? '0xd116A147A95f406a4A4F589c44d588cfE58ef6E0'}</p>
          </div>
          <a
            href="https://app.ens.domains/youhavebeenserved.eth"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-blue-500/30 px-3 py-1.5 text-sm text-blue-400 hover:bg-blue-500/10 transition-colors"
          >
            View on ENS App →
          </a>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Standard</p>
            <p className="text-sm text-white">ENSIP-25 — Agent Registry</p>
            <p className="text-xs text-gray-400 mt-1">AI agent registered under the ENS name system</p>
          </div>
          <div className="rounded-lg bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Agent Type</p>
            <p className="text-sm text-white">{agent?.credentials?.agentType ?? 'process-server'}</p>
            <p className="text-xs text-gray-400 mt-1">Autonomous legal process delivery agent</p>
          </div>
          <div className="rounded-lg bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Network</p>
            <p className="text-sm text-white">Ethereum Mainnet</p>
            <p className="text-xs text-gray-400 mt-1">ENS resolution on Ethereum mainnet</p>
          </div>
          <div className="rounded-lg bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Agent Version</p>
            <p className="text-sm text-white">{agent?.credentials?.agentVersion ?? '1.0.0'}</p>
            <p className="text-xs text-gray-400 mt-1">EPS-1.0 standard compliant</p>
          </div>
        </div>
      </div>

      {/* Hedera Identity Card */}
      <div className="mb-6 rounded-xl border border-purple-500/30 bg-purple-950/20 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl font-bold text-purple-400">Hedera Account 0.0.9225630</span>
              <span className="rounded-full bg-purple-600/20 border border-purple-500/40 px-2.5 py-0.5 text-xs font-semibold text-purple-400">
                Testnet
              </span>
            </div>
            <p className="text-sm text-gray-400 font-mono">0xd116A147A95f406a4A4F589c44d588cfE58ef6E0</p>
          </div>
          <a
            href="https://hashscan.io/testnet/account/0.0.9225630"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-purple-500/30 px-3 py-1.5 text-sm text-purple-400 hover:bg-purple-500/10 transition-colors"
          >
            View on HashScan →
          </a>
        </div>

        <div className="mb-4 rounded-lg border border-yellow-500/20 bg-yellow-950/20 p-4">
          <p className="text-sm font-semibold text-yellow-400 mb-1">One Key, Two Chains</p>
          <p className="text-sm text-gray-300">
            The Hedera operator account&apos;s EVM address is identical to the Ethereum address behind{' '}
            <span className="text-blue-400 font-mono">youhavebeenserved.eth</span>. The same ECDSA keypair
            controls both the ENS identity on Ethereum mainnet and the Hedera operator that writes HCS proofs
            and mints HTS NFTs on testnet.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">HCS Topic</p>
            <p className="text-sm font-mono text-green-400">0.0.9225885</p>
            <p className="text-xs text-gray-400 mt-1">9 confirmed proof messages</p>
            <a
              href="https://hashscan.io/testnet/topic/0.0.9225885"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs text-purple-400 hover:underline"
            >
              View on HashScan →
            </a>
          </div>
          <div className="rounded-lg bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">HTS NFT Collection</p>
            <p className="text-sm font-mono text-purple-400">0.0.9225911</p>
            <p className="text-xs text-gray-400 mt-1">3 proof-of-service NFTs minted</p>
            <a
              href="https://hashscan.io/testnet/token/0.0.9225911"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs text-purple-400 hover:underline"
            >
              View collection →
            </a>
          </div>
        </div>
      </div>

      {/* Latest NFT */}
      <div className="mb-6 rounded-xl border border-gray-700 bg-white/5 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Latest Proof-of-Service NFT</h2>
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          <img
            src="https://eps-dapp.vercel.app/api/nft/image?topic=0.0.9225885&seq=9"
            alt="EPS Proof of Service NFT"
            className="w-48 h-48 rounded-lg border border-gray-700"
          />
          <div className="flex-1">
            <p className="text-lg font-semibold text-white mb-1">EPS Proof of Service — HCS #9</p>
            <p className="text-sm text-gray-400 mb-4">
              Each completed service of process mints an NFT on Hedera HTS. The NFT metadata links back to the
              HCS topic message containing the immutable proof, and the SVG certificate is generated dynamically
              from on-chain data.
            </p>
            <div className="flex flex-wrap gap-2">
              <a href="https://hashscan.io/testnet/token/0.0.9225911/3" target="_blank" rel="noopener noreferrer"
                className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/10 transition-colors">
                Serial #3 on HashScan →
              </a>
              <a href="/api/nft/meta?topic=0.0.9225885&seq=9" target="_blank" rel="noopener noreferrer"
                className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/10 transition-colors">
                NFT Metadata JSON →
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ENSIP compliance detail */}
      <div className="rounded-xl border border-gray-700 bg-white/5 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Standards Compliance</h2>
        <div className="space-y-3">
          {[
            { id: 'ENSIP-25', name: 'Agent Registry', status: agent?.ensip25Compliant, desc: 'ENS name resolves to agent address — agent has on-chain ENS identity' },
            { id: 'ENSIP-26', name: 'Agent Text Records', status: agent?.ensip26Compliant, desc: 'agentType + agentVersion text records set on ENS resolver' },
            { id: 'EPS-1.0', name: 'Process Server Standard', status: true, desc: 'Implements EPS-1.0 conformance level EPS-CORE (Sections 5-9)' },
            { id: 'HCS', name: 'Hedera Consensus Service', status: true, desc: 'All service events anchored as HCS messages on topic 0.0.9225885' },
            { id: 'HTS', name: 'Hedera Token Service', status: true, desc: 'Proof-of-service NFTs minted on HTS collection 0.0.9225911' },
          ].map(item => (
            <div key={item.id} className="flex items-start gap-3">
              <span className={`mt-0.5 text-lg ${item.status ? 'text-green-400' : 'text-yellow-400'}`}>
                {item.status ? '✓' : '○'}
              </span>
              <div>
                <span className="text-sm font-semibold text-white">{item.id}</span>
                <span className="ml-2 text-sm text-gray-400">{item.name}</span>
                <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
