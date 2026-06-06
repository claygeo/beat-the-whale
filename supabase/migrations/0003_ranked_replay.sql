-- Serve a live challenge's frozen candles + whale ghost to anon (ship-all-candles per codex;
-- the UI hides future ticks). Only the live challenge is exposed. Pairs with get_active_challenge
-- (metadata) + get_leaderboard + submit_ranked_attempt to complete the anon ranked API.
create or replace function public.get_challenge_replay(p_challenge_id uuid)
returns jsonb
language sql security definer set search_path = public as $$
  select case
    when exists (select 1 from public.challenges c where c.id = p_challenge_id and c.status = 'live') then
      jsonb_build_object(
        'candles', coalesce((
          select jsonb_agg(jsonb_build_object('t', t, 'o', o, 'h', h, 'l', l, 'c', c, 'v', v) order by tick_index)
          from public.challenge_candles where challenge_id = p_challenge_id), '[]'::jsonb),
        'ghost', coalesce((
          select jsonb_agg(jsonb_build_object('tickIndex', tick_index, 'side', side, 'dir', dir,
                                              'px', px, 'sz', sz, 'closedPnl', closed_pnl) order by tick_index, t, id)
          from public.challenge_whale_trades where challenge_id = p_challenge_id), '[]'::jsonb)
      )
    else null
  end;
$$;

revoke all on function public.get_challenge_replay(uuid) from public;
grant execute on function public.get_challenge_replay(uuid) to anon;
