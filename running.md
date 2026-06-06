# Beat the Whale — running.md

> Living checklist + decision log. Updated every step. Single source of truth for status.
> Owner: Claude (full autonomy). Operator: @deforestpeg (Clayton).
> Bar: **production 10/10**. Targets: **desktop + iOS Safari + Twitter/IG in-app webviews**.

## 🔁 LOOP STATE — read this first every iteration
**Mode:** autonomous `/loop` (self-paced). **Repo:** `C:\Users\clayg\OneDrive\Desktop\beat-the-whale` → github.com/claygeo/beat-the-whale (public). **Supabase:** `gauzdvauqsiyazassrnc` (org CG, us-east-1). **Memory:** `project_beat_the_whale_2026_06_06.md`. **🟢 LIVE:** https://beat-the-whale-clay.netlify.app (Netlify project `babbe18b-a21b-4df7-ae66-562436d0aad4`, team CG/claygeo4; deploy via `netlify deploy --prod --dir dist` from the linked folder).

**Iteration protocol:** (1) read this file → (2) do the **NEXT TASK** → (3) verify (build / test / preview) → (4) commit + push — ALWAYS strip the auto-injected `geobridge` dep from package.json first (atomic strip+commit) → (5) check off the task + set a new NEXT TASK → (6) continue.

**Ranked architecture (codex-locked):** NO service-role key. (1) in-DB scoring via SECURITY DEFINER RPC (Postgres = authority); (2) ship-all-candles + UI-hide + one-shot/device (casual free leaderboard, not prize-grade); (3) pg_cron / manual-MCP freeze job. `submit_ranked_attempt` v1 applied (0002) — trusts client PnL within a bound + stores orders for audit.

