// Deterministic replay + paper-trading engine — the core of Beat the Whale.
//
// CRITICAL (webview-safe, per ARCHITECTURE.md): every piece of visible state is a PURE
// function of (attemptStart + elapsed wall-clock) -> tick. We never accumulate frame deltas.
// If an in-app WKWebView throttles or pauses its timers, we recompute from elapsed time and
// the view snaps back to the correct state with zero drift. No Date.now()/Math.random() in here.

import type { Candle } from './hyperliquid'

export type Side = 'long' | 'short'

export interface GhostTrade {
  tickIndex: number
  side: 'B' | 'A'
  dir: string | null
  px: number
  sz: number
  closedPnl: number
}

export type OrderAction = 'open_long' | 'open_short' | 'close' | 'adjust'

export interface OrderIntent {
  tick: number // replay tick at which the order is placed
  action: OrderAction
  size: number // notional (USD) for opens / adjust; ignored for close
  leverage: number
}

// ----------------------------- clock -----------------------------

/** Current replay tick from elapsed wall-clock. Pure; clamps to [0, tickCount]. */
export function tickAtElapsed(elapsedMs: number, msPerTick: number, tickCount: number): number {
  if (elapsedMs <= 0 || msPerTick <= 0) return 0
  return Math.min(Math.floor(elapsedMs / msPerTick), tickCount)
}

// ------------------------ paper-trading sim ------------------------

const TAKER_FEE = 0.00035 // 3.5 bps per side, HL-ish

export interface Position {
  side: Side
  notional: number // position size in USD, at entry
  entry: number // average entry price
  leverage: number
}

export interface SimPoint {
  tick: number
  equity: number
  price: number
}

export interface SimResult {
  curve: SimPoint[] // equity at each tick 0..upToTick
  finalEquity: number
  realizedPnl: number
  liquidated: boolean
  liquidatedAtTick: number | null
}

/** PnL (USD) of a position marked at `price`. */
function positionPnl(pos: Position, price: number): number {
  const ret = (price - pos.entry) / pos.entry
  return pos.notional * ret * (pos.side === 'long' ? 1 : -1)
}

/** Realized PnL delta (including the close fee) of closing `pos` at `price`. */
function closeDelta(pos: Position, price: number): number {
  return positionPnl(pos, price) - pos.notional * TAKER_FEE
}

/**
 * Deterministically simulate the player's account over `candles[0..upToTick]`.
 * One position at a time; orders fill at the candle close; mark-to-market each tick;
 * liquidation checked against the candle's adverse extreme. Pure — same inputs, same output.
 *
 * Invariant: cash === startEquity + realizedPnl at all times (cash only moves on realized events).
 */
export function simulate(
  candles: Candle[],
  orders: OrderIntent[],
  startEquity: number,
  upToTick: number,
): SimResult {
  const ordersByTick = new Map<number, OrderIntent[]>()
  for (const o of orders) {
    const arr = ordersByTick.get(o.tick)
    if (arr) arr.push(o)
    else ordersByTick.set(o.tick, [o])
  }

  let cash = startEquity
  let realized = 0
  let pos: Position | null = null
  let liquidated = false
  let liquidatedAtTick: number | null = null
  const curve: SimPoint[] = []

  const lastTick = Math.min(upToTick, candles.length - 1)

  for (let tick = 0; tick <= lastTick; tick++) {
    const candle = candles[tick]
    if (!liquidated) {
      const fill = candle.c
      for (const o of ordersByTick.get(tick) ?? []) {
        if (o.action === 'close') {
          if (pos) {
            const d = closeDelta(pos, fill)
            cash += d
            realized += d
            pos = null
          }
        } else if (o.action === 'open_long' || o.action === 'open_short') {
          if (pos) {
            const d = closeDelta(pos, fill) // flip: realize the old position first
            cash += d
            realized += d
            pos = null
          }
          const openFee = o.size * TAKER_FEE
          cash -= openFee
          realized -= openFee
          pos = {
            side: o.action === 'open_long' ? 'long' : 'short',
            notional: Math.max(0, o.size),
            entry: fill,
            leverage: Math.max(1, o.leverage),
          }
        } else if (o.action === 'adjust' && pos) {
          pos = { side: pos.side, notional: Math.max(0, o.size), entry: pos.entry, leverage: pos.leverage }
        }
      }

      // liquidation: does the candle's adverse extreme wipe the posted margin?
      if (pos) {
        const adverse = pos.side === 'long' ? candle.l : candle.h
        const maintenance = pos.notional / pos.leverage
        if (-positionPnl(pos, adverse) >= maintenance) {
          cash -= maintenance
          realized -= maintenance
          pos = null
          liquidated = true
          liquidatedAtTick = tick
        }
      }
    }

    const unreal = pos ? positionPnl(pos, candle.c) : 0
    curve.push({ tick, equity: cash + unreal, price: candle.c })
  }

  return {
    curve,
    finalEquity: curve.length ? curve[curve.length - 1].equity : startEquity,
    realizedPnl: realized,
    liquidated,
    liquidatedAtTick,
  }
}

// --------------------------- whale ghost ---------------------------

/**
 * The whale's equity curve, MARKED TO MARKET so it races live instead of teleporting at closes.
 *
 * We reconstruct the whale's open position from its fills (signed size + VWAP entry, handling
 * adds / partial closes / flips) and, at every tick, value it against the candle close — exactly
 * how a real account's equity moves. Realized PnL still comes from the authoritative on-chain
 * `closedPnl`; unrealized PnL is marked in the SAME normalized units by deriving `scale` from the
 * peak fill notional (the identical factor challenge.ts used to scale closedPnl), so the realized
 * and unrealized pieces are consistent and the curve is seamless across a close.
 *
 * Pure: same (ghost, candles, startEquity) -> same curve.
 */
export function whaleCurve(ghost: GhostTrade[], candles: Candle[], startEquity: number): SimPoint[] {
  const tickCount = Math.max(0, candles.length - 1)
  // same normalization factor challenge.ts applied to closedPnl: $startEquity per peak fill notional
  const peakNotional = Math.max(1, ...ghost.map((g) => Math.abs(g.sz * g.px)))
  const scale = startEquity / peakNotional

  const byTick = new Map<number, GhostTrade[]>()
  for (const g of ghost) {
    const arr = byTick.get(g.tickIndex)
    if (arr) arr.push(g)
    else byTick.set(g.tickIndex, [g])
  }

  let realized = 0
  let q = 0 // signed position, coin units (+long / -short)
  let entry = 0 // VWAP entry of the open exposure
  const curve: SimPoint[] = []

  for (let tick = 0; tick <= tickCount; tick++) {
    for (const g of byTick.get(tick) ?? []) {
      realized += g.closedPnl // on-chain authoritative; nonzero only on closing fills
      const signed = g.side === 'B' ? g.sz : -g.sz
      const next = q + signed
      if (q === 0 || q > 0 === signed > 0) {
        // opening or adding in the same direction → volume-weight the entry
        entry = next !== 0 ? (entry * q + g.px * signed) / next : g.px
      } else if (next !== 0 && next > 0 !== q > 0) {
        // flipped through zero → fresh entry at this fill
        entry = g.px
      } // else: reducing toward zero → entry unchanged (realized handled by closedPnl)
      q = next
    }
    const price = candles[tick]?.c ?? 0
    const unreal = q !== 0 ? q * (price - entry) * scale : 0
    curve.push({ tick, equity: startEquity + realized + unreal, price })
  }
  return curve
}
