import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const API_KEY = process.env.API_FOOTBALL_KEY!
const BASE = 'https://v3.football.api-sports.io'

function adminDB() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET() {
  const res = await fetch(`${BASE}/fixtures?live=all`, {
    headers: { 'x-apisports-key': API_KEY },
    next: { revalidate: 50 },
  })

  if (!res.ok) {
    return NextResponse.json({ error: `API error ${res.status}` }, { status: 502 })
  }

  const json = await res.json()
  const fixtures: any[] = (json.response ?? []).filter(
    (f: any) => f.league?.id === 1
  )

  if (fixtures.length === 0) {
    return NextResponse.json({ live: [] })
  }

  // Fetch events for each live fixture in parallel (cached 50s — one real call per minute across all users)
  const eventsResults = await Promise.all(
    fixtures.map(f =>
      fetch(`${BASE}/fixtures/events?fixture=${f.fixture.id}`, {
        headers: { 'x-apisports-key': API_KEY },
        next: { revalidate: 50 },
      }).then(r => r.json()).catch(() => ({ response: [] }))
    )
  )

  // Update scores and status in DB for every live match
  const admin = adminDB()
  const updates = fixtures.map((f: any) => ({
    id: String(f.fixture.id),
    home_score: f.goals.home ?? 0,
    away_score: f.goals.away ?? 0,
    status: f.fixture.status.short,
    updated_at: new Date().toISOString(),
  }))

  await admin.from('prode_matches').upsert(updates, { onConflict: 'id' })

  return NextResponse.json({
    live: fixtures.map((f: any, i: number) => {
      const evts = ((eventsResults[i]?.response ?? []) as any[])
        .filter((e: any) => e.type === 'Goal' || (e.type === 'Card' && e.detail === 'Red Card'))
        .map((e: any) => ({
          elapsed: e.time.elapsed as number,
          extra: (e.time.extra ?? null) as number | null,
          team_id: e.team.id as number,
          team_name: e.team.name as string,
          player: e.player.name as string,
          type: e.type as string,
          detail: e.detail as string,
        }))
      return {
        id: String(f.fixture.id),
        home_team: f.teams.home.name,
        away_team: f.teams.away.name,
        home_score: f.goals.home ?? 0,
        away_score: f.goals.away ?? 0,
        status: f.fixture.status.short,
        elapsed: f.fixture.status.elapsed ?? null,
        events: evts,
      }
    }),
  })
}
