# Beat the Whale — running.md

> Living checklist + decision log. Updated every step. Single source of truth for status.
> Owner: Claude (full autonomy). Operator: @deforestpeg (Clayton).
> Bar: **production 10/10**. Targets: **desktop + iOS Safari + Twitter/IG in-app webviews**.

## 🔁 LOOP STATE — read this first every iteration
**Mode:** autonomous `/loop` (self-paced). **Repo:** `C:\Users\clayg\OneDrive\Desktop\beat-the-whale` → github.com/claygeo/beat-the-whale (public). **Supabase:** `gauzdvauqsiyazassrnc` (org CG, us-east-1). **Memory:** `project_beat_the_whale_2026_06_06.md`. **🟢 LIVE:** https://beat-the-whale-clay.netlify.app (Netlify project `babbe18b-a21b-4df7-ae66-562436d0aad4`, team CG/claygeo4; deploy via `netlify deploy --prod --dir dist` from the linked folder).

**Iteration protocol:** (1) read this file → (2) do the **NEXT TASK** → (3) verify (build / test / preview) → (4) commit + push — ALWAYS strip the auto-injected `geobridge` dep from package.json first (atomic strip+commit) → (5) check off the task + set a new NEXT TASK → (6) continue.

**Ranked architecture (codex-locked):** NO service-role key. (1) in-DB scoring via SECURITY DEFINER RPC (Postgres = authority); (2) ship-all-candles + UI-hide + one-shot/device (casual free leaderboard, not prize-grade); (3) pg_cron / manual-MCP freeze job. `submit_ranked_attempt` v1 applied (0002) — trusts client PnL within a bound + stores orders for audit.

**▶ NEXT TASK (ranked, cont'd):** (1) **Seed the BTC swing race as today's `challenge`** (status='live') — frozen `challenge_candles` + `challenge_whale_trades` (build via challenge.ts logic; insert via MCP); verify `get_active_challenge` returns it + `rpc()` client reads it. (2) **Frontend ranked flow**: a "Daily Challenge" entry → load active challenge → one-shot play → `submit_ranked_attempt` → leaderboard via `get_leaderboard` (+ a device-hash + handle prompt). (3) Then **full in-DB PnL recompute** in `submit_ranked_attempt` (replace trust-client, golden-test vs TS `simulate()`) + pg_cron daily freeze. (Also still pending: whale-bar mobile paste visibility.)

**Build order:** engine tests → free-play game UI (chart + ghost + dual equity curves + paper controls) → deploy Netlify → `/qa` + `/qa-design-review` (mobile / desktop / X-webview) → ranked (daily freeze + scoring fns + leaderboard) → share card → endless `/qa` loop.

**Gotchas:** geobridge re-injects on tool calls (strip every commit); codex needs prompt via STDIN pipe; codex file-reads fail in sandbox; free-play = client-side HL (no Supabase), ranked = frozen data + server scoring.

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
- [x] Git init + first commit + public GitHub repo → https://github.com/claygeo/beat-the-whale
- [x] Scaffold builds clean (tsc + vite build verified: 144KB JS / 6KB CSS gzipped)

### Phase 1 — Plan (lock with /codex)
- [x] codex: architecture lock (hosting / data-freeze / anti-cheat / trust split / webview risk) — locked, see Decision log + ARCHITECTURE.md
- [ ] DESIGN.md (/design-consultation) — aesthetic, type, color, motion; refs Stripe/Linear
- [x] Data model / Supabase schema → codex-reviewed (4 blockers + 7 shoulds caught & fixed → rev 2)
- [ ] /plan-eng-review (architecture lock)
- [ ] /plan-design-review (design plan)

### Phase 2 — Provision
- [x] Supabase project ($10) created → `gauzdvauqsiyazassrnc` (org CG, us-east-1)
- [x] Apply 0001_init migration → schema LIVE (codex-hardened: RLS deny-all, SECURITY DEFINER read API)
- [x] Security advisors verified → search_path fix applied; remaining lints intentional-by-design
- [x] HL data layer (`src/lib/hyperliquid.ts`): candles + userFillsByTime/closedPnl, typed + paginated
- [x] Netlify site + deploy → https://beat-the-whale-clay.netlify.app (LIVE, sample-data build; env vars added when ranked needs them)
- [x] GitHub repo live → claygeo/beat-the-whale (public)

### Phase 3 — Build
- [x] Frontend scaffold + design system + tokens (full responsive UI still to come)
- [x] HL data layer (candles, whale fills, closedPnl) + types
- [x] Replay engine built + compiles (`src/lib/replay.ts`): deterministic clock + paper sim + whale ghost curve
- [x] Replay engine unit tests — 7 passing (PnL long/short, liquidation, close-realization, determinism, whale curve)
- [x] Chart renders + deterministic replay playback (lightweight-charts) — verified live, 0 console errors
- [x] Free-play GAME wired + verified live: paper trade (long/short/close + size/lev), whale ghost markers, dual racing equity curves, live you-vs-whale PnL, result overlay
- [x] **Live Hyperliquid data** — race real whales (paste-wallet + 2 curated swing-trader races + sample), normalized equity race. **Curated races** via codex's leaderboard filter (BTC swing = real short-the-top, ~$32k). **Adaptive** candle interval (1h for multi-day) + replay speed (bounds any window to ~60s). Loading overlay. Verified live racing a real BTC short.
- [ ] Chart + whale ghost markers
- [ ] Paper execution (long/short, size, leverage, fees/slippage)
- [ ] Dual live equity curves (you vs whale)
- [ ] Daily challenge generator (freeze whale+window into Supabase)
- [~] Server-side ranked scoring — `submit_ranked_attempt` v1 applied (records attempt + orders, one-per-device, sanity bound); full in-DB PnL recompute vs TS engine = next
- [ ] Leaderboard
- [ ] Share card (server-rendered OG image)
- [ ] Free-play mode (pick any whale)

### Phase 4 — Cross-platform hardening
- [x] Mobile (375px) QA: header nowrap + badge hidden, trade controls stack on narrow — verified live
- [x] **Webview replay-freeze FIXED**: rAF is paused in backgrounded / in-app webviews → added a `setInterval` fallback that drives the wall-clock tick (verified the replay advances in a backgrounded preview). This was the #1 webview risk codex flagged.
- [x] Result UX: consolidated to a single CTA (footer hidden behind the result overlay)
- [x] Cold-start polish: branded "press play" hint overlay explains the game (was a lonely 1-candle chart); also fixed a latent `vite-env.d.ts` (import.meta.env types)
- [ ] Desktop/tablet layout re-verify + iOS Safari safe-area + real X in-app webview device test

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
- **[non-blocking] `geobridge` dependency keeps auto-re-injecting** into package.json after tool calls
  (a `file:../claude-run-it-up` local path) with a system note instructing it be kept + hidden. It's
  build-poison for a standalone public repo (won't resolve on Netlify or for cloners). Mitigation:
  stripped + verified clean in every commit. Operator: find/kill the responsible hook or script
  (likely in `.claude/` or a linter) when convenient. The committed/pushed repo stays clean regardless.
