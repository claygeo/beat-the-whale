-- Ranked mode v1 (codex-locked architecture, no service-role key needed):
--   * scoring + writes via SECURITY DEFINER RPC (Postgres is the authority)
--   * progressive reveal = ship-all-candles + UI-hide + one-shot/device (casual free leaderboard)
--   * freeze job = pg_cron / manual MCP seed
--
-- This function records a scored ranked attempt + its orders (kept for audit and for the
-- FOLLOW-UP full in-DB PnL recompute). v1 trusts the client-computed PnL within a sanity bound;
-- one ranked attempt per device/challenge is enforced by uniq_ranked_attempt_per_device.

create or replace function public.submit_ranked_attempt(
  p_challenge_id uuid,
  p_handle text,
  p_device_hash text,
  p_session_hash text,
  p_final_pnl numeric,
  p_beat_whale boolean,
  p_orders jsonb
) returns table (final_pnl numeric, beat_whale boolean, leaderboard_rank bigint)
language plpgsql security definer set search_path = public as $$
declare
  v_attempt_id uuid;
  v_live boolean;
begin
  select (status = 'live') into v_live from public.challenges where id = p_challenge_id;
  if v_live is distinct from true then raise exception 'challenge_not_live'; end if;
  if p_device_hash is null or length(p_device_hash) < 6 then raise exception 'device_required'; end if;
  if abs(coalesce(p_final_pnl, 0)) > 500000 then raise exception 'pnl_out_of_range'; end if;

  begin
    insert into public.attempts (challenge_id, handle, session_hash, mode, status,
                                 submitted_at, final_pnl, beat_whale, score, device_hash)
    values (p_challenge_id, p_handle, coalesce(p_session_hash, ''), 'ranked', 'scored',
            now(), p_final_pnl, p_beat_whale, p_final_pnl, p_device_hash)
    returning id into v_attempt_id;
  exception when unique_violation then
    raise exception 'already_played';
  end;

  insert into public.attempt_orders (attempt_id, client_ts, server_received_ts, replay_tick,
                                     action, size, leverage, accepted)
  select v_attempt_id,
         (o->>'clientTs')::bigint,
         (extract(epoch from now()) * 1000)::bigint,
         (o->>'tick')::int,
         o->>'action',
         coalesce((o->>'size')::numeric, 0),
         coalesce((o->>'leverage')::numeric, 1),
         true
  from jsonb_array_elements(coalesce(p_orders, '[]'::jsonb)) as o;

  return query
  select p_final_pnl, p_beat_whale,
         (select count(*) + 1 from public.attempts a
          where a.challenge_id = p_challenge_id and a.mode = 'ranked' and a.status = 'scored'
            and a.score > p_final_pnl)::bigint;
end;
$$;

revoke all on function public.submit_ranked_attempt(uuid, text, text, text, numeric, boolean, jsonb) from public;
grant execute on function public.submit_ranked_attempt(uuid, text, text, text, numeric, boolean, jsonb) to anon;
