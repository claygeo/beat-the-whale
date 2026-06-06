import { describe, it, expect } from 'vitest'
import { tickAtElapsed, simulate, whaleCurve, type OrderIntent, type GhostTrade } from './replay'
import type { Candle } from './hyperliquid'

/** Build a candle series from a list of closes (flat candles: o=h=l=c). */
function candles(closes: number[]): Candle[] {
  return closes.map((c, i) => ({ t: i * 1000, o: c, h: c, l: c, c, v: 0 }))
}

const FEE = 0.00035

describe('tickAtElapsed', () => {
  it('floors elapsed / msPerTick and clamps to [0, tickCount]', () => {
    expect(tickAtElapsed(0, 500, 10)).toBe(0)
    expect(tickAtElapsed(-100, 500, 10)).toBe(0)
    expect(tickAtElapsed(1250, 500, 10)).toBe(2)
    expect(tickAtElapsed(999_999, 500, 10)).toBe(10) // clamped to tickCount
  })
})

describe('simulate', () => {
  it('a long riding a +10% move books ~+10% of notional, minus the open fee', () => {
    const cs = candles([100, 100, 110])
    const orders: OrderIntent[] = [{ tick: 0, action: 'open_long', size: 1000, leverage: 1 }]
    const r = simulate(cs, orders, 10_000, 2)
    expect(r.finalEquity).toBeCloseTo(10_000 + 100 - 1000 * FEE, 2)
    expect(r.liquidated).toBe(false)
  })

  it('a short profits when price falls', () => {
    const cs = candles([100, 90])
    const orders: OrderIntent[] = [{ tick: 0, action: 'open_short', size: 1000, leverage: 1 }]
    const r = simulate(cs, orders, 10_000, 1)
    expect(r.finalEquity).toBeCloseTo(10_000 + 100 - 1000 * FEE, 2)
  })

  it('liquidates a 10x long when price craters past the posted margin', () => {
    const cs = candles([100, 80]) // -20% loss vs 1/10 maintenance
    const orders: OrderIntent[] = [{ tick: 0, action: 'open_long', size: 1000, leverage: 10 }]
    const r = simulate(cs, orders, 10_000, 1)
    expect(r.liquidated).toBe(true)
    expect(r.liquidatedAtTick).toBe(1)
    // loses exactly the posted margin (1000/10 = 100) plus the open fee
    expect(r.finalEquity).toBeCloseTo(10_000 - 100 - 1000 * FEE, 2)
  })

  it('closing realizes pnl and stops further marking', () => {
    const cs = candles([100, 110, 50])
    const orders: OrderIntent[] = [
      { tick: 0, action: 'open_long', size: 1000, leverage: 1 },
      { tick: 1, action: 'close', size: 0, leverage: 1 },
    ]
    const r = simulate(cs, orders, 10_000, 2)
    const expected = 10_000 + 100 - 1000 * FEE - 1000 * FEE // open fee + close fee
    expect(r.finalEquity).toBeCloseTo(expected, 2)
    expect(r.realizedPnl).toBeCloseTo(100 - 2 * 1000 * FEE, 2)
  })

  it('is deterministic — identical inputs give identical output', () => {
    const cs = candles([100, 105, 103, 108])
    const orders: OrderIntent[] = [{ tick: 1, action: 'open_long', size: 500, leverage: 2 }]
    const a = simulate(cs, orders, 10_000, 3)
    const b = simulate(cs, orders, 10_000, 3)
    expect(a).toEqual(b)
  })
})

describe('whaleCurve', () => {
  it('steps cumulative closedPnl at the fill ticks (no open size to mark)', () => {
    const ghost: GhostTrade[] = [
      { tickIndex: 1, side: 'A', dir: null, px: 0, sz: 0, closedPnl: 50 },
      { tickIndex: 3, side: 'A', dir: null, px: 0, sz: 0, closedPnl: -20 },
    ]
    const curve = whaleCurve(ghost, candles([100, 100, 100, 100, 100]), 10_000)
    expect(curve.map((p) => p.equity)).toEqual([10_000, 10_050, 10_050, 10_030, 10_030])
  })

  it('marks an open position to market each tick (no teleporting at the close)', () => {
    // one fill: sz 10 @ px 100 → peak notional 1000 → scale = 10000/1000 = 10
    const cs = candles([100, 110, 120])
    const ghost: GhostTrade[] = [{ tickIndex: 0, side: 'B', dir: 'Open Long', px: 100, sz: 10, closedPnl: 0 }]
    const curve = whaleCurve(ghost, cs, 10_000)
    const scale = 10_000 / (10 * 100)
    expect(curve.map((p) => p.equity)).toEqual([
      10_000,
      10_000 + 10 * (110 - 100) * scale,
      10_000 + 10 * (120 - 100) * scale,
    ])
  })

  it('converts unrealized to realized seamlessly on close', () => {
    const cs = candles([100, 110, 110])
    const ghost: GhostTrade[] = [
      { tickIndex: 0, side: 'B', dir: 'Open Long', px: 100, sz: 10, closedPnl: 0 },
      { tickIndex: 1, side: 'A', dir: 'Close Long', px: 110, sz: 10, closedPnl: 833 },
    ]
    const curve = whaleCurve(ghost, cs, 10_000)
    // after the close the position is flat → equity holds at startEquity + realized
    expect(curve[1].equity).toBeCloseTo(10_833, 6)
    expect(curve[2].equity).toBeCloseTo(10_833, 6)
  })

  it('marks a short: equity rises as price falls', () => {
    const cs = candles([100, 90])
    const ghost: GhostTrade[] = [{ tickIndex: 0, side: 'A', dir: 'Open Short', px: 100, sz: 10, closedPnl: 0 }]
    const curve = whaleCurve(ghost, cs, 10_000)
    expect(curve[1].equity).toBeGreaterThan(curve[0].equity)
  })
})
