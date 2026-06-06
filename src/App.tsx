export default function App() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="text-6xl" role="img" aria-label="whale">
        🐋
      </span>
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Beat the Whale</h1>
      <p className="max-w-md text-sm leading-relaxed text-ink-secondary">
        Race a real Hyperliquid whale&apos;s recorded trades. Same market, same window — can you beat
        their realized PnL?
      </p>
      <div className="mt-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        building in public · wip
      </div>
    </main>
  )
}
