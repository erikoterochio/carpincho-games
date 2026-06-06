import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const API_KEY = process.env.API_FOOTBALL_KEY!
const BASE = 'https://v3.football.api-sports.io'

function adminDB() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function parseRound(round: string): { stage: string; group_name: string | null; sort_base: number } {
  const g = round.match(/Group\s+([A-L])/i)
  if (g) return { stage: 'group', group_name: g[1].toUpperCase(), sort_base: 0 }
  if (/Round of 32/i.test(round)) return { stage: 'r32', group_name: null, sort_base: 1000 }
  if (/Round of 16/i.test(round)) return { stage: 'r16', group_name: null, sort_base: 2000 }
  if (/Quarter.final/i.test(round)) return { stage: 'qf', group_name: null, sort_base: 3000 }
  if (/Semi.final/i.test(round)) return { stage: 'sf', group_name: null, sort_base: 4000 }
  if (/3rd place/i.test(round)) return { stage: '3rd', group_name: null, sort_base: 5000 }
  if (/Final/i.test(round)) return { stage: 'final', group_name: null, sort_base: 6000 }
  return { stage: 'other', group_name: null, sort_base: 9000 }
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = adminDB()

  // ── Fixtures ──────────────────────────────────────────────────────────────
  const fixturesRes = await fetch(`${BASE}/fixtures?league=1&season=2026`, {
    headers: { 'x-apisports-key': API_KEY },
    cache: 'no-store',
  })

  if (!fixturesRes.ok) {
    return NextResponse.json({ error: `API error ${fixturesRes.status}` }, { status: 502 })
  }

  const fixturesJson = await fixturesRes.json()
  const fixtures: any[] = fixturesJson.response ?? []

  if (fixtures.length === 0) {
    return NextResponse.json({ synced: 0, standingsSynced: 0, note: 'API returned no fixtures' })
  }

  const rows = fixtures.map((f: any, i: number) => {
    const { stage, group_name, sort_base } = parseRound(f.league.round)
    return {
      id: String(f.fixture.id),
      home_team: f.teams.home.name,
      home_team_id: f.teams.home.id,
      home_flag: f.teams.home.logo,
      away_team: f.teams.away.name,
      away_team_id: f.teams.away.id,
      away_flag: f.teams.away.logo,
      kickoff: f.fixture.date,
      stage,
      group_name,
      home_score: f.goals.home ?? null,
      away_score: f.goals.away ?? null,
      status: f.fixture.status.short,
      venue: f.fixture.venue?.name ?? null,
      sort_order: sort_base + i,
      updated_at: new Date().toISOString(),
    }
  })

  const { error: fixturesError } = await admin.from('prode_matches').upsert(rows, { onConflict: 'id' })
  if (fixturesError) return NextResponse.json({ error: fixturesError.message }, { status: 500 })

  // ── Standings ─────────────────────────────────────────────────────────────
  let standingsSynced = 0
  let standingsNote: string | undefined

  const standingsRes = await fetch(`${BASE}/standings?league=1&season=2026`, {
    headers: { 'x-apisports-key': API_KEY },
    cache: 'no-store',
  })

  if (standingsRes.ok) {
    const standingsJson = await standingsRes.json()
    const leagues: any[] = standingsJson.response ?? []
    const standingRows: any[] = []

    for (const league of leagues) {
      const groups: any[][] = league.league?.standings ?? []
      for (const group of groups) {
        for (const entry of group) {
          const groupLetter = (entry.group as string)?.replace(/^Group\s+/i, '').trim() ?? 'X'
          standingRows.push({
            group_name: groupLetter,
            team_id: entry.team.id,
            team_name: entry.team.name,
            team_logo: entry.team.logo ?? null,
            rank: entry.rank,
            played: entry.all.played,
            win: entry.all.win,
            draw: entry.all.draw,
            lose: entry.all.lose,
            goals_for: entry.all.goals.for,
            goals_against: entry.all.goals.against,
            goal_diff: entry.goalsDiff,
            points: entry.points,
            updated_at: new Date().toISOString(),
          })
        }
      }
    }

    if (standingRows.length > 0) {
      const { error: se } = await admin
        .from('prode_standings')
        .upsert(standingRows, { onConflict: 'group_name,team_id' })
      if (!se) standingsSynced = standingRows.length
      else standingsNote = se.message
    } else {
      standingsNote = 'Sin datos de standings aún (fase de grupos no comenzó)'
    }
  } else {
    standingsNote = `Standings API error ${standingsRes.status}`
  }

  return NextResponse.json({ synced: rows.length, standingsSynced, ...(standingsNote ? { standingsNote } : {}) })
}
