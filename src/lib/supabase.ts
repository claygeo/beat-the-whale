// Minimal, dependency-free Supabase RPC client. We only ever call SECURITY DEFINER functions
// (get_active_challenge, get_leaderboard, submit_ranked_attempt), so a tiny fetch wrapper is
// lighter than @supabase/supabase-js. The anon key is public by design — every table is RLS
// deny-all to anon, and reads/writes go only through the sanitized SECURITY DEFINER functions.

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://gauzdvauqsiyazassrnc.supabase.co'
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdhdXpkdmF1cXNpeWF6YXNzcm5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3MjA1MDAsImV4cCI6MjA5NjI5NjUwMH0.3jHv1tDkMCVxgO2vWFSJbwY6wpyKDfU4DsFJ_w-p7dk'

/** Call a Postgres function via PostgREST RPC. Returns parsed JSON (or null on 204). */
export async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(args),
  })
  if (!res.ok) {
    throw new Error(`rpc ${fn} failed: ${res.status} ${await res.text().catch(() => '')}`)
  }
  if (res.status === 204) return null as T
  return (await res.json()) as T
}
