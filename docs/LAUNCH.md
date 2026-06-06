# Beat the Whale — launch copy (draft for @deforestpeg)

> Live: https://beat-the-whale-clay.netlify.app · Repo: https://github.com/claygeo/beat-the-whale
> Pick one. Edit to taste — this is a starting point, not gospel. Lowercase/casual matches the account voice.

---

## Option A — single punchy tweet

> i built a game where you race a real Hyperliquid whale's *actual* trades.
>
> same chart, same window — your $10k paper account vs their realized PnL. can you out-trade them?
>
> or flip to Arcade mode and bend the market yourself: flash-crash / pump buttons, beat the index.
>
> 📱 works on mobile + in the X app → beat-the-whale-clay.netlify.app

*(attach: 10s screen-rec GIF — Arcade: go long → hit 🚀 pump → curve surges past the market → "You beat the market 🎉")*

---

## Option B — thread (hook + engineering flex, for the client-attraction angle)

**1/**
> i built a trading game where you race a real Hyperliquid whale's recorded trades.
>
> same market, same window, your paper account vs theirs. two equity curves racing live.
>
> can you beat the whale? 🐋 → beat-the-whale-clay.netlify.app

**2/**
> two modes.
>
> 🐋 Whale Race — replay a real wallet's trades (paste any 0x, or take the daily challenge + post to the leaderboard).
>
> 🎮 Arcade — a live synthetic market you bend yourself: flash-crash / pump buttons, beat a passive index.

**3/**
> the part i'm proud of: it's fully deterministic + survives iOS in-app browsers.
>
> every frame is a pure function of elapsed wall-clock — not accumulated frame deltas. so when the X/IG webview throttles the tab, it just resamples and snaps back. zero drift.

**4/**
> the whale's equity is rebuilt from raw on-chain fills — signed size + VWAP entry, handling adds/flips — and marked-to-market every candle. so it races *live* with price instead of teleporting at each close.

**5/**
> Arcade's market is a seeded procedural engine: a pure fn of (seed, your events). crash/pump = shaped impulse → overshoot → retrace.
>
> your events move *your* tape but not the opponent — so it's a real skill, not a size contest.

**6/**
> react + vite + ts, supabase (no service key — all ranked scoring runs in postgres), netlify. built fast, in public.
>
> code's open: github.com/claygeo/beat-the-whale
>
> if you need someone who ships things like this — my DMs are open.

---

## Notes
- Best visual: the Arcade **🚀 pump while long** moment (your blue curve surging past the flat amber Market) — it reads instantly as "I caused that."
- The daily is now a beatable HYPE short-the-top (~+9%) — good for a "can you beat it?" challenge tweet.
- If posting one tweet, Option A. If positioning for freelance leads, Option B (the engineering tweets are the hook for technical founders).
