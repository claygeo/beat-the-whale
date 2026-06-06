# Architecture

Locked via codex (gpt-5.5, xhigh reasoning) before implementation — 2026-06-06.

## Topology
- **Frontend:** React + Vite + TS SPA · TailwindCSS · lightweight-charts. Hosted on Netlify.
- **Backend:** Netlify Functions only (no Render for v1 — scoring is stateless and event-driven).
- **Database:** Supabase Postgres ($10 tier).

## Daily challenge data (frozen + immutable)
A scheduled job picks the day's whale + window and **snapshots the whale fills and window candles
into immutable Supabase tables at creation time.** This (a) guarantees every player races the exact
same dataset, and (b) sidesteps Hyperliquid's ~5000-candle API lookback cap. Integrity checks at
freeze time: coverage, duplicate-fill, candle-continuity, and a dataset hash.

**Ranked data is revealed progressively** — the client never receives future candles or ghost
trades ahead of the replay tick.

## Scoring trust boundary
- **Free-play:** scored client-side (instant, fun, unranked).
- **Ranked:** **server-authoritative.** The client sends timestamped *order intents only* — never a
  final PnL. The server records receipt time, maps it to the replay tick, rejects late / look-ahead
  / impossible orders, and recomputes execution + PnL from the frozen data. Client-side PnL is
  display-only.

## Identity & anti-cheat (v1)
Anonymous handle + signed attempt session + server validation + **one ranked attempt per day** +
IP/device/session throttles + basic abuse detection. No wallet signature or X-OAuth at launch
(no prizes / money involved).

## Cross-platform replay engine (the critical constraint)
Targets include the iOS Twitter/Instagram in-app webviews (WKWebView), which throttle and pause
timers and resize unpredictably. Therefore the replay engine derives **visible state as a pure
function of `(serverAttemptStart + replayTick)` against wall-clock elapsed time — never from
accumulated frame deltas.** If the webview throttles or pauses, the engine recomputes the correct
state on resume with zero drift. Device pixel ratio is capped; challenge data streams in
progressive chunks.

## Data source
Hyperliquid public `info` API (no auth, free):
- `candleSnapshot` — OHLCV, most recent ~5000 candles/coin (1m≈3.5d … 1h≈7mo lookback).
- `userFillsByTime` — up to 10k fills, 500/page; each fill carries `closedPnl` (authoritative
  realized PnL). The whale's "real number" comes straight from the chain.
