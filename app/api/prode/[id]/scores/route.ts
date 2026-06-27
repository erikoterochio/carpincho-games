import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { computeGroupStandings, computeBestThirds } from '@/lib/prode-standings'

const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L']
const DONE   = new Set(['FT','AET','PEN'])

function adminDB() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// FIFA rankings June 2026 (lower = better)
const FIFA_RANKS: Record<string, number> = {
  'Argentina': 1, 'France': 2, 'Spain': 3, 'England': 4, 'Brazil': 5,
  'Portugal': 6, 'Netherlands': 7, 'Germany': 8, 'Belgium': 9, 'Croatia': 10,
  'Italy': 11, 'Uruguay': 12, 'Colombia': 13, 'Morocco': 14, 'United States': 15,
  'Mexico': 16, 'Japan': 17, 'Denmark': 19, 'Switzerland': 20, 'Senegal': 21,
  'South Korea': 22, 'Korea Republic': 22, 'Australia': 23, 'Canada': 24,
  'Ukraine': 25, 'Austria': 26, 'Ecuador': 27, 'Serbia': 28, 'Iran': 29,
  'Sweden': 32, 'Nigeria': 33, 'Czech Republic': 34, 'Poland': 35,
  'Turkey': 37, 'Hungary': 39, 'Peru': 40, 'Norway': 41, 'Egypt': 43,
  'Venezuela': 44, 'Algeria': 45, 'Chile': 46,
  'Ivory Coast': 47, "Côte d'Ivoire": 47,
  'Scotland': 48, 'Romania': 49, 'Slovakia': 50, 'Greece': 51,
  'DR Congo': 52, 'Paraguay': 53, 'Panama': 54, 'Tunisia': 55,
  'Bosnia-Herzegovina': 56, 'Bosnia': 56, 'Saudi Arabia': 57, 'South Africa': 58,
  'Cameroon': 59, 'Ghana': 62, 'Bolivia': 64, 'Albania': 68,
  'Cape Verde': 71, 'Honduras': 72, 'Uzbekistan': 74, 'Qatar': 77,
  'Iraq': 78, 'Jordan': 79, 'Costa Rica': 80, 'Haiti': 89,
  'New Zealand': 91, 'Curacao': 93,
}

function isRealTeamName(name: string): boolean {
  return !!name && !name.match(/winner|runner[\s-]up|gan[.\s]|gan\s+p\d|3rd\s+group|\?/i)
}

