import { useMemo, useState } from 'react'
import { CandleChart } from './components/CandleChart'
import { useReplayClock } from './hooks/useReplayClock'
import { sampleCandles } from './lib/sample'

const MS_PER_TICK = 220

export default function App() {
  const candles = useMemo(() => sampleCandles(120), [])
  const tickCount = candles.length - 1
  const [running, setRunning] = useState(false)
  const [runKey, setRunKey] = useState(0)
  const tick = useReplayClock({ running, msPerTick: MS_PER_TICK, tickCount, runKey })
  const done = running && tick >= tickCount

  const start = () => {
    setRunKey((k) => k + 1)
    setRunning(true)
  }

  return (
    <main className="flex h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg" role="img" aria-label="whale">
            🐋
          </span>
          <span className="font-display text-sm font-bold tracking-tight text-ink">
            Beat the Whale
          </span>
          <span className="rounded-sm border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-secondary">
            free play
          </span>
        </div>
        <span className="font-mono text-[11px] tabular-nums text-ink-secondary">
          tick {String(tick).padStart(3, '0')} / {tickCount}
        </span>
      </header>

      <div className="relative min-h-0 flex-1">
        <CandleChart candles={candles} visibleTick={tick} />
      </div>

      <footer className="flex items-center gap-3 border-t border-line px-4 py-3">
        <button
          onClick={start}
          className="rounded-md border border-primary-muted bg-primary-muted/40 px-4 py-2 font-mono text-xs uppercase tracking-[0.08em] text-primary transition-colors hover:bg-primary-muted/60"
        >
          {done ? 'replay' : running ? 'restart' : 'play'}
        </button>
        <span className="font-mono text-[11px] text-ink-muted">
          {done
            ? 'replay complete'
            : running
              ? 'racing…'
              : 'sample replay — live HL data + whale ghost next'}
        </span>
      </footer>
    </main>
  )
}
