# Beat the Whale — running.md

> Living checklist + decision log. Updated every step. Single source of truth for status.
> Owner: Claude (full autonomy). Operator: @deforestpeg (Clayton).
> Bar: **production 10/10**. Targets: **desktop + iOS Safari + Twitter/IG in-app webviews**.

## What it is
Race a real Hyperliquid whale's recorded trades. Replay a historical market window on an
animated chart; the whale's real entries/exits appear as "ghost" markers at the true
timestamps; you paper-trade the same window trying to beat their realized PnL; two equity
curves race live. **Daily one-shot challenge** (everyone same whale+window, Wordle-style) +
global leaderboard, plus unranked free-play.

## Stack (locked unless codex overrides)
- Frontend: React + Vite + TypeScript, TailwindCSS, TradingView lightweight-charts
- Data: Hyperliquid public info API (candleSnapshot, userFillsByTime / closedPnl) — no auth, free
- Backend: Netlify Functions  *(pending codex: Netlify-only vs +Render)*
- DB: Supabase Postgres ($10 tier) — daily challenge, leaderboard, frozen challenge data
- Hosting: Netlify (SPA + functions). Repo: **public** GitHub `claygeo/beat-the-whale`

## Hard data facts (verified)
- candleSnapshot: only most recent ~5000 candles/coin → 1m≈3.5d, 5m≈17d, 15m≈52d, 1h≈7mo
- userFillsByTime: up to 10k fills, 500/page; each fill has `closedPnl` (authoritative realized PnL)
- Implication: freeze challenge data at creation time; favor recent whales / coarser candles for old windows

## Pipeline status
### Phase 0 — Setup
- [x] Workspace created
- [x] Toolbox verified (codex✓ gh✓claygeo node20✓ npm✓ netlify✓ git✓; supabase via MCP)
- [x] running.md created
- [ ] Git init + first commit + public GitHub repo

### Phase 1 — Plan (lock with /codex)
- [x] codex: architecture lock (hosting / data-freeze / anti-cheat / trust split / webview risk) — locked, see Decision log + ARCHITECTURE.md
- [ ] DESIGN.md (/design-consultation) — aesthetic, type, color, motion; refs Stripe/Linear
- [ ] Data model / Supabase schema
- [ ] /plan-eng-review (architecture lock)
- [ ] /plan-design-review (design plan)

### Phase 2 — Provision
- [ ] Supabase project ($10) via MCP + schema migration
- [ ] Netlify site + env vars
- [ ] GitHub repo live

### Phase 3 — Build
- [ ] Frontend scaffold + design system + responsive shell (desktop/iOS/webview)
- [ ] HL data layer (candles, whale fills, closedPnl) + types
- [ ] Replay engine (deterministic sim clock, candle stream, no look-ahead)
- [ ] Chart + whale ghost markers
- [ ] Paper execution (long/short, size, leverage, fees/slippage)
- [ ] Dual live equity curves (you vs whale)
- [ ] Daily challenge generator (freeze whale+window into Supabase)
- [ ] Server-side ranked scoring + validation
- [ ] Leaderboard
- [ ] Share card (server-rendered OG image)
- [ ] Free-play mode (pick any whale)

### Phase 4 — Cross-platform hardening
- [ ] Desktop layouts
- [ ] iOS Safari (safe-area insets, viewport, touch)
- [ ] Twitter/IG in-app webview (storage, no-popup share fallback) — REAL device test

### Phase 5 — QA + review
- [ ] /qa (functional)
- [ ] /qa-design-review (design audit vs DESIGN.md)
- [ ] /review (pre-landing) + codex review
- [ ] Fix loop to 10/10

### Phase 6 — Ship
- [ ] /ship — deploy Netlify, public repo, README
- [ ] Smoke test live on all 3 targets
- [ ] Launch asset: 10s screen-rec GIF + X post copy

## Decision log
**Architecture locked via codex (gpt-5.5, xhigh) — 2026-06-06:**
1. **Hosting:** Netlify Functions + Supabase only. No Render for v1 (scoring stateless/event-driven). Render later only for long-running workers/sockets/queues.
2. **Daily data:** Freeze whale fills + window candles into immutable Supabase challenge tables at creation, with integrity checks (coverage, duplicate-fill, candle-continuity, dataset hash). Reveal ranked data progressively — never ship future candles/ghost trades to the client mid-run.
3. **Identity/anti-cheat:** Anonymous handle + signed attempt session + server validation + one ranked attempt/day + IP/device/session throttles. No wallet/X-OAuth at launch (no prizes/money).
4. **Scoring:** Ranked is server-authoritative — client sends timestamped order INTENTS only; server maps receipt→replay tick, rejects late/look-ahead, recomputes execution+PnL from frozen data. Client PnL is display-only. Free-play scored client-side.
5. **Webview de-risk (critical):** WKWebView throttles/pauses timers + resizes unpredictably. Replay engine MUST derive visible state from `(attemptStart + replayTick)` as a pure function of wall-clock elapsed — NOT accumulated frame deltas. Cap devicePixelRatio; stream data in progressive chunks.

**Design:** Inherits GeoBridge system (dark `#07070e`, ice-blue accent, Geist Mono tabular data, Jakarta display, glow reserved for the live race). Racers: you=ice-blue, whale=amber. See DESIGN.md.
**Stack confirmed:** React+Vite+TS, Tailwind, lightweight-charts, Netlify Functions, Supabase $10.

## Blockers / operator actions
- none yet
