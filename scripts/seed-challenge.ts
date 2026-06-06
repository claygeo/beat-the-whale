// Build a ranked challenge from a wallet (reusing src/lib/challenge.ts — no logic duplication) and
// emit a single idempotent SQL block. Run: `npx tsx scripts/seed-challenge.ts [address] [label]`,
// then execute the printed SQL as admin (Supabase MCP / SQL editor). Coarser 4h interval keeps the
// frozen candle count small and the ranked replay tight.
import { buildChallengeFromWallet } from '../src/lib/challenge'

const address = process.argv[2] ?? '0x32021857b782a42e67bdc218e3d77c7e91f08320'
const label = process.argv[3] ?? 'BTC swing'

const c = await buildChallengeFromWallet(address, { label, interval: '4h' })

const num = (x: number) => (Number.isFinite(x) ? String(x) : '0')
const str = (s: string | null) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`)

const candleVals = c.candles
  .map((cd, i) => `(${i},${cd.t},${num(cd.o)},${num(cd.h)},${num(cd.l)},${num(cd.c)},${num(cd.v)})`)
  .join(',')
const ghostVals = c.ghost
  .map(
    (g) =>
      `(${g.tickIndex},${c.candles[g.tickIndex]?.t ?? 0},${str(g.side)},${str(g.dir)},${num(g.px)},${num(g.sz)},${num(g.closedPnl)})`,
  )
  .join(',')

const sql = `do $$
declare cid uuid;
begin
  delete from public.challenges where challenge_date = current_date;
  insert into public.challenges (challenge_date, whale_address, whale_label, coin, candle_interval, window_start, window_end, tick_count, whale_realized_pnl, whale_start_equity, dataset_hash, status, is_ranked)
  values (current_date, ${str(c.address)}, ${str(c.label)}, ${str(c.coin)}, ${str(c.interval)}, ${c.candles[0].t}, ${c.candles[c.candles.length - 1].t}, ${c.candles.length}, ${num(c.whaleRealizedPnl)}, ${num(c.startEquity)}, 'seed', 'live', true)
  returning id into cid;
  insert into public.challenge_candles (challenge_id, tick_index, t, o, h, l, c, v)
    select cid, x.* from (values ${candleVals}) as x(tick_index, t, o, h, l, c, v);
  insert into public.challenge_whale_trades (challenge_id, tick_index, t, side, dir, px, sz, closed_pnl)
    select cid, x.* from (values ${ghostVals}) as x(tick_index, t, side, dir, px, sz, closed_pnl);
end $$;`

console.log(sql)
