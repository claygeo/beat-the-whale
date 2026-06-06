import { useMemo, useState } from 'react'
import { CandleChart, type WhaleMarker } from './components/CandleChart'
import { EquityChart } from './components/EquityChart'
import { useReplayClock } from './hooks/useReplayClock'
import { sampleCandles, sampleGhost } from './lib/sample'
import { simulate, whaleCurve, type GhostTrade, type OrderIntent } from './lib/replay'
import { buildChallengeFromWallet, FEATURED_WHALES, type Challenge } from './lib/challenge'
import {
  loadDailyChallenge,
  submitRankedAttempt,
  getLeaderboard,
  type SubmitResult,
  type LeaderboardRow,
} from './lib/ranked'
import type { Candle } from './lib/hyperliquid'

const TARGET_REPLAY_MS = 60_000
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
  const [rankedId, setRankedId] = useState<string | null>(null)

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

  const msPerTick = useMemo(
    () => Math.min(350, Math.max(60, Math.round(TARGET_REPLAY_MS / Math.max(1, tickCount)))),
    [tickCount],
  )
  const tick = useReplayClock({ running, msPerTick, tickCount, runKey })
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
      setRankedId(null)
      resetGame()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load wallet.')
    } finally {
      setLoading(false)
    }
  }
  const loadDaily = async () => {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const d = await loadDailyChallenge()
      if (!d) {
        setError('No daily challenge yet — check back soon.')
        return
      }
      setChallenge(d)
      setRankedId(d.challengeId)
      resetGame()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load daily challenge.')
    } finally {
      setLoading(false)
    }
  }
  const useSample = () => {
    setChallenge(null)
    setRankedId(null)
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
          {rankedId ? '🏆 ranked' : 'racing'}
        </span>
        <span className="whitespace-nowrap font-mono text-[11px] text-ink">
          {active.label}
          {active.coin !== 'SAMPLE' && <span className="text-ink-secondary"> · {active.coin}</span>}
        </span>
        <span className="mx-1 h-3 w-px shrink-0 bg-line" />
        <button
          onClick={loadDaily}
          disabled={loading}
          className="shrink-0 whitespace-nowrap rounded-sm border border-warn/40 bg-warn/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.05em] text-warn transition-colors hover:bg-warn/20 disabled:opacity-50"
        >
          🏆 daily
        </button>
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
        {loading && <LoadingOverlay />}
        {!running && !done && !loading && <StartHint />}
        {position && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-line bg-surface/80 px-2 py-1 font-mono text-[11px] tabular-nums backdrop-blur-sm">
            <span className={position.side === 'long' ? 'text-up' : 'text-down'}>
              {position.side.toUpperCase()}
            </span>{' '}
            <span className="text-ink-secondary">${position.size.toLocaleString()}</span>
          </div>
        )}
        {done &&
          (rankedId ? (
            <RankedResult
              challengeId={rankedId}
              youPnl={youPnl}
              whalePnl={whalePnl}
              orders={orders}
            />
          ) : (
            <ResultOverlay youPnl={youPnl} whalePnl={whalePnl} onReplay={start} />
          ))}
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

function StartHint() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 px-6 text-center">
      <span className="text-4xl">🐋</span>
      <span className="font-display text-lg font-bold text-ink">Race the whale&apos;s trades</span>
      <span className="max-w-xs font-mono text-[11px] leading-relaxed text-ink-secondary">
        The market replays from the start. Go long or short and beat the whale&apos;s PnL by the end.
      </span>
      <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.15em] text-primary">
        ▶ press play
      </span>
    </div>
  )
}

function LoadingOverlay() {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-bg/80 backdrop-blur-sm">
      <span className="animate-pulse text-3xl" role="img" aria-label="whale">
        🐋
      </span>
      <span className="font-mono text-xs uppercase tracking-[0.1em] text-ink-secondary">
        loading the whale&apos;s trades…
      </span>
    </div>
  )
}

function RankedResult({
  challengeId,
  youPnl,
  whalePnl,
  orders,
}: {
  challengeId: string
  youPnl: number
  whalePnl: number
  orders: OrderIntent[]
}) {
  const beat = youPnl > whalePnl
  const diff = youPnl - whalePnl
  const [handle, setHandle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [board, setBoard] = useState<LeaderboardRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const h = handle.trim()
    if (submitting || h.length < 1) return
    setSubmitting(true)
    setError(null)
    try {
      const r = await submitRankedAttempt({
        challengeId,
        handle: h,
        finalPnl: youPnl,
        beatWhale: beat,
        orders,
      })
      setResult(r)
      setBoard(await getLeaderboard(challengeId))
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('already_played')) {
        setError('You already played today.')
        setBoard(await getLeaderboard(challengeId).catch(() => null))
      } else {
        setError('Could not submit — try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-bg/90 px-6 py-6 text-center backdrop-blur-sm">
      <span className="font-display text-xl font-bold tracking-tight text-ink">
        {beat ? 'You beat the whale 🎉' : 'The whale won 🐋'}
      </span>
      <span className={`font-mono text-sm tabular-nums ${beat ? 'text-up' : 'text-down'}`}>
        {beat ? '+' : '−'}${Math.abs(diff).toFixed(0)} vs the whale
      </span>

      {board ? (
        <div className="w-full max-w-sm">
          {result && (
            <div className="mb-2 font-mono text-xs uppercase tracking-[0.1em] text-primary">
              you ranked #{result.leaderboard_rank}
            </div>
          )}
          <div className="rounded-md border border-line text-left">
            <div className="flex items-center justify-between border-b border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-muted">
              <span>today&apos;s leaderboard</span>
              <span>pnl</span>
            </div>
            <div className="max-h-52 overflow-y-auto">
              {board.length === 0 ? (
                <div className="px-3 py-2 font-mono text-[11px] text-ink-muted">
                  be the first to post a score
                </div>
              ) : (
                board.map((row) => (
                  <div
                    key={`${row.leaderboard_rank}-${row.handle}`}
                    className="flex items-center justify-between px-3 py-1.5 font-mono text-[11px] tabular-nums"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span className="w-5 shrink-0 text-right text-ink-muted">
                        {row.leaderboard_rank}
                      </span>
                      <span className="truncate text-ink">{row.handle}</span>
                      {row.beat_whale && <span className="text-[9px]">🐋</span>}
                    </span>
                    <span className={row.final_pnl >= 0 ? 'text-up' : 'text-down'}>
                      {row.final_pnl >= 0 ? '+' : '−'}${Math.abs(row.final_pnl).toFixed(0)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
          {error && <span className="mt-2 block font-mono text-[11px] text-warn">{error}</span>}
        </div>
      ) : (
        <div className="flex w-full max-w-xs flex-col items-center gap-2">
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 24))}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="your handle"
            spellCheck={false}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-center font-mono text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none"
          />
          <button
            onClick={submit}
            disabled={submitting || handle.trim().length < 1}
            className="w-full rounded-md border border-primary-muted bg-primary-muted/40 py-2 font-mono text-xs uppercase tracking-[0.1em] text-primary transition-colors hover:bg-primary-muted/60 disabled:opacity-40"
          >
            {submitting ? 'submitting…' : 'submit score'}
          </button>
          {error && <span className="font-mono text-[11px] text-down">{error}</span>}
        </div>
      )}
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
