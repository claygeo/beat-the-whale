import { useMemo, useState, type ReactNode } from 'react'
import { CandleChart, type WhaleMarker } from './components/CandleChart'
import { EquityChart } from './components/EquityChart'
import { useReplayClock } from './hooks/useReplayClock'
import { sampleCandles, sampleGhost } from './lib/sample'
import { simulate, whaleCurve, type GhostTrade, type OrderIntent } from './lib/replay'
import { buildChallengeFromWallet, FEATURED_WHALES, type Challenge } from './lib/challenge'
import {
  SCENARIOS,
  createPath,
  injectEvent,
  pathToCandles,
  botOrders,
  botCurve,
  type ScenarioKey,
  type ScenarioPath,
} from './lib/scenario'
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
const SCENARIO_CANDLE_MS = 500
const BOT_SIZE = 3_000
const BOT_LEV = 3

type Mode = 'replay' | 'scenario'

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

  const [mode, setMode] = useState<Mode>('replay')
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [address, setAddress] = useState('')
  const [rankedId, setRankedId] = useState<string | null>(null)
  const [source, setSource] = useState<string>('sample')
  const [showWallet, setShowWallet] = useState(false)

  // scenario / arcade
  const [scenarioPath, setScenarioPath] = useState<ScenarioPath | null>(null)
  const [eventsVersion, setEventsVersion] = useState(0)
  const [speed, setSpeed] = useState(1)

  const isScenario = mode === 'scenario'
  const active: Active = challenge ?? sample

  const [running, setRunning] = useState(false)
  const [runKey, setRunKey] = useState(0)
  const [orders, setOrders] = useState<OrderIntent[]>([])
  const [size, setSize] = useState(2000)
  const [leverage, setLeverage] = useState(5)

  const scenarioCandles = useMemo(
    () => (scenarioPath ? pathToCandles(scenarioPath, SCENARIO_CANDLE_MS) : []),
    // eventsVersion busts the memo when injectEvent mutates the path in place
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scenarioPath, eventsVersion],
  )

  const gameCandles = isScenario ? scenarioCandles : active.candles
  const startEquity = active.startEquity
  const tickCount = Math.max(0, gameCandles.length - 1)

  const whaleEq = useMemo(
    () => (isScenario ? [] : whaleCurve(active.ghost, active.candles, active.startEquity)),
    [isScenario, active],
  )
  const botOrdersList = useMemo(
    () => (isScenario && scenarioCandles.length ? botOrders(scenarioCandles, BOT_SIZE, BOT_LEV) : []),
    [isScenario, scenarioCandles],
  )
  const botEq = useMemo(
    () =>
      isScenario && scenarioCandles.length
        ? botCurve(scenarioCandles, startEquity, BOT_SIZE, BOT_LEV, tickCount)
        : [],
    [isScenario, scenarioCandles, startEquity, tickCount],
  )

  const msPerTick = useMemo(() => {
    if (isScenario) return Math.max(60, Math.round(SCENARIO_CANDLE_MS / speed))
    return Math.min(350, Math.max(60, Math.round(TARGET_REPLAY_MS / Math.max(1, tickCount))))
  }, [isScenario, speed, tickCount])

  const tick = useReplayClock({ running, msPerTick, tickCount, runKey })
  const done = running && tickCount > 0 && tick >= tickCount
  const pct = tickCount > 0 ? (Math.min(tick, tickCount) / tickCount) * 100 : 0

  const playerSim = useMemo(
    () => simulate(gameCandles, orders, startEquity, tick),
    [gameCandles, orders, startEquity, tick],
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

  const oppCurve = isScenario ? botEq : whaleEq
  const youPnl = playerSim.finalEquity - startEquity
  const oppPnl = (oppCurve[Math.min(tick, tickCount)]?.equity ?? startEquity) - startEquity
  const oppVisible = oppCurve.slice(0, tick + 1)

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
    if (isScenario) {
      // Date.now() is the only entropy source; once chosen the path is fully deterministic.
      setScenarioPath(createPath(Date.now() >>> 0))
      setEventsVersion((v) => v + 1)
    }
    setOrders([])
    setRunKey((k) => k + 1)
    setRunning(true)
  }

  const switchMode = (m: Mode) => {
    if (m === mode) return
    setMode(m)
    setError(null)
    setShowWallet(false)
    resetGame()
    if (m === 'scenario' && !scenarioPath) setScenarioPath(createPath(Date.now() >>> 0))
  }

  const injectScenario = (key: ScenarioKey) => {
    if (!isScenario || !scenarioPath || !running || done) return
    injectEvent(scenarioPath, key, tick * SCENARIO_CANDLE_MS)
    setEventsVersion((v) => v + 1)
  }

  const loadWhale = async (addr: string, label?: string) => {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const c = await buildChallengeFromWallet(addr, label ? { label } : {})
      setChallenge(c)
      setRankedId(null)
      setSource(addr.toLowerCase())
      setShowWallet(false)
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
      setSource('daily')
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
    setSource('sample')
    setError(null)
    resetGame()
  }

  const markers: WhaleMarker[] = isScenario
    ? botOrdersList
        .filter((o) => o.tick <= tick && scenarioCandles[o.tick])
        .map((o) => ({
          time: Math.floor(scenarioCandles[o.tick].t / 1000),
          aboveBar: o.action === 'open_short',
          up: o.action === 'open_long',
          text: o.action === 'open_long' ? 'Bot Long' : 'Bot Short',
        }))
    : active.ghost
        .filter((g) => g.tickIndex <= tick)
        .map((g) => ({
          time: Math.floor(active.candles[g.tickIndex].t / 1000),
          aboveBar: !g.dir?.includes('Long'),
          up: !!g.dir?.includes('Long'),
          text: g.dir ?? '',
        }))

  return (
    <main className="flex h-dvh flex-col bg-bg">
      {/* mode tabs */}
      <div className="flex shrink-0 border-b border-line">
        {(['replay', 'scenario'] as const).map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            className={`flex-1 py-2 text-xs font-semibold transition-colors ${
              mode === m
                ? 'border-b-2 border-primary text-ink'
                : 'border-b-2 border-transparent text-ink-secondary hover:text-ink'
            }`}
          >
            {m === 'replay' ? '🐋 Whale Race' : '🎮 Arcade'}
          </button>
        ))}
      </div>

      <header className="flex items-center justify-between gap-2 px-3.5 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="text-base" role="img" aria-label="whale">
            🐋
          </span>
          <span className="whitespace-nowrap text-sm font-bold tracking-tight text-ink">
            Beat the Whale
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-[11px] sm:gap-4">
          <Pnl label="You" value={youPnl} className="text-racer-you" />
          <Pnl label={isScenario ? 'Bot' : 'Whale'} value={oppPnl} className="text-racer-whale" />
        </div>
      </header>

      {/* selector row — replay: pick an opponent · arcade: inject events + speed */}
      {isScenario ? (
        <div className="no-scrollbar flex items-center gap-2 overflow-x-auto border-y border-line px-3 py-2">
          {Object.values(SCENARIOS).map((s) => (
            <button
              key={s.key}
              onClick={() => injectScenario(s.key)}
              disabled={!running || done}
              className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-all active:scale-95 disabled:opacity-40 ${
                s.dir < 0
                  ? 'text-down ring-down/30 hover:bg-down/10'
                  : 'text-up ring-up/30 hover:bg-up/10'
              }`}
            >
              {s.emoji} {s.label}
            </button>
          ))}
          <span className="mx-0.5 h-4 w-px shrink-0 bg-line" />
          {[1, 2, 4].map((sp) => (
            <button
              key={sp}
              onClick={() => setSpeed(sp)}
              disabled={running}
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition-all active:scale-95 disabled:opacity-40 ${
                speed === sp ? 'bg-primary/15 text-primary ring-primary/40' : 'text-ink-secondary ring-line hover:text-ink'
              }`}
            >
              {sp}×
            </button>
          ))}
        </div>
      ) : (
        <div className="no-scrollbar flex items-center gap-2 overflow-x-auto border-y border-line px-3 py-2">
          <RaceChip active={source === 'daily'} onClick={loadDaily} disabled={loading} accent="warn">
            🏆 Daily
          </RaceChip>
          {FEATURED_WHALES.map((w) => (
            <RaceChip
              key={w.address}
              active={source === w.address.toLowerCase()}
              onClick={() => loadWhale(w.address, w.label)}
              disabled={loading}
            >
              {w.label}
            </RaceChip>
          ))}
          <RaceChip active={source === 'sample'} onClick={useSample} disabled={loading}>
            Sample
          </RaceChip>
          <span className="mx-0.5 h-4 w-px shrink-0 bg-line" />
          <RaceChip active={showWallet} onClick={() => setShowWallet((v) => !v)} disabled={loading}>
            + Wallet
          </RaceChip>
        </div>
      )}

      {showWallet && !isScenario && (
        <div className="flex items-center gap-2 border-b border-line px-3 py-2 animate-fade-in">
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadWhale(address)}
            placeholder="Paste any 0x wallet…"
            spellCheck={false}
            autoFocus
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-ink placeholder:font-sans placeholder:text-ink-muted focus:border-primary focus:outline-none"
          />
          <button
            onClick={() => loadWhale(address)}
            disabled={loading || address.trim().length < 4}
            className="shrink-0 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-bg transition-all active:scale-95 hover:bg-primary/90 disabled:opacity-40"
          >
            Race
          </button>
        </div>
      )}

      {error && (
        <div className="border-b border-down/20 bg-down/10 px-3.5 py-1.5 text-[11px] text-down animate-fade-in">
          {error}
        </div>
      )}

      {/* the race — who's ahead, live */}
      <RaceLane youPnl={youPnl} oppPnl={oppPnl} oppEmoji={isScenario ? '🤖' : '🐋'} startEquity={startEquity} pct={pct} live={running && !done} />

      <div className="relative min-h-0 flex-1">
        <CandleChart candles={gameCandles} visibleTick={tick} markers={markers} />
        {loading && <LoadingOverlay />}
        {!running && !done && !loading && <StartHint mode={mode} label={active.label} coin={active.coin} />}
        {position && (
          <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-lg border border-line bg-surface/85 px-2.5 py-1 text-[11px] backdrop-blur-sm">
            <span className={`font-semibold ${position.side === 'long' ? 'text-up' : 'text-down'}`}>
              {position.side === 'long' ? 'Long' : 'Short'}
            </span>
            <span className="font-mono tabular-nums text-ink-secondary">
              ${position.size.toLocaleString()}
            </span>
          </div>
        )}
        {done &&
          (!isScenario && rankedId ? (
            <RankedResult challengeId={rankedId} youPnl={youPnl} whalePnl={oppPnl} orders={orders} />
          ) : (
            <ResultOverlay youPnl={youPnl} oppPnl={oppPnl} opponent={isScenario ? 'bot' : 'whale'} onReplay={start} />
          ))}
      </div>

      <div className="relative h-[20vh] min-h-[110px] border-t border-line">
        <div className="pointer-events-none absolute left-3 top-2 z-10 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
          Equity race
        </div>
        <EquityChart you={playerSim.curve} whale={oppVisible} />
      </div>

      {!done && (
        <footer className="border-t border-line px-3.5 py-3">
          {!running ? (
            <button
              onClick={start}
              className="w-full rounded-xl bg-primary py-3.5 text-sm font-semibold text-bg transition-all active:scale-[0.98] hover:bg-primary/90"
            >
              ▶ Play
            </button>
          ) : (
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <div className="flex flex-1 gap-2">
                <button
                  onClick={() => place('open_long')}
                  className="flex-1 rounded-xl border border-up/40 bg-up/15 py-3.5 text-sm font-semibold text-up transition-all active:scale-95 hover:bg-up/25"
                >
                  Long
                </button>
                <button
                  onClick={() => place('open_short')}
                  className="flex-1 rounded-xl border border-down/40 bg-down/15 py-3.5 text-sm font-semibold text-down transition-all active:scale-95 hover:bg-down/25"
                >
                  Short
                </button>
                <button
                  onClick={() => place('close')}
                  className="flex-1 rounded-xl border border-line bg-surface py-3.5 text-sm font-semibold text-ink-secondary transition-all active:scale-95 hover:bg-surface-hover hover:text-ink"
                >
                  Close
                </button>
              </div>
              <div className="flex items-center justify-center gap-2 sm:justify-end">
                <Stepper label="Size" value={size} onChange={setSize} step={500} prefix="$" />
                <Stepper label="Lev" value={leverage} onChange={setLeverage} step={1} suffix="x" />
              </div>
            </div>
          )}
        </footer>
      )}
    </main>
  )
}

