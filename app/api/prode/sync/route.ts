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

// API-Football uses league.group = "Group A" for WC fixtures.
// If that's missing, fall back to league.round patterns.
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

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = adminDB()

  // Fetch both in parallel — we need standings to resolve group letters for fixtures
  const [fixturesRes, standingsRes] = await Promise.all([
    fetch(`${BASE}/fixtures?league=1&season=2026`, {
      headers: { 'x-apisports-key': API_KEY }, cache: 'no-store',
    }),
    fetch(`${BASE}/standings?league=1&season=2026`, {
      headers: { 'x-apisports-key': API_KEY }, cache: 'no-store',
    }),
  ])

  if (!fixturesRes.ok) {
    return NextResponse.json({ error: `Fixtures API error ${fixturesRes.status}` }, { status: 502 })
  }

  const fixturesJson = await fixturesRes.json()
  const fixtures: any[] = fixturesJson.response ?? []
  if (fixtures.length === 0) {
    return NextResponse.json({ synced: 0, standingsSynced: 0, note: 'API returned no fixtures' })
  }

  // ── Parse standings → team_id → group_letter map ──────────────────────────
  const teamGroupMap = new Map<number, string>()
  const standingRows: any[] = []
  let standingsNote: string | undefined
  let standingsSynced = 0

  if (standingsRes.ok) {
    const standingsJson = await standingsRes.json()
    for (const league of (standingsJson.response ?? [])) {
      for (const group of (league.league?.standings ?? []) as any[][]) {
        for (const entry of group) {
          const raw = (entry.group as string ?? '').replace(/^Group\s+/i, '').trim()
          const letter = raw.length === 1 && raw >= 'A' && raw <= 'L' ? raw : null
          if (letter) teamGroupMap.set(entry.team.id, letter)
          standingRows.push({
            group_name:    letter ?? 'X',
            team_id:       entry.team.id,
            team_name:     entry.team.name,
            team_logo:     entry.team.logo ?? null,
            rank:          entry.rank,
            played:        entry.all.played,
            win:           entry.all.win,
            draw:          entry.all.draw,
            lose:          entry.all.lose,
            goals_for:     entry.all.goals.for,
            goals_against: entry.all.goals.against,
            goal_diff:     entry.goalsDiff,
            points:        entry.points,
            updated_at:    new Date().toISOString(),
          })
        }
      }
    }
  } else {
    standingsNote = `Standings API error ${standingsRes.status}`
  }

  // ── Build fixture rows, resolving group_name via standings when needed ─────
  const rows = fixtures.map((f: any, i: number) => {
    const { stage, group_name: fromRound, sort_base } = parseRound(f.league.round, f.league.group)
    // If round/group fields didn't have a letter, look it up from the standings team map
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
      status:       f.fixture.status.short,
      venue:        f.fixture.venue?.name
        ? `${f.fixture.venue.name}${f.fixture.venue.city ? `, (${f.fixture.venue.city})` : ''}`
        : null,
      sort_order:   sort_base + i,
      updated_at:   new Date().toISOString(),
    }
  })

  const { error: fixturesError } = await admin.from('prode_matches').upsert(rows, { onConflict: 'id' })
  if (fixturesError) return NextResponse.json({ error: fixturesError.message }, { status: 500 })

  // ── Upsert standings ───────────────────────────────────────────────────────
  if (standingRows.length > 0) {
    const { error: se } = await admin
      .from('prode_standings')
      .upsert(standingRows, { onConflict: 'group_name,team_id' })
    if (!se) standingsSynced = standingRows.length
    else standingsNote = se.message
  } else if (!standingsNote) {
    standingsNote = 'Sin datos de standings todavía'
  }

  // Stage breakdown for debugging
  const stageBreakdown = rows.reduce((acc: Record<string, number>, r) => {
    const key = r.group_name ? `group_${r.group_name}` : r.stage
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})

  return NextResponse.json({
    synced: rows.length,
    standingsSynced,
    stageBreakdown,
    ...(standingsNote ? { standingsNote } : {}),
  })
}
