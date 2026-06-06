// Procedural SCENARIO / ARCADE engine — the synthetic, high-TPS price stream.
//
// Kept deliberately SEPARATE from whale-replay: there is no recorded whale here, so injecting
// flash-crashes / pumps violates no real history. The opponent is a deterministic ghost bot that
// trades the SAME synthetic path (reusing replay.ts simulate()), so it races exactly like a whale.
//
// DETERMINISM + WEBVIEW SAFETY (codex's #1 risk): the price path is the SOURCE OF TRUTH — a pure
// function of (seed, injected events). We precompute it and SAMPLE it by elapsed wall-clock -> index.
// We never accumulate per-frame deltas, so an iOS webview that throttles/pauses timers just samples
// a later index of an already-correct array: zero drift. No Date.now()/Math.random() in here.

import type { Candle } from './hyperliquid'
import { simulate, type OrderIntent, type SimPoint } from './replay'

export type ScenarioKey = 'flash_crash' | 'slow_crash' | 'fast_pump' | 'slow_pump'

export const STREAM_HZ = 40
export const STREAM_DT = 1000 / STREAM_HZ // 25 ms per sub-tick — the "high TPS" stream
export const SCENARIO_PRICE0 = 100
export const SCENARIO_LENGTH_MS = 60_000
// a gentle up-drift so the passive opponent index visibly TRENDS up (a real benchmark to beat):
// doing nothing loses to a rising market; you win by actively trading + manufacturing events.
export const SCENARIO_DRIFT = 0.00002

export interface ScenarioBand {
  key: ScenarioKey
  label: string
  emoji: string
  dir: 1 | -1
  magMin: number // peak move as a fraction (variable within the band — never a fixed %)
  magMax: number
  durMinMs: number
  durMaxMs: number
}

/** Per-scenario RNG bands. Magnitude + duration are drawn within these — never a constant. */
export const SCENARIOS: Record<ScenarioKey, ScenarioBand> = {
  flash_crash: { key: 'flash_crash', label: 'Flash crash', emoji: '⚡', dir: -1, magMin: 0.08, magMax: 0.2, durMinMs: 5_000, durMaxMs: 12_000 },
  slow_crash: { key: 'slow_crash', label: 'Slow bleed', emoji: '🩸', dir: -1, magMin: 0.05, magMax: 0.14, durMinMs: 24_000, durMaxMs: 60_000 },
  fast_pump: { key: 'fast_pump', label: 'Fast pump', emoji: '🚀', dir: 1, magMin: 0.08, magMax: 0.22, durMinMs: 5_000, durMaxMs: 12_000 },
  slow_pump: { key: 'slow_pump', label: 'Slow grind', emoji: '📈', dir: 1, magMin: 0.05, magMax: 0.16, durMinMs: 24_000, durMaxMs: 60_000 },
}

export interface ScenarioEvent {
  key: ScenarioKey
  triggerIndex: number
  durIndex: number
  magnitude: number // signed peak fraction
}

// ----------------------------- seeded, indexable RNG -----------------------------
// A pure hash of (seed, index, stream) — same inputs always give the same draw, with NO state
// carried between calls. This is what makes the whole path reproducible from seed + elapsed.