function calcMatchScore(ph: number, pa: number, rh: number, ra: number): number {
  if (ph === rh && pa === ra) return 12
  const ok = Math.sign(ph - pa) === Math.sign(rh - ra)
  const one = ph === rh || pa === ra
  if (ok && one) return 7
  if (ok) return 5
  if (one) return 2
  return 0
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = adminDB()

  const [matchesRes, standingsRes] = await Promise.all([
    admin.from('prode_matches')
      .select('id, home_team, away_team, home_flag, away_flag, home_score, away_score, status, stage, group_name, sort_order')
      .order('sort_order'),
    admin.from('prode_standings')
      .select('group_name, rank, team_name, played, win, draw, lose, goals_for, goals_against, goal_diff, points')
      .order('group_name').order('rank'),
  ])
  if (matchesRes.error) return NextResponse.json({ error: matchesRes.error.message }, { status: 500 })
  if (standingsRes.error) return NextResponse.json({ error: standingsRes.error.message }, { status: 500 })

  const allMatches = (matchesRes.data ?? []) as any[]
  const allStandings = (standingsRes.data ?? []) as any[]

  // Paginated picks
  const allPicks: any[] = []
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data, error } = await admin
      .from('prode_stage1_picks')
      .select('user_id, match_id, home_score, away_score, predicted_home, predicted_away, pen_winner')
      .eq('tournament_id', id)
      .range(from, from + PAGE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data?.length) break
    allPicks.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  const groupMatches = allMatches.filter((m: any) => m.stage === 'group')
  const groupMatchIds = new Set(groupMatches.map((m: any) => m.id))
  const matchById    = new Map(allMatches.map((m: any) => [m.id, m]))

  // Real group standings: group → team names in rank order
  const realGroupOrder: Record<string, string[]> = {}
  for (const s of allStandings) {
    if (!s.group_name) continue
    if (!realGroupOrder[s.group_name]) realGroupOrder[s.group_name] = []
    realGroupOrder[s.group_name].push(s.team_name)
  }

  // Groups where all 6 matches are finished
  const finishedGroups = new Set<string>()
  for (const g of GROUPS) {
    if (groupMatches.filter((m: any) => m.group_name === g && DONE.has(m.status)).length >= 6)
      finishedGroups.add(g)
  }

  // KO matches sorted by sort_order per stage
  const koByStage = (stage: string) =>
    allMatches.filter((m: any) => m.stage === stage).sort((a: any, b: any) => a.sort_order - b.sort_order)
  const r32Ms   = koByStage('r32')
  const r16Ms   = koByStage('r16')
  const qfMs    = koByStage('qf')
  const sfMs    = koByStage('sf')
  const finalMs = koByStage('final')
  const thirdMs = koByStage('3rd')

  // Build realR32Set from prode_standings (reliable — R32 match teams may still be placeholders)
  const realStMap: Record<string, any[]> = {}
  for (const s of allStandings) {
    if (!s.group_name) continue
    if (!realStMap[s.group_name]) realStMap[s.group_name] = []
    realStMap[s.group_name].push({ name: s.team_name, flag: '', pts: s.points, pj: s.played, pg: s.win, pe: s.draw, pp: s.lose, gf: s.goals_for, gc: s.goals_against, dg: s.goal_diff })
  }
  const realTopTwo = allStandings.filter((s: any) => s.rank <= 2).map((s: any) => s.team_name as string)
  const allGroupsInSt = GROUPS.every(g => (realStMap[g]?.length ?? 0) >= 4)
  const realThirdsFromSt: string[] = allGroupsInSt ? computeBestThirds(realStMap, FIFA_RANKS, 8).map((t: any) => t.name) : []
  const realR32Set = new Set<string>([...realTopTwo, ...realThirdsFromSt])
  const realR16Set = new Set<string>(r16Ms.flatMap((m: any) => [m.home_team, m.away_team]).filter(isRealTeamName))
  const realQfSet  = new Set<string>(qfMs.flatMap((m: any) => [m.home_team, m.away_team]).filter(isRealTeamName))
  const realSfSet  = new Set<string>(sfMs.flatMap((m: any) => [m.home_team, m.away_team]).filter(isRealTeamName))

  // Real final positions
  const finalM = finalMs[0]
  const thirdM = thirdMs[0]
  const realChampion = finalM && finalM.home_score !== null && finalM.away_score !== null
    && isRealTeamName(finalM.home_team) && isRealTeamName(finalM.away_team)
    ? (finalM.home_score > finalM.away_score ? finalM.home_team : finalM.away_score > finalM.home_score ? finalM.away_team : null)
    : null
  const realRunnerUp = realChampion && finalM
    ? (realChampion === finalM.home_team ? finalM.away_team : finalM.home_team)
    : null
  const realThird = thirdM && thirdM.home_score !== null && thirdM.away_score !== null
    && isRealTeamName(thirdM.home_team) && isRealTeamName(thirdM.away_team)
    ? (thirdM.home_score > thirdM.away_score ? thirdM.home_team : thirdM.away_score > thirdM.home_score ? thirdM.away_team : null)
    : null
  const realFourth = realThird && thirdM
    ? (realThird === thirdM.home_team ? thirdM.away_team : thirdM.home_team)
    : null

  // Build slot→match map for KO scoring
  const slotMatchMap = new Map<string, any>()
  for (const stage of ['r32','r16','qf','sf'] as const) {
    koByStage(stage).forEach((m: any, i: number) => slotMatchMap.set(`ko-${stage}-${i}`, m))
  }
  if (thirdMs[0]) slotMatchMap.set('ko-3rd',   thirdMs[0])
  if (finalMs[0]) slotMatchMap.set('ko-final', finalMs[0])

  // Group picks by user
  const picksByUser: Record<string, any[]> = {}
  for (const pk of allPicks) {
    if (!picksByUser[pk.user_id]) picksByUser[pk.user_id] = []
    picksByUser[pk.user_id].push(pk)
  }

  const result: { user_id: string; pts: number }[] = []

  for (const [userId, picks] of Object.entries(picksByUser)) {
    let pts = 0

    // 1. Match-by-match score (group + KO)
    for (const pk of picks) {
      const m = matchById.get(pk.match_id) ?? slotMatchMap.get(pk.match_id)
      if (!m || !DONE.has(m.status) || m.home_score === null || m.away_score === null) continue
      pts += calcMatchScore(pk.home_score, pk.away_score, m.home_score, m.away_score)
    }

    // 2. Group order bonus (6 pts per finished group with all 4 teams in correct order)
    const uGroupPicks: Record<string, { h: string; a: string }> = {}
    for (const pk of picks) {
      if (groupMatchIds.has(pk.match_id))
        uGroupPicks[pk.match_id] = { h: String(pk.home_score), a: String(pk.away_score) }
    }
    for (const g of finishedGroups) {
      const gms = groupMatches.filter((m: any) => m.group_name === g)
      const predicted = computeGroupStandings(gms, uGroupPicks, FIFA_RANKS)
      const real = realGroupOrder[g] ?? []
      if (real.length === 4 && predicted.length === 4 && real.every((t, i) => t === predicted[i].name))
        pts += 6
    }

    // 3. R32 advancement: 6 pts per correctly predicted group qualifier
    if (realR32Set.size > 0) {
      const uAllGroupStandings: Record<string, any[]> = {}
      for (const g of GROUPS) {
        const gms = groupMatches.filter((m: any) => m.group_name === g)
        if (gms.length > 0) uAllGroupStandings[g] = computeGroupStandings(gms, uGroupPicks, FIFA_RANKS)
      }
      const firsts  = GROUPS.map(g => uAllGroupStandings[g]?.[0]?.name ?? null)
      const seconds = GROUPS.map(g => uAllGroupStandings[g]?.[1]?.name ?? null)
      const thirds  = computeBestThirds(uAllGroupStandings, FIFA_RANKS, 8).map(t => t.name)
      const userR32 = new Set<string>([
        ...(firsts.filter(Boolean) as string[]),
        ...(seconds.filter(Boolean) as string[]),
        ...thirds,
      ])
      for (const t of userR32) if (realR32Set.has(t)) pts += 6
    }

    // 4. Build bracket: slot → predicted winner team
    const bracket = new Map<string, string>()
    const addWinner = (pk: any) => {
      if (!pk?.predicted_home || !pk?.predicted_away) return
      const home = pk.predicted_home, away = pk.predicted_away
      let winner: string | null = null
      if      (pk.home_score > pk.away_score) winner = home
      else if (pk.away_score > pk.home_score) winner = away
      else if (pk.pen_winner === 'h')         winner = home
      else if (pk.pen_winner === 'a')         winner = away
      if (!winner) return
      bracket.set(pk.match_id, winner)
      if (pk.match_id === 'ko-final') bracket.set('ko-final-runner', winner === home ? away : home)
    }
    for (let i = 0; i < 16; i++) addWinner(picks.find((pk: any) => pk.match_id === `ko-r32-${i}`))
    for (let i = 0; i < 8;  i++) addWinner(picks.find((pk: any) => pk.match_id === `ko-r16-${i}`))
    for (let i = 0; i < 4;  i++) addWinner(picks.find((pk: any) => pk.match_id === `ko-qf-${i}`))
    for (let i = 0; i < 2;  i++) addWinner(picks.find((pk: any) => pk.match_id === `ko-sf-${i}`))
    addWinner(picks.find((pk: any) => pk.match_id === 'ko-3rd'))
    addWinner(picks.find((pk: any) => pk.match_id === 'ko-final'))

    // 5. R16: 10 pts per correctly predicted R32 winner
    if (realR16Set.size > 0) {
      const userR16 = new Set(r32Ms.map((_: any, i: number) => bracket.get(`ko-r32-${i}`)).filter(Boolean) as string[])
      for (const t of userR16) if (realR16Set.has(t)) pts += 10
    }

    // 6. QF: 14 pts per correctly predicted R16 winner
    if (realQfSet.size > 0) {
      const userQf = new Set(r16Ms.map((_: any, i: number) => bracket.get(`ko-r16-${i}`)).filter(Boolean) as string[])
      for (const t of userQf) if (realQfSet.has(t)) pts += 14
    }

    // 7. SF: 18 pts per correctly predicted QF winner
    if (realSfSet.size > 0) {
      const userSf = new Set(qfMs.map((_: any, i: number) => bracket.get(`ko-qf-${i}`)).filter(Boolean) as string[])
      for (const t of userSf) if (realSfSet.has(t)) pts += 18
    }

    // 8. Final positions
    const uChampion = bracket.get('ko-final') ?? null
    const sf0Win    = bracket.get('ko-sf-0') ?? null
    const sf1Win    = bracket.get('ko-sf-1') ?? null
    const uRunnerUp = uChampion
      ? ((sf0Win === uChampion ? sf1Win : sf0Win) ?? bracket.get('ko-final-runner') ?? null)
      : null
    const qf0Win   = bracket.get('ko-qf-0') ?? null
    const qf1Win   = bracket.get('ko-qf-1') ?? null
    const qf2Win   = bracket.get('ko-qf-2') ?? null
    const qf3Win   = bracket.get('ko-qf-3') ?? null
    const sf0Loser = sf0Win ? (sf0Win === qf0Win ? qf1Win : qf0Win) : null
    const sf1Loser = sf1Win ? (sf1Win === qf2Win ? qf3Win : qf2Win) : null
    const uThird   = bracket.get('ko-3rd') ?? null
    const uFourth  = uThird ? (uThird === sf0Loser ? sf1Loser : sf0Loser) : null

    if (realChampion && uChampion === realChampion) pts += 40
    if (realRunnerUp && uRunnerUp === realRunnerUp) pts += 35
    if (realThird    && uThird    === realThird)    pts += 30
    if (realFourth   && uFourth   === realFourth)   pts += 25

    result.push({ user_id: userId, pts })
  }

  return NextResponse.json(result)
}
