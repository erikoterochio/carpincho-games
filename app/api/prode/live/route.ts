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
  // Cache the API-Football call for 55s across all serverless instances.
  // Combined with the 5-min client interval this keeps us well under 100 req/day.
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
    live: fixtures.map((f: any) => ({
      id: String(f.fixture.id),
      home_team: f.teams.home.name,
      away_team: f.teams.away.name,
      home_score: f.goals.home ?? 0,
      away_score: f.goals.away ?? 0,
      status: f.fixture.status.short,
      elapsed: f.fixture.status.elapsed ?? null,
    })),
  })
}