function hash(a: number, b: number, k: number): number {
  let h = (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ (b + 0x165667b1) ^ Math.imul(k + 1, 0x27d4eb2f)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35) >>> 0
  h ^= h >>> 13
  return h >>> 0
}
function uniform(seed: number, i: number, k = 0): number {
  return hash(seed >>> 0, i >>> 0, k) / 0xffffffff
}
/** Standard normal via Box–Muller, deterministic per (seed, i). */
function gauss(seed: number, i: number): number {
  const u1 = Math.max(1e-9, uniform(seed, i, 1))
  const u2 = uniform(seed, i, 2)
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

// ----------------------------- the price path -----------------------------

export interface ScenarioPath {
  seed: number
  price0: number
  baseDrift: number
  baseVol: number
  events: ScenarioEvent[]
  prices: number[] // cumulative sub-tick prices WITH events — the visible tape the player trades
  basePrices: number[] // the event-free underlying — what the passive opponent index holds
}

/**
 * Event envelope: the TARGET fraction (0..~1) of the move completed at phase p in [0,1].
 * Eases in to a slight overshoot at the peak, then partially retraces — so a crash/pump looks
 * traded (impulse + overshoot + retrace), not like a straight animated ramp.
 */
function envelope(p: number): number {
  const peak = 0.6
  if (p <= 0) return 0
  if (p <= peak) {
    const x = p / peak
    return 1.08 * (1 - (1 - x) * (1 - x)) // ease-out to a small overshoot
  }
  const x = (p - peak) / (1 - peak)
  return 1.08 - 0.26 * x * x // partial retrace toward ~0.82
}

/** Per-tick drift contribution + volatility multiplier from one event at sub-tick i. */
function eventAt(ev: ScenarioEvent, i: number): { drift: number; volMul: number } {
  if (i <= ev.triggerIndex || i >= ev.triggerIndex + ev.durIndex) return { drift: 0, volMul: 1 }
  const p = (i - ev.triggerIndex) / ev.durIndex
  const pPrev = (i - 1 - ev.triggerIndex) / ev.durIndex
  const drift = ev.magnitude * (envelope(p) - envelope(pPrev)) // incremental fraction this tick
  // mild volatility bulge for texture — kept gentle so the directional move dominates and the
  // crash/pump stays readable + fair (too much expansion lets noise swamp the event).
  const volMul = 1 + 0.7 * Math.sin(Math.PI * p)
  return { drift, volMul }
}

/** Recompute the cumulative path from `from` forward (events only affect their own future). */
function recompute(path: ScenarioPath, from: number): void {
  const { prices, seed } = path
  for (let i = Math.max(0, from); i < prices.length; i++) {
    if (i === 0) {
      prices[0] = path.price0
      continue
    }
    let drift = path.baseDrift
    let vol = path.baseVol
    for (const ev of path.events) {
      const c = eventAt(ev, i)
      drift += c.drift
      vol *= c.volMul
    }
    // hard caps so stacked / button-mashed events can never overflow to Infinity/NaN:
    // bound volatility, then bound a single sub-tick's return to ±50%.
    vol = Math.min(vol, 0.05)
    const ret = Math.max(-0.5, Math.min(0.5, drift + vol * gauss(seed, i)))
    const next = prices[i - 1] * (1 + ret)
    prices[i] = Number.isFinite(next) ? Math.max(0.01, next) : Math.max(0.01, prices[i - 1])
  }
}

/** A fresh scenario path: seeded noisy walk, no events yet. */
export function createPath(
  seed: number,
  price0 = SCENARIO_PRICE0,
  lengthMs = SCENARIO_LENGTH_MS,
  drift = SCENARIO_DRIFT,
): ScenarioPath {
  // clamp external inputs to finite, sane values so a bad arg can't produce a NaN array length / path
  const p0 = Number.isFinite(price0) && price0 > 0 ? price0 : SCENARIO_PRICE0
  const len = Number.isFinite(lengthMs) && lengthMs > 0 ? lengthMs : SCENARIO_LENGTH_MS
  const dr = Number.isFinite(drift) ? drift : SCENARIO_DRIFT
  const n = Math.ceil(len / STREAM_DT) + 1
  const path: ScenarioPath = { seed: seed >>> 0, price0: p0, baseDrift: dr, baseVol: 0.0005, events: [], prices: new Array(n).fill(p0), basePrices: [] }
  recompute(path, 0)
  path.basePrices = path.prices.slice() // snapshot the event-free market the opponent index holds
  return path
}

/**
 * Inject a scenario event at wall-clock `elapsedMs`. Magnitude + duration are drawn deterministically
 * from (seed, triggerIndex, eventCount) within the scenario's band, then the path is recomputed from
 * the trigger forward. Mutates + returns the path (same seed + same trigger time => same event).
 */
export function injectEvent(path: ScenarioPath, key: ScenarioKey, elapsedMs: number): ScenarioPath {
  const band = SCENARIOS[key]
  if (!band || path.events.length >= 20) return path // unknown key or sane cap on stacked events
  const safeElapsed = Number.isFinite(elapsedMs) ? elapsedMs : 0
  const triggerIndex = Math.min(path.prices.length - 2, Math.max(0, Math.floor(safeElapsed / STREAM_DT)))
  const k = path.events.length + 1
  const magnitude = band.dir * (band.magMin + uniform(path.seed, triggerIndex, 10 + k) * (band.magMax - band.magMin))
  const durMs = band.durMinMs + uniform(path.seed, triggerIndex, 30 + k) * (band.durMaxMs - band.durMinMs)
  const durIndex = Math.max(1, Math.round(durMs / STREAM_DT))
  path.events.push({ key, triggerIndex, durIndex, magnitude })
  recompute(path, triggerIndex)
  return path
}

/** Pure sample of the path by elapsed wall-clock (clamped). Independent of call order/frequency. */
export function priceAtElapsed(path: ScenarioPath, elapsedMs: number): number {
  const e = Number.isFinite(elapsedMs) ? elapsedMs : 0
  const i = Math.min(path.prices.length - 1, Math.max(0, Math.floor(e / STREAM_DT)))
  return path.prices[i]
}

/** Sub-tick index at elapsed wall-clock — the scenario equivalent of a replay tick. */
export function streamTickAtElapsed(path: ScenarioPath, elapsedMs: number): number {
  const e = Number.isFinite(elapsedMs) ? elapsedMs : 0
  return Math.min(path.prices.length - 1, Math.max(0, Math.floor(e / STREAM_DT)))
}

/**
 * Aggregate the sub-tick stream into OHLC candles for lightweight-charts. Candles are PRESENTATION
 * only — the paper sim marks against the fast prices, not these. Reveals up to `uptoMs` if given.
 */
export function pathToCandles(path: ScenarioPath, candleMs = 1000, uptoMs?: number): Candle[] {
  const perCandle = Math.max(1, Math.round(candleMs / STREAM_DT))
  const lastI = uptoMs == null ? path.prices.length - 1 : Math.min(path.prices.length - 1, Math.floor(uptoMs / STREAM_DT))
  const t0 = 1_700_000_000_000
  const candles: Candle[] = []
  // `t` is a chart-axis value only: 1 unique second per candle so lightweight-charts never sees a
  // duplicate/non-ascending time (real cadence is governed by the replay clock's msPerTick).
  for (let start = 0, ci = 0; start <= lastI; start += perCandle, ci++) {
    const end = Math.min(lastI, start + perCandle - 1)
    let h = path.prices[start]
    let l = path.prices[start]
    for (let i = start; i <= end; i++) {
      const p = path.prices[i]
      if (p > h) h = p
      if (p < l) l = p
    }
    candles.push({ t: t0 + ci * 1000, o: path.prices[start], h, l, c: path.prices[end], v: 0 })
  }
  return candles
}

// ----------------------------- the opponent: passive market index -----------------------------

/**
 * The Arcade opponent (codex pick C): a passive 1× HODL of the UNDERLYING, event-free market —
 * startEquity scaled by the base price. The player's injected crash/pump events move the visible
 * tape they trade but NOT this index, so events are a pure player weapon (never free alpha for the
 * opponent) and the skill becomes timing + direction + event sequencing, not out-sizing a bot.
 * Returns one point per chart candle, aligned with pathToCandles(candleMs).
 */
export function indexCurve(path: ScenarioPath, startEquity: number, candleMs = 1000): SimPoint[] {
  const perCandle = Math.max(1, Math.round(candleMs / STREAM_DT))
  const base = path.basePrices.length ? path.basePrices : path.prices
  const base0 = base[0] || 1
  const curve: SimPoint[] = []
  for (let start = 0, ci = 0; start < base.length; start += perCandle, ci++) {
    const end = Math.min(base.length - 1, start + perCandle - 1)
    const p = base[end]
    curve.push({ tick: ci, equity: startEquity * (p / base0), price: p })
  }
  return curve
}

// ----------------------------- (legacy) momentum ghost bot -----------------------------

/**
 * A deterministic momentum opponent over the synthetic candles: ride the last-`look`-candle trend,
 * flip on reversal. Fixed params => its equity curve is fully determined by the scenario seed, so
 * it's fair and reproducible. Reuses the real paper engine for execution (positions/lev/liq/fees).
 */
export function botOrders(candles: Candle[], size: number, leverage: number, look = 4): OrderIntent[] {
  const orders: OrderIntent[] = []
  let side: 'long' | 'short' | null = null
  for (let t = look; t < candles.length; t++) {
    const mom = candles[t].c - candles[t - look].c
    const want: 'long' | 'short' | null = mom > 0 ? 'long' : mom < 0 ? 'short' : side
    if (want && want !== side) {
      orders.push({ tick: t, action: want === 'long' ? 'open_long' : 'open_short', size, leverage })
      side = want
    }
  }
  return orders
}

/** The bot's mark-to-market equity curve over the synthetic candles (reuses simulate()). */
export function botCurve(candles: Candle[], startEquity: number, size: number, leverage: number, upToTick: number): SimPoint[] {
  return simulate(candles, botOrders(candles, size, leverage), startEquity, upToTick).curve
}
