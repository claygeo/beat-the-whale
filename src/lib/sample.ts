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

/**
 * A sample whale: long early, take profit, flip short, cover — a lively ghost to race.
 * Size is chosen so the position notional ≈ the player's start equity (peak notional ≈ $10k,
 * so scale ≈ 1), and realized PnL is derived from the real price move — keeping it consistent
 * with whaleCurve's mark-to-market so the curve ramps smoothly instead of stepping.
 */
export function sampleGhost(candles: Candle[]): GhostTrade[] {
  if (candles.length < 91) return []
  const SZ = 100 // @ price ~100 → ~$10k notional → scale ≈ 1
  const longEntry = candles[10].c
  const longExit = candles[45].c
  const shortEntry = candles[60].c
  const shortExit = candles[90].c
  const r = (n: number) => Math.round(n)
  return [
    { tickIndex: 10, side: 'B', dir: 'Open Long', px: longEntry, sz: SZ, closedPnl: 0 },
    { tickIndex: 45, side: 'A', dir: 'Close Long', px: longExit, sz: SZ, closedPnl: r(SZ * (longExit - longEntry)) },
    { tickIndex: 60, side: 'A', dir: 'Open Short', px: shortEntry, sz: SZ, closedPnl: 0 },
    { tickIndex: 90, side: 'B', dir: 'Close Short', px: shortExit, sz: SZ, closedPnl: r(SZ * (shortEntry - shortExit)) },
  ]
}
