import { fetchCandles, fetchUserFillsByTime, type Candle, type CandleInterval } from './hyperliquid'
import type { GhostTrade } from './replay'

export interface Challenge {
  coin: string
  label: string
  address: string
  candles: Candle[]
  ghost: GhostTrade[]
  whaleRealizedPnl: number
  startEquity: number
  interval: CandleInterval
}

const DAY = 24 * 60 * 60 * 1000
const FIVE_MIN = 5 * 60 * 1000
const START_EQUITY = 10_000

/** Index of the candle whose window contains time `t` (candles ascending by t). */
function tickForTime(candles: Candle[], t: number): number {
  let lo = 0
  let hi = candles.length - 1
  let idx = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (candles[mid].t <= t) {
      idx = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return idx
}

/** Featured whales (top recent leaderboard performers with live activity). */
export const FEATURED_WHALES: { address: string; label: string }[] = [
  { address: '0x0ddf9bae2af4b874b96d287a5ad42eb47138a902', label: 'Top weekly whale' },
  { address: '0x7fdafde5cfb5465924316eced2d3715494c517d1', label: 'Whale #2' },
  { address: '0xb83de012dba672c76a7dbbbf3e459cb59d7d6e36', label: 'Whale #3' },
]

export function isValidAddress(a: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(a.trim())
}

/**
 * Build a challenge from a real Hyperliquid wallet: its most-traded coin over the recent window,
 * replayed with the whale's actual fills as the ghost. Throws a user-readable error on no usable
 * activity.
 *
 * Normalization: a whale's absolute PnL (often millions) is meaningless against the player's $10k.
 * We express the whale as a % return on their peak position notional, applied to the same $10k —
 * so the two equity curves race on equal terms. (Free-play approximation; ranked will be stricter.)
 */
export async function buildChallengeFromWallet(
  address: string,
  opts: { label?: string; lookbackDays?: number; interval?: CandleInterval } = {},
): Promise<Challenge> {
  const addr = address.trim()
  if (!isValidAddress(addr)) throw new Error('Enter a valid 0x wallet address.')

  const now = Date.now()
  const lookback = (opts.lookbackDays ?? 10) * DAY
  const interval: CandleInterval = opts.interval ?? '5m'

  const fills = await fetchUserFillsByTime(addr, now - lookback, now)
  if (fills.length === 0) throw new Error('This wallet has no trades in the last 10 days to race.')

  // dominant coin by fill count
  const counts = new Map<string, number>()
  for (const f of fills) counts.set(f.coin, (counts.get(f.coin) ?? 0) + 1)
  const coin = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
  const allCoinFills = fills.filter((f) => f.coin === coin).sort((a, b) => a.time - b.time)
  if (allCoinFills.length < 2) throw new Error('Not enough trades on one market to make a race.')
  // cap to the most recent trades so the replay window stays bounded and the ghost readable
  const coinFills = allCoinFills.slice(-40)

  // window padded around the activity, clamped to now
  const pad = 12 * FIVE_MIN
  const windowStart = coinFills[0].time - pad
  const windowEnd = Math.min(now, coinFills[coinFills.length - 1].time + pad)

  const candles = await fetchCandles(coin, interval, windowStart, windowEnd)
  if (candles.length < 10) throw new Error('Not enough price history for this window — try another wallet.')

  // normalize: peak position notional → scale so the whale races on the player's $10k
  const peakNotional = Math.max(
    ...coinFills.map((f) => Math.abs(Number(f.sz) * Number(f.px))),
    1,
  )
  const scale = START_EQUITY / peakNotional

  const ghost: GhostTrade[] = coinFills.map((f) => ({
    tickIndex: tickForTime(candles, f.time),
    side: f.side,
    dir: f.dir,
    px: Number(f.px),
    sz: Number(f.sz),
    closedPnl: Number(f.closedPnl) * scale,
  }))

  const whaleRealizedPnl = ghost.reduce((acc, g) => acc + g.closedPnl, 0)

  return {
    coin,
    label: opts.label ?? `${addr.slice(0, 6)}…${addr.slice(-4)}`,
    address: addr,
    candles,
    ghost,
    whaleRealizedPnl,
    startEquity: START_EQUITY,
    interval,
  }
}
