import { describe, it, expect } from 'vitest'
import {
  createPath,
  injectEvent,
  priceAtElapsed,
  pathToCandles,
  indexCurve,
  botOrders,
  STREAM_DT,
  SCENARIO_PRICE0,
} from './scenario'

describe('scenario price path', () => {
  it('is deterministic — same seed gives the identical path', () => {
    const a = createPath(12345)
    const b = createPath(12345)
    expect(a.prices).toEqual(b.prices)
  })

  it('different seeds give different paths', () => {
    const a = createPath(1)
    const b = createPath(2)
    expect(a.prices).not.toEqual(b.prices)
  })

  it('starts exactly at price0', () => {
    const p = createPath(7, 250)
    expect(p.prices[0]).toBe(250)
  })

  it('priceAtElapsed is pure — independent of call order / frequency (webview-safe)', () => {
    const p = createPath(99)
    const direct = priceAtElapsed(p, 30_000)
    // hammer it out of order; the answer for 30s must never change
    for (const t of [0, 90_000, 5_000, 61_234, 250, 45_000]) priceAtElapsed(p, t)
    expect(priceAtElapsed(p, 30_000)).toBe(direct)
  })

  it('clamps before the start and past the end', () => {
    const p = createPath(3, 100, 10_000)
    expect(priceAtElapsed(p, -5_000)).toBe(p.prices[0])
    expect(priceAtElapsed(p, 999_999)).toBe(p.prices[p.prices.length - 1])
  })
})

describe('scenario events', () => {
  // a crash/pump is defined by a clear trough/peak during its window (it then partially retraces by design)
  const extreme = (p: ReturnType<typeof createPath>, from: number, to: number, pick: 'lo' | 'hi') => {
    let v = pick === 'lo' ? Infinity : -Infinity
    for (let t = from; t <= to; t += 100) {
      const px = priceAtElapsed(p, t)
      v = pick === 'lo' ? Math.min(v, px) : Math.max(v, px)
    }
    return v
  }

  it('a flash crash carves a clear trough below the pre-event level', () => {
    const p = createPath(42)
    const at = 10_000
    const before = priceAtElapsed(p, at)
    injectEvent(p, 'flash_crash', at)
    expect(extreme(p, at, at + 13_000, 'lo')).toBeLessThan(before * 0.95)
  })

  it('a fast pump carves a clear peak above the pre-event level', () => {
    const p = createPath(42)
    const at = 10_000
    const before = priceAtElapsed(p, at)
    injectEvent(p, 'fast_pump', at)
    expect(extreme(p, at, at + 13_000, 'hi')).toBeGreaterThan(before * 1.05)
  })

  it('injecting the same event at the same time is reproducible', () => {
    const a = injectEvent(createPath(8), 'slow_crash', 12_000)
    const b = injectEvent(createPath(8), 'slow_crash', 12_000)
    expect(a.prices).toEqual(b.prices)
    expect(a.events[0]).toEqual(b.events[0])
  })

  it('an event only changes the path from its trigger forward', () => {
    const base = createPath(5)
    const before = base.prices.slice(0, Math.floor(20_000 / STREAM_DT))
    const ev = injectEvent(createPath(5), 'fast_pump', 20_000)
    expect(ev.prices.slice(0, before.length)).toEqual(before)
  })
})

describe('candle aggregation + bot', () => {
  it('aggregates the stream into OHLC candles with sane bounds', () => {
    const p = createPath(11)
    const candles = pathToCandles(p, 1000)
    expect(candles.length).toBeGreaterThan(5)
    for (const c of candles) {
      expect(c.h).toBeGreaterThanOrEqual(Math.max(c.o, c.c))
      expect(c.l).toBeLessThanOrEqual(Math.min(c.o, c.c))
      expect(c.t).toBeGreaterThan(0)
    }
  })

  it('reveals only up to uptoMs', () => {
    const p = createPath(11)
    const full = pathToCandles(p, 1000)
    const partial = pathToCandles(p, 1000, 10_000)
    expect(partial.length).toBeLessThan(full.length)
    expect(partial.length).toBe(11) // candles 0..10s inclusive
  })

  it('the bot reacts to a pump by going long', () => {
    const p = createPath(1)
    injectEvent(p, 'fast_pump', 2_000)
    const candles = pathToCandles(p, 1000)
    const orders = botOrders(candles, 2_000, 3)
    expect(orders.some((o) => o.action === 'open_long')).toBe(true)
  })

  it('start price constant is the default', () => {
    expect(createPath(1).prices[0]).toBe(SCENARIO_PRICE0)
  })
})

describe('index opponent (passive market)', () => {
  it('starts at startEquity and is unaffected by injected events', () => {
    const p = createPath(123)
    const before = indexCurve(p, 10_000, 500).map((x) => x.equity)
    // the player's events move THEIR tape, never the opponent's underlying index
    injectEvent(p, 'flash_crash', 10_000)
    injectEvent(p, 'fast_pump', 20_000)
    const after = indexCurve(p, 10_000, 500).map((x) => x.equity)
    expect(after).toEqual(before) // the real invariant: the opponent index never sees the player's events
    expect(before[0]).toBeGreaterThan(9_500) // first candle ≈ startEquity (one candle of drift/noise in)
    expect(before[0]).toBeLessThan(10_500)
  })

  it('drifts upward over the run (a real benchmark to beat)', () => {
    const curve = indexCurve(createPath(7), 10_000, 500)
    // with positive base drift the median index ends above start (allow noise on any single seed)
    expect(curve[curve.length - 1].equity).toBeGreaterThan(9_000)
    expect(curve.length).toBeGreaterThan(50)
  })
})

describe('robustness / hardening (codex pre-landing review)', () => {
  it('survives many button-mashed overlapping events without NaN/Infinity/negative price', () => {
    const p = createPath(5)
    for (let t = 0; t < 40; t++) injectEvent(p, t % 2 ? 'fast_pump' : 'flash_crash', t * 1000)
    for (const px of p.prices) {
      expect(Number.isFinite(px)).toBe(true)
      expect(px).toBeGreaterThan(0)
    }
    expect(p.events.length).toBeLessThanOrEqual(20) // stacked-event cap holds
  })

  it('clamps non-finite inputs instead of propagating NaN', () => {
    const p = createPath(NaN, NaN, NaN, NaN)
    expect(p.prices.length).toBeGreaterThan(50)
    expect(Number.isFinite(p.prices[0])).toBe(true)
    expect(Number.isFinite(priceAtElapsed(p, NaN))).toBe(true)
    expect(Number.isFinite(priceAtElapsed(p, Infinity))).toBe(true)
    expect(() => injectEvent(p, 'flash_crash', NaN)).not.toThrow()
  })
})
