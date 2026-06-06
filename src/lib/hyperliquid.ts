// Hyperliquid public `info` API client (no auth, free).
// Docs: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint
//
// Constraints baked in:
//  - candleSnapshot serves only the most recent ~5000 candles/coin (see ARCHITECTURE.md).
//  - userFillsByTime returns up to 500/page, 10k total, and each fill carries closedPnl
//    (authoritative realized PnL — the whale's "real number").

const INFO_URL = 'https://api.hyperliquid.xyz/info'

export type CandleInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d'

/** Raw candle from `candleSnapshot`. */
interface HlRawCandle {
  t: number // open time (ms)
  T: number // close time (ms)
  s: string // coin
  i: string // interval
  o: string
  c: string
  h: string
  l: string
  v: string // base volume
  n: number // trade count
}

/** Normalized candle for the replay engine. */
export interface Candle {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

/** Raw fill from `userFillsByTime`. */
export interface HlFill {
  coin: string
  px: string
  sz: string
  side: 'B' | 'A' // buy / sell(ask)
  time: number
  startPosition: string
  dir: string // e.g. "Open Long", "Close Short"
  closedPnl: string
  hash: string
  oid: number
  crossed: boolean
  fee: string
  tid: number
}

async function infoRequest<T>(body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(INFO_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    throw new Error(`Hyperliquid info request failed: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T
}

/** Historical OHLCV for `[startTime, endTime]` (epoch ms). ~5000-candle lookback cap applies. */
export async function fetchCandles(
  coin: string,
  interval: CandleInterval,
  startTime: number,
  endTime: number,
  signal?: AbortSignal,
): Promise<Candle[]> {
  const raw = await infoRequest<HlRawCandle[]>(
    { type: 'candleSnapshot', req: { coin, interval, startTime, endTime } },
    signal,
  )
  return raw
    .map((k) => ({ t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v }))
    .sort((a, b) => a.t - b.t)
}

/** A wallet's fills within `[startTime, endTime]`. Paginates (500/page) up to HL's 10k cap. */
export async function fetchUserFillsByTime(
  user: string,
  startTime: number,
  endTime: number,
  signal?: AbortSignal,
): Promise<HlFill[]> {
  const all: HlFill[] = []
  let cursor = startTime
  // Cap pagination: very active wallets (HFT/MM) have tens of thousands of fills; we only need a
  // representative recent slice to build a challenge, and many sequential pages would hang the UI.
  for (let page = 0; page < 5; page++) {
    const batch = await infoRequest<HlFill[]>(
      { type: 'userFillsByTime', user, startTime: cursor, endTime },
      signal,
    )
    if (batch.length === 0) break
    all.push(...batch)
    if (batch.length < 500) break
    const lastTime = batch[batch.length - 1].time
    if (lastTime <= cursor) break // no forward progress — stop
    cursor = lastTime + 1
  }
  // de-dupe by trade id (pagination boundary overlap guard)
  const seen = new Set<number>()
  return all.filter((f) => (seen.has(f.tid) ? false : (seen.add(f.tid), true)))
}

/** Sum of realized PnL over a set of fills — the whale's target number. */
export function realizedPnl(fills: HlFill[]): number {
  return fills.reduce((acc, f) => acc + Number(f.closedPnl), 0)
}
