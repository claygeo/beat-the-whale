// Deterministic sample data so the UI is verifiable offline (no network / whale needed yet).
// Replaced by live Hyperliquid data once the chart + replay are proven.
import type { Candle } from './hyperliquid'
import type { GhostTrade } from './replay'

/** Seeded LCG — identical sample every load (determinism matters for the replay). */
function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

export function sampleCandles(count = 120, start = 100, seed = 42): Candle[] {
  const rnd = lcg(seed)
  const out: Candle[] = []
  let price = start
  const t0 = 1_700_000_000_000 // fixed epoch-ms base
  for (let i = 0; i < count; i++) {
    const drift = Math.sin(i / 9) * 0.004
    const shock = (rnd() - 0.5) * 0.018
    const o = price
    const c = Math.max(1, o * (1 + drift + shock))
    const h = Math.max(o, c) * (1 + rnd() * 0.006)
    const l = Math.min(o, c) * (1 - rnd() * 0.006)
    out.push({ t: t0 + i * 300_000, o, h, l, c, v: 100 + rnd() * 50 })
    price = c
  }
  return out
}

/** A sample whale: long early, take profit, flip short, cover — a lively ghost to race. */
export function sampleGhost(candles: Candle[]): GhostTrade[] {
  if (candles.length < 91) return []
  const at = (i: number, dir: string, side: 'B' | 'A', pnl: number): GhostTrade => ({
    tickIndex: i,
    side,
    dir,
    px: candles[i].c,
    sz: 1,
    closedPnl: pnl,
  })
  return [
    at(10, 'Open Long', 'B', 0),
    at(45, 'Close Long', 'A', 320),
    at(60, 'Open Short', 'A', 0),
    at(90, 'Close Short', 'B', -120),
  ]
}