function RaceChip({
  active,
  onClick,
  disabled,
  accent = 'default',
  children,
}: {
  active: boolean
  onClick: () => void
  disabled?: boolean
  accent?: 'warn' | 'default'
  children: ReactNode
}) {
  const ring = active
    ? accent === 'warn'
      ? 'bg-warn/15 text-warn ring-1 ring-inset ring-warn/40'
      : 'bg-primary/15 text-primary ring-1 ring-inset ring-primary/40'
    : 'text-ink-secondary ring-1 ring-inset ring-line hover:text-ink hover:ring-line-hover'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-all active:scale-95 disabled:opacity-40 ${ring}`}
    >
      {children}
    </button>
  )
}

function RaceLane({
  youPnl,
  oppPnl,
  oppEmoji,
  startEquity,
  pct,
  live,
}: {
  youPnl: number
  oppPnl: number
  oppEmoji: string
  startEquity: number
  pct: number
  live: boolean
}) {
  // normalize PnL onto the track: breakeven = center, leader slides toward the finish
  const ref = Math.max(Math.abs(youPnl), Math.abs(oppPnl), startEquity * 0.02)
  const place = (v: number) => Math.max(6, Math.min(94, 50 + (v / ref) * 44))
  const youX = place(youPnl)
  const oppX = place(oppPnl)
  const youAhead = youPnl >= oppPnl
  return (
    <div className="shrink-0 border-b border-line bg-surface/30 px-3 py-2">
      <div className="relative h-7 overflow-hidden rounded-md bg-bg/60 ring-1 ring-inset ring-line">
        {/* time elapsed */}
        <div
          className="absolute inset-y-0 left-0 bg-primary/[0.06] transition-[width] duration-200 ease-linear"
          style={{ width: `${pct}%` }}
        />
        {/* breakeven */}
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-line/70" />
        {/* finish line */}
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] leading-none">🏁</span>
        {/* you (upper lane) */}
        <div
          className="absolute top-0.5 -translate-x-1/2 transition-[left] duration-300 ease-out"
          style={{ left: `${youX}%` }}
        >
          <span
            className={`rounded-full bg-racer-you/20 px-1.5 py-px text-[9px] font-bold leading-tight text-racer-you ring-1 ring-inset ring-racer-you/50 ${
              youAhead && live ? 'shadow-[0_0_8px_0] shadow-racer-you/50' : ''
            }`}
          >
            You
          </span>
        </div>
        {/* opponent (lower lane) */}
        <div
          className="absolute bottom-0.5 -translate-x-1/2 transition-[left] duration-300 ease-out"
          style={{ left: `${oppX}%` }}
        >
          <span
            className={`rounded-full bg-racer-whale/20 px-1.5 py-px text-[9px] font-bold leading-tight text-racer-whale ring-1 ring-inset ring-racer-whale/50 ${
              !youAhead && live ? 'shadow-[0_0_8px_0] shadow-racer-whale/50' : ''
            }`}
          >
            {oppEmoji}
          </span>
        </div>
      </div>
    </div>
  )
}

function Pnl({ label, value, className }: { label: string; value: number; className: string }) {
  const sign = value >= 0 ? '+' : '−'
  return (
    <span className="flex items-center gap-1">
      <span className="text-ink-muted">{label}</span>
      <span className={`font-mono font-medium tabular-nums ${className}`}>
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
    <div className="flex items-center gap-1 rounded-lg border border-line px-1.5 py-1">
      <span className="hidden text-[10px] font-medium uppercase tracking-wide text-ink-muted sm:inline">
        {label}
      </span>
      <button
        onClick={() => onChange(Math.max(step, value - step))}
        className="px-1.5 text-ink-secondary transition-all active:scale-90 hover:text-ink"
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
        className="px-1.5 text-ink-secondary transition-all active:scale-90 hover:text-ink"
        aria-label={`increase ${label}`}
      >
        +
      </button>
    </div>
  )
}

function StartHint({ mode, label, coin }: { mode: Mode; label: string; coin: string }) {
  if (mode === 'scenario') {
    return (
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-bg/75 px-8 text-center backdrop-blur-[2px] animate-fade-in">
        <span className="text-5xl">🎮</span>
        <span className="text-xl font-bold tracking-tight text-ink">Trade the chaos</span>
        <p className="max-w-[19rem] text-[13px] leading-relaxed text-ink-secondary">
          A live synthetic market vs a momentum{' '}
          <span className="font-semibold text-racer-whale">bot</span>. The edge: take a position{' '}
          <span className="italic">first</span>, then slam{' '}
          <span className="font-semibold text-down">⚡ crash</span> /{' '}
          <span className="font-semibold text-up">🚀 pump</span> to swing the market your way — random
          size + timing every run. Beat the bot&apos;s PnL by the end.
        </p>
        <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-bg">
          ▶ Press play to start
        </span>
      </div>
    )
  }
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-bg/75 px-8 text-center backdrop-blur-[2px] animate-fade-in">
      <span className="text-5xl">🐋</span>
      <span className="text-xl font-bold tracking-tight text-ink">Out-trade the whale</span>
      <p className="max-w-[18rem] text-[13px] leading-relaxed text-ink-secondary">
        A real trader&apos;s moves replay on this chart. Go long or short with paper money and beat
        their PnL by the end — their actual trades appear as{' '}
        <span className="font-semibold text-racer-whale">amber markers</span>.
      </p>
      {coin !== 'SAMPLE' && (
        <span className="text-[11px] text-ink-muted">
          Now racing · <span className="text-ink-secondary">{label}</span>
        </span>
      )}
      <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-bg">
        ▶ Press play to start
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
      <span className="text-xs font-medium text-ink-secondary">Loading the whale&apos;s trades…</span>
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
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-bg/90 px-6 py-6 text-center backdrop-blur-sm animate-pop-in">
      <span className="text-xl font-bold tracking-tight text-ink">
        {beat ? 'You beat the whale 🎉' : 'The whale won 🐋'}
      </span>
      <span className={`text-base font-semibold ${beat ? 'text-up' : 'text-down'}`}>
        by <span className="font-mono tabular-nums">${Math.abs(diff).toFixed(0)}</span>
      </span>

      {board ? (
        <div className="w-full max-w-sm">
          {result && (
            <div className="mb-2 text-xs font-semibold text-primary">
              You ranked #{result.leaderboard_rank}
            </div>
          )}
          <div className="rounded-xl border border-line text-left">
            <div className="flex items-center justify-between border-b border-line px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
              <span>Today&apos;s leaderboard</span>
              <span>PnL</span>
            </div>
            <div className="max-h-52 overflow-y-auto">
              {board.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-ink-muted">Be the first to post a score</div>
              ) : (
                board.map((row) => (
                  <div
                    key={`${row.leaderboard_rank}-${row.handle}`}
                    className="flex items-center justify-between px-3 py-1.5 text-[12px]"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span className="w-5 shrink-0 text-right font-mono tabular-nums text-ink-muted">
                        {row.leaderboard_rank}
                      </span>
                      <span className="truncate text-ink">{row.handle}</span>
                      {row.beat_whale && <span className="text-[9px]">🐋</span>}
                    </span>
                    <span
                      className={`font-mono tabular-nums ${row.final_pnl >= 0 ? 'text-up' : 'text-down'}`}
                    >
                      {row.final_pnl >= 0 ? '+' : '−'}${Math.abs(row.final_pnl).toFixed(0)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
          {error && <span className="mt-2 block text-[11px] text-warn">{error}</span>}
        </div>
      ) : (
        <div className="flex w-full max-w-xs flex-col items-center gap-2">
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 24))}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Your handle"
            spellCheck={false}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-center text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none"
          />
          <button
            onClick={submit}
            disabled={submitting || handle.trim().length < 1}
            className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-bg transition-all active:scale-[0.98] hover:bg-primary/90 disabled:opacity-40"
          >
            {submitting ? 'Submitting…' : 'Submit score'}
          </button>
          {error && <span className="text-[11px] text-down">{error}</span>}
        </div>
      )}
    </div>
  )
}

function ResultOverlay({
  youPnl,
  oppPnl,
  opponent,
  onReplay,
}: {
  youPnl: number
  oppPnl: number
  opponent: 'whale' | 'bot'
  onReplay: () => void
}) {
  const beat = youPnl > oppPnl
  const diff = youPnl - oppPnl
  const oppEmoji = opponent === 'bot' ? '🤖' : '🐋'
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-bg/85 px-6 text-center backdrop-blur-sm animate-pop-in">
      <span className="text-2xl font-bold tracking-tight text-ink">
        {beat ? `You beat the ${opponent} 🎉` : `The ${opponent} won ${oppEmoji}`}
      </span>
      <span className={`text-base font-semibold ${beat ? 'text-up' : 'text-down'}`}>
        by <span className="font-mono tabular-nums">${Math.abs(diff).toFixed(0)}</span>
      </span>
      <button
        onClick={onReplay}
        className="mt-1 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-bg transition-all active:scale-[0.98] hover:bg-primary/90"
      >
        {opponent === 'bot' ? 'New run' : 'Play again'}
      </button>
    </div>
  )
}
