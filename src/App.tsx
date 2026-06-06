import { useMemo, useState } from 'react'
import { CandleChart, type WhaleMarker } from './components/CandleChart'
import { EquityChart } from './components/EquityChart'
import { useReplayClock } from './hooks/useReplayClock'
import { sampleCandles, sampleGhost } from './lib/sample'
import { simulate, whaleCurve, type GhostTrade, type OrderIntent } from './lib/replay'
import { buildChallengeFromWallet, FEATURED_WHALES, type Challenge } from './lib/challenge'
import type { Candle } from './lib/hyperliquid'

const MS_PER_TICK = 240
const START_EQUITY = 10_000

interface Active {
  coin: string
  label: string
  candles: Candle[]
  ghost: GhostTrade[]
  startEquity: number
}

export default function App() {
  const sample = useMemo<Active>(() => {
    const candles = sampleCandles(120)
    return { coin: 'SAMPLE', label: 'Sample whale', candles, ghost: sampleGhost(candles), startEquity: START_EQUITY }
  }, [])

  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [address, setAddress] = useState('')

  const active: Active = challenge ?? sample
  const { candles, ghost } = active
  const tickCount = candles.length - 1
  const whaleEq = useMemo(
    () => whaleCurve(ghost, active.startEquity, tickCount),
    [ghost, active.startEquity, tickCount],
  )

  const [running, setRunning] = useState(false)
  const [runKey, setRunKey] = useState(0)
  const [orders, setOrders] = useState<OrderIntent[]>([])
  const [size, setSize] = useState(2000)
  const [leverage, setLeverage] = useState(5)

  const tick = useReplayClock({ running, msPerTick: MS_PER_TICK, tickCount, runKey })
  const done = running && tick >= tickCount

  const playerSim = useMemo(
    () => simulate(candles, orders, active.startEquity, tick),
    [candles, orders, active.startEquity, tick],
  )

  const position = useMemo(() => {
    let p: { side: 'long' | 'short'; size: number } | null = null
    for (const o of orders) {
      if (o.tick > tick) break
      if (o.action === 'close') p = null
      else if (o.action === 'open_long') p = { side: 'long', size: o.size }
      else if (o.action === 'open_short') p = { side: 'short', size: o.size }
    }
    return p
  }, [orders, tick])

  const youPnl = playerSim.finalEquity - active.startEquity
  const whalePnl = (whaleEq[Math.min(tick, tickCount)]?.equity ?? active.startEquity) - active.startEquity

  const place = (action: OrderIntent['action']) => {
    if (!running || done) return
    setOrders((os) => [...os, { tick, action, size, leverage }])
  }
  const resetGame = () => {
    setRunning(false)
    setOrders([])
    setRunKey((k) => k + 1)
  }
  const start = () => {
    setOrders([])
    setRunKey((k) => k + 1)
    setRunning(true)
  }

  const loadWhale = async (addr: string, label?: string) => {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const c = await buildChallengeFromWallet(addr, label ? { label } : {})
      setChallenge(c)
      resetGame()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load wallet.')
    } finally {
      setLoading(false)
    }
  }
  const useSample = () => {
    setChallenge(null)
    setError(null)
    resetGame()
  }

  const markers: WhaleMarker[] = ghost
    .filter((g) => g.tickIndex <= tick)
    .map((g) => ({
      time: Math.floor(candles[g.tickIndex].t / 1000),
      aboveBar: !g.dir?.includes('Long'),
      up: !!g.dir?.includes('Long'),
      text: g.dir ?? '',
    }))
  const whaleVisible = whaleEq.slice(0, tick + 1)

  return (
    <main className="flex h-dvh flex-col bg-bg">
      <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="text-base" role="img" aria-label="whale">
            🐋
          </span>
          <span className="whitespace-nowrap font-display text-sm font-bold tracking-tight text-ink">
            Beat the Whale
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2.5 font-mono text-[11px] tabular-nums sm:gap-4">
          <Pnl label="you" value={youPnl} className="text-racer-you" />
          <Pnl label="whale" value={whalePnl} className="text-racer-whale" />
          <span className="text-ink-muted">
            {String(tick).padStart(3, '0')}/{tickCount}
          </span>
        </div>
      </header>

      {/* whale source bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-line px-3 py-1.5">
        <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.1em] text-ink-muted">
          racing
        </span>
        <span className="whitespace-nowrap font-mono text-[11px] text-ink">
          {active.label}
          {active.coin !== 'SAMPLE' && <span className="text-ink-secondary"> · {active.coin}</span>}
        </span>
        <span className="mx-1 h-3 w-px shrink-0 bg-line" />
        {FEATURED_WHALES.map((w) => (
          <button
            key={w.address}
            onClick={() => loadWhale(w.address, w.label)}
            disabled={loading}
            className="whitespace-nowrap rounded-sm border border-line px-2 py-0.5 font-mono text-[10px] text-ink-secondary transition-colors hover:border-racer-whale/50 hover:text-ink disabled:opacity-50"
          >
            {w.label}
          </button>
        ))}
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && loadWhale(address)}
          placeholder="0x wallet…"
          spellCheck={false}
          className="w-28 shrink-0 rounded-sm border border-line bg-surface px-2 py-0.5 font-mono text-[10px] text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none"
        />
        <button
          onClick={() => loadWhale(address)}
          disabled={loading}
          className="shrink-0 rounded-sm border border-primary-muted bg-primary-muted/40 px-2 py-0.5 font-mono text-[10px] uppercase text-primary transition-colors hover:bg-primary-muted/60 disabled:opacity-50"
        >
          race
        </button>
        {challenge && (
          <button
            onClick={useSample}
            className="shrink-0 whitespace-nowrap rounded-sm border border-line px-2 py-0.5 font-mono text-[10px] text-ink-muted transition-colors hover:text-ink"
          >
            sample
          </button>
        )}
        {loading && <span className="shrink-0 font-mono text-[10px] text-ink-secondary">loading…</span>}
        {error && <span className="shrink-0 whitespace-nowrap font-mono text-[10px] text-down">{error}</span>}
      </div>

      <div className="relative min-h-0 flex-1">
        <CandleChart candles={candles} visibleTick={tick} markers={markers} />
        {position && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-line bg-surface/80 px-2 py-1 font-mono text-[11px] tabular-nums backdrop-blur-sm">
            <span className={position.side === 'long' ? 'text-up' : 'text-down'}>
              {position.side.toUpperCase()}
            </span>{' '}
            <span className="text-ink-secondary">${position.size.toLocaleString()}</span>
          </div>
        )}
        {done && <ResultOverlay youPnl={youPnl} whalePnl={whalePnl} onReplay={start} />}
      </div>

      <div className="relative h-[20vh] min-h-[110px] border-t border-line">
        <div className="pointer-events-none absolute left-3 top-2 z-10 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-muted">
          equity race
        </div>
        <EquityChart you={playerSim.curve} whale={whaleVisible} />
      </div>

      {!done && (
        <footer className="border-t border-line px-4 py-3">
          {!running ? (
            <button
              onClick={start}
              className="w-full rounded-md border border-primary-muted bg-primary-muted/40 py-2.5 font-mono text-xs uppercase tracking-[0.1em] text-primary transition-colors hover:bg-primary-muted/60"
            >
              ▶ play
            </button>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex flex-1 gap-2">
                <button
                  onClick={() => place('open_long')}
                  className="flex-1 rounded-md border border-up/30 bg-up/10 py-2.5 font-mono text-xs uppercase tracking-[0.08em] text-up transition-colors hover:bg-up/20"
                >
                  long
                </button>
                <button
                  onClick={() => place('open_short')}
                  className="flex-1 rounded-md border border-down/30 bg-down/10 py-2.5 font-mono text-xs uppercase tracking-[0.08em] text-down transition-colors hover:bg-down/20"
                >
                  short
                </button>
                <button
                  onClick={() => place('close')}
                  className="flex-1 rounded-md border border-line py-2.5 font-mono text-xs uppercase tracking-[0.08em] text-ink-secondary transition-colors hover:bg-surface-hover"
                >
                  close
                </button>
              </div>
              <div className="flex items-center justify-center gap-1.5 sm:justify-end">
                <Stepper label="size" value={size} onChange={setSize} step={500} prefix="$" />
                <Stepper label="lev" value={leverage} onChange={setLeverage} step={1} suffix="x" />
              </div>
            </div>
          )}
        </footer>
      )}
    </main>
  )
}

function Pnl({ label, value, className }: { label: string; value: number; className: string }) {
  const sign = value >= 0 ? '+' : '−'
  return (
    <span className="flex items-center gap-1">
      <span className="text-ink-muted">{label}</span>
      <span className={className}>
        {sign}${Math.abs(value).toFixed(0)}
      </span>
    </span>
  )
}

function Stepper({
  label,
  value,
  onChange,
  step,
  prefix = '',
  suffix = '',
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step: number
  prefix?: string
  suffix?: string
}) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-line px-1.5 py-1">
      <span className="hidden font-mono text-[10px] uppercase text-ink-muted sm:inline">{label}</span>
      <button
        onClick={() => onChange(Math.max(step, value - step))}
        className="px-1 font-mono text-ink-secondary transition-colors hover:text-ink"
        aria-label={`decrease ${label}`}
      >
        −
      </button>
      <span className="min-w-[4ch] text-center font-mono text-xs tabular-nums text-ink">
        {prefix}
        {value.toLocaleString()}
        {suffix}
      </span>
      <button
        onClick={() => onChange(value + step)}
        className="px-1 font-mono text-ink-secondary transition-colors hover:text-ink"
        aria-label={`increase ${label}`}
      >
        +
      </button>
    </div>
  )
}

function ResultOverlay({
  youPnl,
  whalePnl,
  onReplay,
}: {
  youPnl: number
  whalePnl: number
  onReplay: () => void
}) {
  const beat = youPnl > whalePnl
  const diff = youPnl - whalePnl
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-bg/85 px-6 text-center backdrop-blur-sm">
      <span className="font-display text-2xl font-bold tracking-tight text-ink">
        {beat ? 'You beat the whale 🎉' : 'The whale won 🐋'}
      </span>
      <span className={`font-mono text-sm tabular-nums ${beat ? 'text-up' : 'text-down'}`}>
        {beat ? '+' : '−'}${Math.abs(diff).toFixed(0)} vs the whale
      </span>
      <button
        onClick={onReplay}
        className="mt-1 rounded-md border border-primary-muted bg-primary-muted/40 px-5 py-2 font-mono text-xs uppercase tracking-[0.1em] text-primary transition-colors hover:bg-primary-muted/60"
      >
        play again
      </button>
    </div>
  )
}
