# 🐋 Beat the Whale

**[▶ Play it live →](https://beat-the-whale-clay.netlify.app)** · a mobile-first trading game with two modes.

A real-time, deterministic, webview-safe trading game built on live [Hyperliquid](https://hyperliquid.xyz)
data. Race a real whale, or trade a synthetic market you can bend to your will.

---

## Two ways to play

### 🐋 Whale Race
A real Hyperliquid whale's recorded trades replay on an animated candlestick chart — their actual
entries/exits appear as ghost markers at the true timestamps. You paper-trade the **same window**
(long / short / close, size + leverage) trying to beat their realized PnL by the end. Two equity
curves race live. Pick a featured swing trader, paste **any** 0x wallet, or take the **🏆 Daily
challenge** (everyone gets the same whale + window, Wordle-style) and post to the leaderboard.

### 🎮 Arcade
A live **synthetic market** you trade against a passive **📊 Market index**. Your superpower: four
buttons — **⚡ Flash crash · 🩸 Slow bleed · 🚀 Fast pump · 📈 Slow grind** — that inject market
events with randomized magnitude and timing on every run. Position first, then trigger your own move
to swing the tape your way. A **speed mode** (1×/2×/4×) and a persistent **best-run high score** keep
you coming back.

---

## What's actually interesting under the hood

- **Webview-safe deterministic replay.** Every visible frame is a *pure function of
  `(start + elapsed wall-clock)`* — never accumulated frame deltas. iOS in-app webviews (Twitter/X,
  Instagram) throttle and pause `requestAnimationFrame`; here the view just resamples an
  already-correct array and snaps back with zero drift. (`src/hooks/useReplayClock.ts`)
- **Mark-to-market opponent curves.** The whale's equity is reconstructed from its raw fills —
  signed position + VWAP entry, handling adds / partial closes / flips — and valued against every
  candle, so it *races live* with price instead of teleporting at each close. (`src/lib/replay.ts`)
- **Procedural market engine.** The Arcade price path is a *pure function of `(seed, injected events)`*:
  a seeded indexable RNG → a precomputed 40 Hz sub-tick stream, sampled by elapsed time and
  aggregated into candles for the chart. Crash/pump events are shaped impulse → overshoot → retrace
  envelopes layered on drift + volatility. Hardened against NaN/overflow under button-mashing.
  (`src/lib/scenario.ts`)
- **A fair opponent by design.** The Arcade opponent holds the **event-free** underlying, so your
  injected crashes/pumps move *your* tape but never the opponent's — manipulation is a pure player
  weapon, not free alpha for the bot. Tuned across 500 seeds to a real skill curve.
- **No-secret backend.** Ranked scoring runs entirely in Postgres via deny-all RLS + `SECURITY
  DEFINER` RPCs — the client never needs a service-role key.

Tested with [Vitest](https://vitest.dev) (engine determinism, mark-to-market, event direction +
reproducibility, robustness). Architecture in [`ARCHITECTURE.md`](./ARCHITECTURE.md), design system
in [`DESIGN.md`](./DESIGN.md), live build log in [`running.md`](./running.md).

## Stack
- **React + Vite + TypeScript** · **TailwindCSS** · **TradingView lightweight-charts**
- **Hyperliquid** public `info` API (candles, fills, realized PnL) — no auth
- **Supabase** Postgres (frozen daily challenge + leaderboard) · **Netlify** (SPA hosting)

## Develop
```bash
npm install
npm run dev      # vite dev server
npm test         # vitest
npm run build    # tsc + vite build
```

## Targets
Desktop, iOS Safari, and in-app webviews (Twitter/X, Instagram) are first-class — see
[`ARCHITECTURE.md`](./ARCHITECTURE.md) for the webview-resilient replay design.

---

*Built fast, in public, by [@deforestpeg](https://x.com/deforestpeg).*
