export default function DemoBanner() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") return null;
  return (
    <div
      className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-yellow-400 px-4 py-2 text-center text-sm font-semibold text-yellow-900"
      role="alert"
    >
      <span>warning</span>
      <span>
        Testnet demo - no real legal proceedings are initiated. Hedera HCS
        testnet only.
      </span>
    </div>
  );
}
