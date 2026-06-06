# 🐋 Beat the Whale

Race a real [Hyperliquid](https://hyperliquid.xyz) whale's recorded trades. We replay a historical
market window on an animated chart; the whale's actual entries and exits appear as "ghost" markers
at the real timestamps; you paper-trade the same window trying to beat their realized PnL — two
equity curves racing live.

**Daily one-shot challenge** (everyone gets the same whale + window, Wordle-style) + a global
leaderboard, plus unranked free-play.

> Status: **WIP — building in public.** Live progress in [`running.md`](./running.md);
> architecture in [`ARCHITECTURE.md`](./ARCHITECTURE.md); design system in [`DESIGN.md`](./DESIGN.md).

## Stack
- React + Vite + TypeScript · TailwindCSS · TradingView lightweight-charts
- Hyperliquid public `info` API (candles, fills, realized PnL) — no auth
- Supabase (frozen daily challenge + leaderboard) · Netlify (SPA + Functions)

## Develop
```bash
npm install
npm run dev
```

## Targets
Desktop, iOS Safari, and in-app webviews (Twitter / Instagram) are first-class — see
[`ARCHITECTURE.md`](./ARCHITECTURE.md) for the webview-resilient replay design.
