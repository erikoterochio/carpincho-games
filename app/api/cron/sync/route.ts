import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const API_KEY = process.env.API_FOOTBALL_KEY!
const BASE = 'https://v3.football.api-sports.io'

function adminDB() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function parseRound(round: string, group?: string): { stage: string; group_name: string | null; sort_base: number } {
  for (const src of [group ?? '', round]) {
    const m = src.match(/\bGroup\s+([A-L])\b/i)
    if (m) return { stage: 'group', group_name: m[1].toUpperCase(), sort_base: 0 }
  }
  if (/Group Stage/i.test(round)) return { stage: 'group', group_name: null, sort_base: 0 }
  if (/Round of 32/i.test(round))  return { stage: 'r32',   group_name: null, sort_base: 1000 }
  if (/Round of 16/i.test(round))  return { stage: 'r16',   group_name: null, sort_base: 2000 }
  if (/Quarter.final/i.test(round)) return { stage: 'qf',   group_name: null, sort_base: 3000 }
  if (/Semi.final/i.test(round))   return { stage: 'sf',    group_name: null, sort_base: 4000 }
  if (/3rd place/i.test(round))    return { stage: '3rd',   group_name: null, sort_base: 5000 }
  if (/Final/i.test(round))        return { stage: 'final', group_name: null, sort_base: 6000 }
  return { stage: 'other', group_name: null, sort_base: 9000 }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = adminDB()

  // Fetch fixtures + standings in parallel — standings needed to resolve group letters
  const [fixturesRes, standingsRes] = await Promise.all([
    fetch(`${BASE}/fixtures?league=1&season=2026`, {
      headers: { 'x-apisports-key': API_KEY }, cache: 'no-store',
    }),
    fetch(`${BASE}/standings?league=1&season=2026`, {
      headers: { 'x-apisports-key': API_KEY }, cache: 'no-store',
    }),
  ])

  if (!fixturesRes.ok) {
    return NextResponse.json({ error: `API error ${fixturesRes.status}` }, { status: 502 })
  }

  const fixturesJson = await fixturesRes.json()
  const fixtures: any[] = fixturesJson.response ?? []
  if (fixtures.length === 0) {
    return NextResponse.json({ synced: 0, note: 'No fixtures returned' })
  }

  // Build teamId → group letter map from standings
  const teamGroupMap = new Map<number, string>()
  if (standingsRes.ok) {
    const standingsJson = await standingsRes.json()
    for (const league of (standingsJson.response ?? [])) {
      for (const group of (league.league?.standings ?? []) as any[][]) {
        for (const entry of group) {
          const raw = (entry.group as string ?? '').replace(/^Group\s+/i, '').trim()
          const letter = raw.length === 1 && raw >= 'A' && raw <= 'L' ? raw : null
          if (letter) teamGroupMap.set(entry.team.id, letter)
        }
      }
    }
  }

  const rows = fixtures.map((f: any, i: number) => {
    const { stage, group_name: fromRound, sort_base } = parseRound(f.league.round, f.league.group)
    const group_name = fromRound
      ?? (stage === 'group'
        ? (teamGroupMap.get(f.teams.home.id) ?? teamGroupMap.get(f.teams.away.id) ?? null)
        : null)
    return {
      id:           String(f.fixture.id),
      home_team:    f.teams.home.name,
      home_team_id: f.teams.home.id,
      home_flag:    f.teams.home.logo,
      away_team:    f.teams.away.name,
      away_team_id: f.teams.away.id,
      away_flag:    f.teams.away.logo,
      kickoff:      f.fixture.date,
      stage,
      group_name,
      home_score:   f.goals.home ?? null,
      away_score:   f.goals.away ?? null,
      pen_home:     f.score?.penalty?.home ?? null,
      pen_away:     f.score?.penalty?.away ?? null,
      status:       f.fixture.status.short,
      venue:        f.fixture.venue?.name ?? null,
      sort_order:   sort_base + i,
      updated_at:   new Date().toISOString(),
    }
  })

  const { error } = await admin.from('prode_matches').upsert(rows, { onConflict: 'id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ synced: rows.length, ts: new Date().toISOString() })
}
