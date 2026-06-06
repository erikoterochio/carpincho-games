export type TeamStat = {
  name: string
  flag: string
  pts: number
  pj: number  // played
  pg: number  // won
  pe: number  // drawn
  pp: number  // lost
  gf: number  // goals for
  gc: number  // goals against
  dg: number  // goal difference
}

type MatchRef = {
  id: string
  home_team: string
  away_team: string
  home_flag: string
  away_flag: string
}

type Picks = Record<string, { h: string; a: string }>

function parsePick(picks: Picks, id: string): { h: number; a: number } | null {
  const p = picks[id]
  if (!p || p.h === '' || p.a === '') return null
  const h = parseInt(p.h), a = parseInt(p.a)
  if (isNaN(h) || isNaN(a) || h < 0 || a < 0) return null
  return { h, a }
}

// Head-to-head stats among a subset of teams
function h2hStats(
  tiedNames: string[],
  allMatches: MatchRef[],
  picks: Picks
): Map<string, { pts: number; gd: number; gf: number }> {
  const ns = new Set(tiedNames)
  const stats = new Map<string, { pts: number; gd: number; gf: number }>()
  for (const n of tiedNames) stats.set(n, { pts: 0, gd: 0, gf: 0 })

  for (const m of allMatches) {
    if (!ns.has(m.home_team) || !ns.has(m.away_team)) continue
    const sc = parsePick(picks, m.id)
    if (!sc) continue
    const { h, a } = sc
    const home = stats.get(m.home_team)!
    const away = stats.get(m.away_team)!
    home.gf += h; home.gd += h - a
    away.gf += a; away.gd += a - h
    if (h > a)      home.pts += 3
    else if (h < a) away.pts += 3
    else            { home.pts++; away.pts++ }
  }
  return stats
}

// FIFA group stage tiebreaker order (applied within teams with equal points)
function resolveTied(
  tied: TeamStat[],
  allMatches: MatchRef[],
  picks: Picks
): TeamStat[] {
  if (tied.length <= 1) return tied
  const hth = h2hStats(tied.map(t => t.name), allMatches, picks)
  return [...tied].sort((a, b) => {
    const ha = hth.get(a.name)!, hb = hth.get(b.name)!
    if (hb.pts !== ha.pts) return hb.pts - ha.pts   // 1. H2H pts
    if (hb.gd  !== ha.gd)  return hb.gd  - ha.gd   // 2. H2H GD
    if (hb.gf  !== ha.gf)  return hb.gf  - ha.gf   // 3. H2H GF
    if (b.dg   !== a.dg)   return b.dg   - a.dg    // 4. Overall GD
    if (b.gf   !== a.gf)   return b.gf   - a.gf    // 5. Overall GF
    return a.name.localeCompare(b.name)              // 6. Alphabetical (stable fallback)
  })
}

/**
 * Compute group standings for a set of matches + user's picks.
 * Returns 4 TeamStat entries sorted by FIFA tiebreaker rules.
 */
export function computeGroupStandings(matches: MatchRef[], picks: Picks): TeamStat[] {
  const stats = new Map<string, TeamStat>()
  for (const m of matches) {
    if (!stats.has(m.home_team)) stats.set(m.home_team, { name: m.home_team, flag: m.home_flag, pts:0,pj:0,pg:0,pe:0,pp:0,gf:0,gc:0,dg:0 })
    if (!stats.has(m.away_team)) stats.set(m.away_team, { name: m.away_team, flag: m.away_flag, pts:0,pj:0,pg:0,pe:0,pp:0,gf:0,gc:0,dg:0 })
  }

  for (const m of matches) {
    const sc = parsePick(picks, m.id)
    if (!sc) continue
    const { h, a } = sc
    const home = stats.get(m.home_team)!
    const away = stats.get(m.away_team)!
    home.pj++; away.pj++
    home.gf += h; home.gc += a
    away.gf += a; away.gc += h
    if (h > a)      { home.pg++; home.pts += 3; away.pp++ }
    else if (h < a) { away.pg++; away.pts += 3; home.pp++ }
    else            { home.pe++; home.pts++; away.pe++; away.pts++ }
  }
  for (const s of stats.values()) s.dg = s.gf - s.gc

  // Sort by pts first, then break ties per-group using H2H
  const arr = [...stats.values()].sort((a, b) => b.pts - a.pts)
  const result: TeamStat[] = []
  let i = 0
  while (i < arr.length) {
    let j = i + 1
    while (j < arr.length && arr[j].pts === arr[i].pts) j++
    result.push(...resolveTied(arr.slice(i, j), matches, picks))
    i = j
  }
  return result
}

/**
 * Given all 12 group standings, return the best N third-place teams.
 * FIFA tiebreaker for best thirds: pts → GD → GF → alphabetical.
 */
export function computeBestThirds(
  allStandings: Record<string, TeamStat[]>,
  topN = 8
): TeamStat[] {
  const thirds = Object.values(allStandings)
    .filter(st => st.length >= 3)
    .map(st => st[2])

  return [...thirds]
    .sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts
      if (b.dg  !== a.dg)  return b.dg  - a.dg
      if (b.gf  !== a.gf)  return b.gf  - a.gf
      return a.name.localeCompare(b.name)
    })
    .slice(0, topN)
}
