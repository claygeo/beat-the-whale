// Health check — confirms the Functions deploy is live.
export default async () =>
  new Response(JSON.stringify({ ok: true, service: 'beat-the-whale', ts: Date.now() }), {
    headers: { 'content-type': 'application/json' },
  })

export const config = { path: '/api/health' }
