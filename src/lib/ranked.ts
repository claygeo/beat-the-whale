// Ranked (daily challenge) client — talks only to the anon SECURITY DEFINER RPCs.
// Kept separate from challenge.ts so the tsx seed script (which imports challenge.ts) never pulls
// in supabase.ts / import.meta.env.
import { rpc } from './supabase'
import type { Challenge } from './challenge'
import type { Candle, CandleInterval } from './hyperliquid'
import type { GhostTrade } from './replay'

interface ChallengeMeta {
  id: string
  challenge_date: string
  coin: string
  candle_interval: string
  tick_count: number
  whale_realized_pnl: number | string
  whale_start_equity: number | string
  is_ranked: boolean
}

export interface RankedChallenge extends Challenge {
  challengeId: string
  challengeDate: string
}

/** Today's live ranked challenge (frozen candles + ghost), or null if none is live. */
export async function loadDailyChallenge(): Promise<RankedChallenge | null> {
  const rows = await rpc<ChallengeMeta[] | ChallengeMeta | null>('get_active_challenge')
  const meta = Array.isArray(rows) ? rows[0] : rows
  if (!meta) return null
  const replay = await rpc<{ candles: unknown[]; ghost: unknown[] } | null>('get_challenge_replay', {
    p_challenge_id: meta.id,
  })
  if (!replay) return null
  const candles: Candle[] = (replay.candles ?? []).map((c) => {
    const r = c as Record<string, unknown>
    return { t: +String(r.t), o: +String(r.o), h: +String(r.h), l: +String(r.l), c: +String(r.c), v: +String(r.v) }
  })
  const ghost: GhostTrade[] = (replay.ghost ?? []).map((g) => {
    const r = g as Record<string, unknown>
    return {
      tickIndex: +String(r.tickIndex),
      side: r.side as 'B' | 'A',
      dir: (r.dir as string | null) ?? null,
      px: +String(r.px),
      sz: +String(r.sz),
      closedPnl: +String(r.closedPnl),
    }
  })
  return {
    challengeId: meta.id,
    challengeDate: meta.challenge_date,
    coin: meta.coin,
    label: 'Daily',
    address: meta.id,
    candles,
    ghost,
    whaleRealizedPnl: +String(meta.whale_realized_pnl),
    startEquity: +String(meta.whale_start_equity),
    interval: meta.candle_interval as CandleInterval,
  }
}

/** Stable per-device id (localStorage) for the one-ranked-attempt-per-day guard. */
export function deviceHash(): string {
  const k = 'btw_device'
  let v = localStorage.getItem(k)
  if (!v) {
    v = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.round(Math.random() * 1e9)}`)
    localStorage.setItem(k, v)
  }
  return v
}

export interface SubmitResult {
  final_pnl: number
  beat_whale: boolean
  leaderboard_rank: number
}

/** Submit a ranked attempt. Throws with a Postgres error message (e.g. 'already_played'). */
export async function submitRankedAttempt(args: {
  challengeId: string
  handle: string
  finalPnl: number
  beatWhale: boolean
  orders: unknown[]
}): Promise<SubmitResult> {
  const rows = await rpc<SubmitResult[]>('submit_ranked_attempt', {
    p_challenge_id: args.challengeId,
    p_handle: args.handle,
    p_device_hash: deviceHash(),
    p_session_hash: deviceHash(),
    p_final_pnl: args.finalPnl,
    p_beat_whale: args.beatWhale,
    p_orders: args.orders,
  })
  return Array.isArray(rows) ? rows[0] : (rows as unknown as SubmitResult)
}

export interface LeaderboardRow {
  leaderboard_rank: number
  handle: string
  final_pnl: number
  beat_whale: boolean
  score: number
  submitted_at: string
}

export async function getLeaderboard(challengeId: string, limit = 50): Promise<LeaderboardRow[]> {
  return rpc<LeaderboardRow[]>('get_leaderboard', { p_challenge_id: challengeId, p_limit: limit })
}