**▶ NEXT TASK — 🎯 TASTE OVERHAUL (operator redirect; cont'd).**
✅ **Pass 1 DONE + live:** typography → **Inter** (mono only for numbers); header swept; redesigned clear intro ("Out-trade the whale" + explains the amber markers = the whale's real trades).
✅ **Pass 2 DONE (verified mobile 375 + desktop, build clean, 0 console errors):** (a) **decluttered the whale-source bar** → premium rounded race-**chips** (🏆 Daily / BTC swing / WLD run / Sample, active highlighted) + the 0x wallet input hidden behind a **`+ Wallet`** toggle; (b) **full mono→Inter sweep** on all TEXT (chips, controls, result + leaderboard overlays, loading, steppers) — mono kept only on numbers; (c) **game-feel/juice** → replaced cryptic `012/027` counter with a slim **progress bar**, big thumb-friendly **Long/Short/Close** (rounded-xl, color-pop, `active:scale-95`), filled primary **Play**, `animate-pop-in` on result overlays + `animate-fade-in` on intro/wallet, `no-scrollbar` race row, `prefers-reduced-motion` respected.
✅ **Pass 3 DONE (codex gpt-5.5 xhigh pick + verified mobile/desktop/X-webview, 10/10 tests, build clean, 0 console errors):** made the **race metaphor visible** (codex's #1 "stop it reading like a trading widget"):
   (a) **RaceLane** strip under the chips — You(blue)/🐋(amber) tokens slide along a track by live PnL, breakeven center, 🏁 finish, faint time-fill, leader glows; reused conceptually in the win overlay.
   (b) **Mark-to-market whale curve** — the big fix: `whaleCurve` was realized-only (flat then teleport at close = boring race). Rewrote it to reconstruct the whale's position (signed size + VWAP entry, handles adds/partial/flip) and mark it against each candle in normalized units (scale derived from peak fill notional, matching challenge.ts). Whale equity now RAMPS smoothly with price — a real live race. Fixed `sampleGhost` to be consistent (sz=100, price-derived PnL). +3 engine tests (mark long, seamless close, short rises as price falls).
   (c) warmer win framing: "You beat the whale 🎉 / **by $184**" (big, mono only on the number).
✅ **Phase 2 CORE DONE (`73cd0c9`, codex gpt-5.5 xhigh architecture-locked, 13 tests, 23 total green):** `src/lib/scenario.ts` — deterministic, webview-safe procedural price engine for ARCADE mode. Seeded INDEXABLE RNG → price path is a pure fn of (seed, injected events), precomputed + sampled by elapsed→index (NO frame accumulation — iOS throttle-safe). 40Hz high-TPS stream; `flash_crash`/`slow_bleed`/`fast_pump`/`slow_grind` events with RNG mag+duration in per-scenario bands (never fixed %), ease-in→overshoot→retrace envelope + mild vol bulge (TUNED baseVol 0.0005 / volMul 1+0.7·sin). `pathToCandles` (presentation only), deterministic momentum **ghost bot** via simulate(). API: `createPath / injectEvent / priceAtElapsed / streamTickAtElapsed / pathToCandles / botOrders / botCurve` + `SCENARIOS` bands.
✅ **ARCADE MODE WIRED + LIVE (`f761948`, deployed):** top tabs **🐋 Whale Race | 🎮 Arcade** (whale path untouched). Arcade "Trade the chaos" = live synthetic market vs a momentum **ghost bot**, reusing chart/sim/RaceLane/EquityChart. 4 event buttons (⚡ Flash crash / 🩸 Slow bleed / 🚀 Fast pump / 📈 Slow grind) inject RNG events that visibly waterfall/retrace the market; bot reacts (its trades = chart markers); equity curves race. Speed 1×/2×/4× (pre-run); seed = Date.now() at run-start. Mode-aware opponent (Bot/Whale) + result framing. **Fixes while verifying live:** scenario candle `t` → 1 unique sec/candle (500ms collided to same int second → lightweight-charts crash); added **ErrorBoundary** (was none → render glitch blanked the page); 60s rounds. Verified BOTH modes live on mobile 375, crash+pump render+race, 0 console errors, no whale-mode regression. 23 tests green.
✅ **BOT BALANCE → OPPONENT REDESIGN DONE (codex pick C):** the momentum bot was UNBEATABLE (measured: good play won only ~4% — the bot rode the player's OWN injected events, so fairness collapsed to a size contest). Replaced it with a **passive "📊 Market" index** = a 1× HODL of the EVENT-FREE base path (`indexCurve` = startEquity·basePrice_t/basePrice_0; `basePrices` snapshotted at createPath, never touched by injectEvent). Now the player's crash/pump events move THEIR tape but not the opponent → events are pure player advantage. Added a gentle up-drift (`SCENARIO_DRIFT=0.00002`) so the Market visibly trends up (a real benchmark; doing nothing loses to a rising market — honest, no hidden hurdle). **Empirically tuned across 500 seeds:** passive 19% / weak 41% / good 59% / great 77% win — and that's SINGLE-trade play; multi-event mastery wins more. Re-themed opponent Bot→Market (📊), removed bot markers, mode-aware result. +2 index tests (events never touch it / it drifts up). 25 tests green; verified live: my pump lifts MY curve while Market stays flat. 0 console errors.
**NEXT — QA + polish:**
1. **`/qa-design-review` BOTH modes** on mobile 375 + X-webview 390×550 vs DESIGN.md; tighten the arcade selector row (4 events + 3 speeds scroll off-screen → make speed discoverable / regroup), touch targets, spacing, the equity-race "Market" labeling.
2. Stretch: mid-run speed change (smooth accumulator clock); live-updating forming candle for true high-TPS shimmer; arcade "best run" local high-score; show injected events as ⚡/🚀 chart markers.
Deferred: share-card OG image, full in-DB PnL recompute, pg_cron daily freeze.
**Preview note:** server id `39aa1fc9-…` (port 5202). If the renderer goes flaky / console shows stale `?t=` HMR errors → `preview_stop` (EXACT id from `preview_list`) + `preview_start` for a fresh one. `footer button` clicks don't register the React handler — start/trade via `preview_eval` (find button by textContent).

**Build order:** engine tests → free-play game UI (chart + ghost + dual equity curves + paper controls) → deploy Netlify → `/qa` + `/qa-design-review` (mobile / desktop / X-webview) → ranked (daily freeze + scoring fns + leaderboard) → share card → endless `/qa` loop.

**Gotchas:** geobridge re-injects on tool calls (strip every commit); codex needs prompt via STDIN pipe; codex file-reads fail in sandbox; free-play = client-side HL (no Supabase), ranked = frozen data + server scoring.

**🎯 DIRECTION (operator redirect 2026-06-06):** taste/clarity/mobile-fun is the goal (it currently looks AI-built + confusing). After the taste overhaul, build **Phase 2 — Scenario/Arcade mode** (the engineering flex that gets him hired): flash-crash / slow-crash / fast-pump / slow-pump buttons using RNG (variable timing 5s–1min + variable magnitude within a per-scenario range, never a fixed %), + a speed mode + high-TPS "live" feel.
**Whale-history consistency (operator flagged — important):** injecting crashes/pumps would violate the historic whale's recorded path. SOLUTION = keep modes SEPARATE: **Whale-Replay** = pure fixed historic path + the real whale ghost (consistent by construction); **Scenario/Arcade** = a PROCEDURAL synthetic price path (seeded RNG walk + injectable events) raced vs a simple REACTIVE ALGO opponent (or pure survival) — no pre-recorded whale to violate, so events are safe AND a high-TPS tick stream shows off the engineering. No race conditions / false states.

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
- [x] Daily challenge SEEDED — BTC swing race frozen into Supabase via `scripts/seed-challenge.ts` → MCP (28 candles + 23 whale trades; `get_active_challenge` ✓). pg_cron daily automation = later.
- [~] Server-side ranked scoring — `submit_ranked_attempt` v1 applied (records attempt + orders, one-per-device, sanity bound); full in-DB PnL recompute vs TS engine = next
- [x] Ranked daily challenge front-end — `ranked.ts` (load/submit/leaderboard client) + 🏆 Daily button loads the frozen challenge from Supabase + plays (LIVE)
- [x] Leaderboard — submit panel (handle → `submit_ranked_attempt`) + leaderboard display (`get_leaderboard`), one-per-device + already-played handling. **Verified end-to-end live.** 🏁 Ranked complete.
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
