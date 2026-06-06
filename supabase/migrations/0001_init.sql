-- Beat the Whale — initial schema (rev 2, post codex schema-review 2026-06-06)
-- Architecture (codex-locked): frozen daily challenge + server-authoritative ranked scoring.
--
-- Trust model:
--   * ALL writes go through Netlify Functions using the service-role key (bypasses RLS).
--   * Anon NEVER touches tables directly. Reads come only via SECURITY DEFINER functions
--     that return sanitized, non-future-revealing columns.
--   * Free-play is pure client-side against Hyperliquid's public API (no Supabase).
--     Only RANKED play uses the frozen data below + server scoring.

-- ============================ challenges ============================
create table if not exists public.challenges (
  id                  uuid primary key default gen_random_uuid(),
  challenge_date      date not null unique,
  whale_address       text not null,                  -- SECRET until reveal (HL-reconstructable)
  whale_label         text,
  coin                text not null,
  candle_interval     text not null default '5m',
  window_start        bigint not null,                -- SECRET until reveal
  window_end          bigint not null,                -- SECRET until reveal
  tick_count          int  not null check (tick_count > 0),
  whale_realized_pnl  numeric(38,18) not null,        -- the target to beat
  whale_start_equity  numeric(38,18) not null check (whale_start_equity > 0),
  dataset_hash        text not null,                  -- integrity hash of frozen data
  is_ranked           boolean not null default true,
  status              text not null default 'draft' check (status in ('draft','live','archived')),
  created_at          timestamptz not null default now(),
  check (window_end > window_start)
);

-- ================= frozen candles (insert-once, progressive reveal) =================
create table if not exists public.challenge_candles (
  id            bigint generated always as identity primary key,
  challenge_id  uuid not null references public.challenges(id) on delete cascade,
  tick_index    int  not null check (tick_index >= 0),
  t             bigint not null,
  o numeric(38,18) not null, h numeric(38,18) not null,
  l numeric(38,18) not null, c numeric(38,18) not null,
  v numeric(38,18) not null default 0,
  unique (challenge_id, tick_index),
  unique (challenge_id, t)
);
create index if not exists idx_candles_challenge_tick
  on public.challenge_candles(challenge_id, tick_index);

-- ================= frozen whale trades (the ghost; insert-once) =================
create table if not exists public.challenge_whale_trades (
  id            bigint generated always as identity primary key,
  challenge_id  uuid not null references public.challenges(id) on delete cascade,
  tick_index    int  not null check (tick_index >= 0),
  t             bigint not null,
  side          text not null,
  dir           text,
  px            numeric(38,18) not null check (px >= 0),
  sz            numeric(38,18) not null check (sz >= 0),
  closed_pnl    numeric(38,18) not null default 0
);
-- deterministic ordering within a tick: (challenge, tick, time, id)
create index if not exists idx_whale_challenge_tick
  on public.challenge_whale_trades(challenge_id, tick_index, t, id);

