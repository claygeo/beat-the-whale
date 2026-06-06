# Design System — Beat the Whale

> Inherits the GeoBridge design language (dark, restrained, crypto-financial "instrument panel").
> The swap: GeoBridge's 3D scene is the star → here **the live replay race is the star.**

## Product Context
- **What:** A Hyperliquid trading game — race a real whale's recorded trades on a replayed chart.
- **For:** Crypto/HL traders on X. Competitive, degen-literate, mobile-first (in-app webview).
- **Mood:** A trading-terminal cockpit. Precise instruments around a living viewport; the chart and
  the two racing equity curves are the thing that breathes. UI chrome is the instrument panel.

## Aesthetic
- Dark only. Restraint everywhere except the live race, which is allowed to glow.
- Decoration is the motion of real data, not ornament. No gradients in chrome, no neon on UI.

## Typography
- **Display/Hero:** Plus Jakarta Sans (600/700), tracking-tight.
- **Body:** Geist (400/500).
- **Data / labels / numbers:** Geist Mono with `tabular-nums` — ALL PnL, prices, sizes, %s, timers,
  leaderboard ranks. Monospaced alignment is non-negotiable for financial data.
- **Labels:** Geist Mono, 11px, uppercase, 0.1em tracking, ink-secondary.

## Color (tokens in `tailwind.config.js`)
- bg `#07070e` · surface `#0d0d16` / hover `#12121e` · line `#1a1a2a` / hover `#2a2a3a`
- primary (ice blue) `#4a9eff` · primary-muted `#1a3a5c`
- ink `#e8e8ed` · ink-secondary `#6b6b7b` · ink-muted `#3a3a4a` (never pure `#fff`)
- **PnL semantics:** up/profit `#34d399`, down/loss `#f87171`. Reserved for sign — not decoration.
- **The two racers:** YOU = ice blue `#4a9eff`, WHALE = amber `#fbbf24`. High-contrast,
  complementary, instantly legible on a dark chart. (Never purple/violet — anti-pattern.)

## Motion
- **UI:** intentional. 150ms ease-out micro (hover/focus), 300ms ease-in-out state changes.
- **The race:** expressive — candles forming, ghost markers popping in, the two equity lines
  drawing and overtaking. This is the product; let it move.
- Respect `prefers-reduced-motion`: replay still advances, but disable non-essential particle/glow;
  curves update by position only.
- **Determinism:** visible replay state = `f(attemptStart + tick)` against wall-clock, never frame
  accumulation (webview-safe — see ARCHITECTURE.md).

## Layout
- Mobile-first; the chart owns the viewport. Desktop adds side instrument panels.
- Max content width 1280px on desktop. Border radius ≤ 12px. Safe-area insets honored (iOS notch).
- Touch targets ≥ 44px (WCAG).

## Anti-patterns (never)
- Purple/violet accents, gradient buttons, neon glow on UI chrome (glow is for the race only).
- Pure white text. Bubbly radius > 12px. Loading spinners (use immediate content / skeletons).
- Non-tabular numerals on any financial value.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-06 | Inherit GeoBridge system | Same dark crypto-financial register, proven taste. Swap "3D scene is star" → "live race is star". |
| 2026-06-06 | Racers: ice-blue (you) vs amber (whale) | Max contrast on dark chart; keeps green/red exclusively for PnL sign. |