-- ============================ attempts ============================
create table if not exists public.attempts (
  id            uuid primary key default gen_random_uuid(),
  challenge_id  uuid not null references public.challenges(id) on delete cascade,
  handle        text not null check (char_length(handle) between 1 and 24
                                     and handle ~ '^[A-Za-z0-9_.-]+$'),
  session_hash  text not null,
  mode          text not null check (mode in ('ranked','free')),
  status        text not null default 'in_progress'
                check (status in ('in_progress','submitted','scored','rejected')),
  started_at    timestamptz not null default now(),
  submitted_at  timestamptz,
  final_pnl     numeric(38,18),
  beat_whale    boolean,
  score         numeric(38,18),
  ip_hash       text,
  device_hash   text,
  created_at    timestamptz not null default now(),
  -- ranked attempts must carry a device_hash (the one-per-device guard depends on it)
  check (mode <> 'ranked' or device_hash is not null)
);
-- leaderboard serving index (matches the function's filter + order)
create index if not exists idx_attempts_leaderboard
  on public.attempts(challenge_id, score desc nulls last, submitted_at)
  where mode = 'ranked' and status = 'scored';
-- one ranked attempt per device per challenge (Wordle-style)
create unique index if not exists uniq_ranked_attempt_per_device
  on public.attempts(challenge_id, device_hash)
  where mode = 'ranked' and device_hash is not null;

-- ============== attempt orders (player intents; server-authoritative) ==============
create table if not exists public.attempt_orders (
  id                  bigint generated always as identity primary key,
  attempt_id          uuid not null references public.attempts(id) on delete cascade,
  client_ts           bigint,                          -- client-claimed (untrusted)
  server_received_ts  bigint not null,                 -- authoritative receipt time
  replay_tick         int not null check (replay_tick >= 0),
  action              text not null check (action in ('open_long','open_short','close','adjust')),
  size                numeric(38,18) not null default 0 check (size >= 0),
  leverage            numeric(10,2)  not null default 1 check (leverage > 0),
  accepted            boolean not null default true,
  reject_reason       text,
  created_at          timestamptz not null default now()
);
create index if not exists idx_orders_attempt on public.attempt_orders(attempt_id);

-- ============================ immutability guard ============================
-- Frozen snapshot rows are insert-once: block any UPDATE (DELETE stays open for cascade cleanup).
create or replace function public.block_update() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'rows in % are immutable', tg_table_name;
end;
$$;

drop trigger if exists trg_candles_no_update on public.challenge_candles;
create trigger trg_candles_no_update
  before update on public.challenge_candles
  for each row execute function public.block_update();

drop trigger if exists trg_whale_no_update on public.challenge_whale_trades;
create trigger trg_whale_no_update
  before update on public.challenge_whale_trades
  for each row execute function public.block_update();

-- ============================ RLS (deny-all to anon) ============================
alter table public.challenges             enable row level security;
alter table public.challenge_candles      enable row level security;
alter table public.challenge_whale_trades enable row level security;
alter table public.attempts               enable row level security;
alter table public.attempt_orders         enable row level security;
-- Intentionally NO anon policies on any table. Anon reaches data only through the
-- SECURITY DEFINER functions below; the service role (Netlify functions) bypasses RLS.

-- ===================== sanitized anon read API =====================
-- Active ranked challenge WITHOUT whale identity / exact window (both are HL-reconstructable,
-- i.e. a cheat vector). Those are revealed only after the attempt is submitted.
create or replace function public.get_active_challenge()
returns table (
  id uuid, challenge_date date, coin text, candle_interval text, tick_count int,
  whale_realized_pnl numeric, whale_start_equity numeric, is_ranked boolean
)
language sql security definer set search_path = public as $$
  select id, challenge_date, coin, candle_interval, tick_count,
         whale_realized_pnl, whale_start_equity, is_ranked
  from public.challenges
  where status = 'live'
  order by challenge_date desc
  limit 1;
$$;

-- Leaderboard: public columns only — never device/ip/session hashes.
create or replace function public.get_leaderboard(p_challenge_id uuid, p_limit int default 100)
returns table (
  leaderboard_rank bigint, handle text, final_pnl numeric,
  beat_whale boolean, score numeric, submitted_at timestamptz
)
language sql security definer set search_path = public as $$
  select rank() over (order by a.score desc nulls last, a.submitted_at) as leaderboard_rank,
         a.handle, a.final_pnl, a.beat_whale, a.score, a.submitted_at
  from public.attempts a
  where a.challenge_id = p_challenge_id and a.mode = 'ranked' and a.status = 'scored'
  order by a.score desc nulls last, a.submitted_at
  limit greatest(1, least(p_limit, 500));
$$;

revoke all on function public.get_active_challenge() from public;
revoke all on function public.get_leaderboard(uuid, int) from public;
grant execute on function public.get_active_challenge() to anon;
grant execute on function public.get_leaderboard(uuid, int) to anon;
