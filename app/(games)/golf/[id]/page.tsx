'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────

type Tournament = {
  id: string; name: string; status: string
  holes_config: string; handicap_allowance: number
  invite_code: string; num_rounds: number
}
type Course = {
  id: string
  name: string
  city: string | null
  par: number | null
  // Fallback general (se usa si no hay dato por salida)
  rating: number | null
  slope:  number | null
  // Por color de salida
  rating_black:  number | null
  slope_black:   number | null
  rating_blue:   number | null
  slope_blue:    number | null
  rating_white:  number | null
  slope_white:   number | null
  rating_yellow: number | null
  slope_yellow:  number | null
  rating_red:    number | null
  slope_red:     number | null
}
type Hole      = { hole_number: number; par: number; stroke_index: number }
type Player    = { id: string; display_name: string; handicap_index: number; tee_color: string }
type Format    = { id: string; format_type: string; display_name: string; handicap_allowance: number | null; max_hcp_diff: number | null }
type Round     = { id: string; round_number: number; status: string; date: string | null }
type HoleScore = { id: string; round_id: string; player_id: string; hole_number: number; gross: number | null; updated_at: string }
type CompUnit  = { id: string; name: string; unit_type: string; format_id: string; golf_competition_unit_members: { player_id: string }[] }
type Contest   = { id: string; contest_type: 'long_drive' | 'best_approach'; hole_number: number; display_name: string }
type ContestEntry = { contest_id: string; player_id: string; tee_distance_m: number; distance_to_pin_m: number; qualifies: boolean }

type PlayerCalc = {
  player: Player; courseHcp: number; playingHcp: number; strokes: Record<number, number>
}

type LeaderboardRow = {
  pos: number; player: Player; playingHcp: number
  value: number; holesPlayed: number; vsParDisplay: string; complete: boolean
}

// ─────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────

const FONT = "'Ubuntu', sans-serif"
const C = {
  bg: '#F1F7F6', card: '#ffffff', border: '#AACBC4',
  primary: '#03624C', text: '#021B1A', muted: '#707D7D',
  eagle: '#92400e', birdie: '#15803d', par: '#374151',
  bogey: '#c2410c', double: '#b91c1c',
} as const

const FORMAT_COLORS: Record<string, string> = {
  stroke: '#5b9bd5', stableford: '#4caf84', match: '#e07b4f',
  fourball_clasico: '#9b72cf', fourball_americano: '#cf9e3a',
  laguneada: '#c15b8a', '4_2_0': '#38bdf8',
}

const TEE_HEX: Record<string, string> = {
  black: '#222', blue: '#1d4ed8', white: '#9ca3af', yellow: '#d97706', red: '#dc2626',
}

// ─────────────────────────────────────────────
// FUNCIONES DE CÁLCULO
// ─────────────────────────────────────────────

function hcpStrokes(playingHcp: number, strokeIndex: number): number {
  if (playingHcp <= 0) return 0
  const base  = Math.floor(Math.abs(playingHcp) / 18)
  const rem   = Math.abs(playingHcp) % 18
  const extra = strokeIndex <= rem ? 1 : 0
  return playingHcp < 0 ? -(base + extra) : base + extra
}

function calcCourseHcp(hcpIndex: number, slope: number, rating: number, par: number): number {
  return Math.round(hcpIndex * (slope / 113) + (rating - par))
}

function computePlayerCalcs(
  players: Player[],
  holes: Hole[],
  course: Course,
  allowance: number,
  formatAllowance: number | null,
): PlayerCalc[] {
  const par = course.par ?? 72
  const pct = (formatAllowance ?? allowance) / 100
 
  return players.map(p => {
    // Usa el rating y slope de la salida específica del jugador
    const slope   = getCourseSlope(course, p.tee_color)
    const rating  = getCourseRating(course, p.tee_color)
 
    const courseHcp  = Math.round(p.handicap_index * (slope / 113) + (rating - par))
    const playingHcp = Math.round(courseHcp * pct)
 
    const strokes: Record<number, number> = {}
    holes.forEach(h => { strokes[h.hole_number] = hcpStrokes(playingHcp, h.stroke_index) })
 
    return { player: p, courseHcp, playingHcp, strokes }
  })
}

function stablefordPts(gross: number, holePar: number, strokes: number): number {
  return Math.max(0, 2 - (gross - strokes - holePar))
}

function vsParStr(diff: number): string {
  if (diff === 0) return 'E'
  return diff > 0 ? `+${diff}` : `${diff}`
}

function scoreColor(vspar: number): string {
  if (vspar <= -2) return C.eagle
  if (vspar === -1) return C.birdie
  if (vspar === 0)  return C.par
  if (vspar === 1)  return C.bogey
  return C.double
}

function getCourseRating(course: Course, teeColor: string): number {
  const map: Record<string, number | null> = {
    black:  course.rating_black,
    blue:   course.rating_blue,
    white:  course.rating_white,
    yellow: course.rating_yellow,
    red:    course.rating_red,
  }
  return map[teeColor] ?? course.rating ?? (course.par ?? 72)
}
 
function getCourseSlope(course: Course, teeColor: string): number {
  const map: Record<string, number | null> = {
    black:  course.slope_black,
    blue:   course.slope_blue,
    white:  course.slope_white,
    yellow: course.slope_yellow,
    red:    course.slope_red,
  }
  return map[teeColor] ?? course.slope ?? 113
}

// ─────────────────────────────────────────────
// LEADERBOARD BUILDERS
// ─────────────────────────────────────────────

function buildStablefordLB(calcs: PlayerCalc[], holes: Hole[], scores: HoleScore[], totalHoles: number): LeaderboardRow[] {
  const rows = calcs.map(({ player, playingHcp, strokes }) => {
    let pts = 0; let played = 0; let vsParAcc = 0
    holes.forEach(h => {
      const s = scores.find(x => x.player_id === player.id && x.hole_number === h.hole_number)
      if (!s?.gross) return
      pts += stablefordPts(s.gross, h.par, strokes[h.hole_number] ?? 0)
      vsParAcc += s.gross - h.par; played++
    })
    return { player, playingHcp, value: pts, holesPlayed: played, vsParAcc, complete: played >= totalHoles }
  }).sort((a, b) => b.value - a.value || a.vsParAcc - b.vsParAcc)
  let pos = 1
  return rows.map((r, i) => {
    if (i > 0 && r.value < rows[i - 1].value) pos = i + 1
    return { pos, player: r.player, playingHcp: r.playingHcp, value: r.value, holesPlayed: r.holesPlayed, vsParDisplay: vsParStr(r.vsParAcc), complete: r.complete }
  })
}

function buildStrokeLB(calcs: PlayerCalc[], holes: Hole[], scores: HoleScore[], totalHoles: number): LeaderboardRow[] {
  const rows = calcs.map(({ player, playingHcp }) => {
    let gross = 0; let parAcc = 0; let played = 0
    holes.forEach(h => {
      const s = scores.find(x => x.player_id === player.id && x.hole_number === h.hole_number)
      if (!s?.gross) return
      gross += s.gross; parAcc += h.par; played++
    })
    const nett   = gross > 0 ? gross - playingHcp : 0
    const vsParN = played > 0 ? nett - parAcc : 0
    return { player, playingHcp, gross, nett, vsParN, holesPlayed: played, complete: played >= totalHoles }
  }).sort((a, b) => {
    if (a.holesPlayed === 0 && b.holesPlayed === 0) return 0
    if (a.holesPlayed === 0) return 1
    if (b.holesPlayed === 0) return -1
    return a.nett - b.nett
  })
  let pos = 1
  return rows.map((r, i) => {
    if (i > 0 && r.nett < rows[i - 1].nett) pos = i + 1
    return { pos, player: r.player, playingHcp: r.playingHcp, value: r.nett, holesPlayed: r.holesPlayed, vsParDisplay: vsParStr(r.vsParN), complete: r.complete }
  })
}

// ─────────────────────────────────────────────
// 4-2-0 BUILDER
// 3 jugadores por grupo (scope individual pero 3 a la vez)
// 85% de handicap, 6 puntos por hoyo: 4-2-0
// Empates: todos→2-2-2 | top2→3-3-0 | bottom2→4-1-1
// ─────────────────────────────────────────────

function build420LB(calcs: PlayerCalc[], holes: Hole[], scores: HoleScore[]): (LeaderboardRow & { ptsDetail: string })[] {
  // Acumular puntos por jugador
  const totals = calcs.map(({ player, playingHcp, strokes }) => {
    let pts = 0; let played = 0
    holes.forEach(h => {
      const s = scores.find(x => x.player_id === player.id && x.hole_number === h.hole_number)
      if (s?.gross) played++
    })
    return { player, playingHcp, pts: 0, played }
  })

  // Por cada hoyo, calcular distribución de puntos
  holes.forEach(h => {
    const holeNetts = calcs.map(({ player, strokes }) => {
      const s = scores.find(x => x.player_id === player.id && x.hole_number === h.hole_number)
      if (!s?.gross) return null
      return { playerId: player.id, nett: s.gross - (strokes[h.hole_number] ?? 0) }
    }).filter(Boolean) as { playerId: string; nett: number }[]

    if (holeNetts.length < 2) return

    // Ordenar por nett (menor es mejor)
    holeNetts.sort((a, b) => a.nett - b.nett)

    // Distribuir 4-2-0 con empates
    const pts: Record<string, number> = {}

    if (holeNetts.length === 3) {
      const [a, b, c] = holeNetts
      if (a.nett === b.nett && b.nett === c.nett) {
        // Todos iguales: 2-2-2
        pts[a.playerId] = 2; pts[b.playerId] = 2; pts[c.playerId] = 2
      } else if (a.nett === b.nett) {
        // Los dos mejores empatan: 3-3-0
        pts[a.playerId] = 3; pts[b.playerId] = 3; pts[c.playerId] = 0
      } else if (b.nett === c.nett) {
        // Los dos peores empatan: 4-1-1
        pts[a.playerId] = 4; pts[b.playerId] = 1; pts[c.playerId] = 1
      } else {
        // Sin empate: 4-2-0
        pts[a.playerId] = 4; pts[b.playerId] = 2; pts[c.playerId] = 0
      }
    } else if (holeNetts.length === 2) {
      // Solo 2 jugadores cargaron en este hoyo
      if (holeNetts[0].nett === holeNetts[1].nett) {
        pts[holeNetts[0].playerId] = 3; pts[holeNetts[1].playerId] = 3
      } else {
        pts[holeNetts[0].playerId] = 4; pts[holeNetts[1].playerId] = 2
      }
    }

    totals.forEach(t => {
      if (pts[t.player.id] !== undefined) t.pts += pts[t.player.id]
    })
  })

  const sorted = totals.sort((a, b) => b.pts - a.pts)
  let pos = 1
  return sorted.map((r, i) => {
    if (i > 0 && r.pts < sorted[i - 1].pts) pos = i + 1
    return { pos, player: r.player, playingHcp: r.playingHcp, value: r.pts, holesPlayed: r.played, vsParDisplay: `${r.pts}pts`, complete: false, ptsDetail: `${r.pts} pts` }
  })
}

// ─────────────────────────────────────────────
// MATCH PLAY — CÁLCULO
// ─────────────────────────────────────────────

type MatchUnit = {
  id: string; name: string
  players: Player[]; playingHcps: number[]; teamPlayingHcp: number
}

type MatchState = {
  unitA: MatchUnit; unitB: MatchUnit
  holeResults: Record<number, 'win' | 'loss' | 'halved' | 'pending'>
  status: string; upDown: number; holesRemaining: number
  isFinished: boolean; winner: string | null
}

function matchDiffStrokes(diff: number, strokeIndex: number): number {
  if (diff <= 0) return 0
  const base = Math.floor(diff / 18)
  const rem  = diff % 18
  return base + (strokeIndex <= rem ? 1 : 0)
}

// Fourball Clásico: mejor pelota GROSS de la pareja, con HCP de pareja = 3/8 × (hcp_menor + min(hcp_mayor, hcp_menor + max_diff))
function fourballClasicoPairHcp(hcpA: number, hcpB: number, maxDiff: number): number {
  const lower  = Math.min(hcpA, hcpB)
  const higher = Math.max(hcpA, hcpB)
  const cappedHigher = Math.min(higher, lower + maxDiff)
  return Math.round((3 / 8) * (lower + cappedHigher))
}

function bestBallGross(unit: MatchUnit, holeNum: number, scores: HoleScore[]): number | null {
  // Para fourball_clasico: mejor GROSS de la pareja
  let best: number | null = null
  unit.players.forEach(p => {
    const sc = scores.find(s => s.player_id === p.id && s.hole_number === holeNum)
    if (!sc?.gross) return
    if (best === null || sc.gross < best) best = sc.gross
  })
  return best
}

function buildMatchState(
  unitA: MatchUnit, unitB: MatchUnit, holes: Hole[],
  scores: HoleScore[], isFourball: boolean, maxDiff: number = 5
): MatchState {
  let hcpA: number; let hcpB: number

  if (isFourball) {
    // Fourball clásico: HCP de pareja calculado con 3/8 y cap
    hcpA = fourballClasicoPairHcp(unitA.playingHcps[0] ?? 0, unitA.playingHcps[1] ?? 0, maxDiff)
    hcpB = fourballClasicoPairHcp(unitB.playingHcps[0] ?? 0, unitB.playingHcps[1] ?? 0, maxDiff)
  } else {
    hcpA = unitA.teamPlayingHcp
    hcpB = unitB.teamPlayingHcp
  }

  const diff       = Math.abs(hcpA - hcpB)
  const higherIsA  = hcpA >= hcpB
  let upDown = 0
  const holeResults: MatchState['holeResults'] = {}
  let holesPlayed = 0

  holes.forEach(h => {
    let nettA: number | null; let nettB: number | null

    if (isFourball) {
      // Mejor bruto de la pareja, con HCP de pareja aplicado como diferencia
      const grossA = bestBallGross(unitA, h.hole_number, scores)
      const grossB = bestBallGross(unitB, h.hole_number, scores)
      if (grossA === null || grossB === null) { holeResults[h.hole_number] = 'pending'; return }
      const strDiff  = matchDiffStrokes(diff, h.stroke_index)
      nettA = grossA - (higherIsA ? strDiff : 0)
      nettB = grossB - (higherIsA ? 0 : strDiff)
    } else {
      const pA  = unitA.players[0]; const pB = unitB.players[0]
      const scA = scores.find(s => s.player_id === pA.id && s.hole_number === h.hole_number)
      const scB = scores.find(s => s.player_id === pB.id && s.hole_number === h.hole_number)
      if (!scA?.gross || !scB?.gross) { holeResults[h.hole_number] = 'pending'; return }
      const strDiff = matchDiffStrokes(diff, h.stroke_index)
      nettA = scA.gross - (higherIsA ? strDiff : 0)
      nettB = scB.gross - (higherIsA ? 0 : strDiff)
    }

    holesPlayed++
    if (nettA < nettB)      { holeResults[h.hole_number] = 'win';    upDown++ }
    else if (nettA > nettB) { holeResults[h.hole_number] = 'loss';   upDown-- }
    else                    { holeResults[h.hole_number] = 'halved'           }
  })

  const holesRemaining = holes.length - holesPlayed
  const isFinished     = Math.abs(upDown) > holesRemaining || holesRemaining === 0

  let status = 'AS'; let winner: string | null = null
  if (holesPlayed > 0 && upDown !== 0) {
    const margin = Math.abs(upDown)
    if (isFinished) {
      winner = upDown > 0 ? unitA.name : unitB.name
      status = holesRemaining === 0 ? `${margin}UP` : `${margin}&${holesRemaining}`
    } else {
      status = upDown > 0 ? `${margin}UP` : `${margin}DN`
      if (holesRemaining === 1 && margin === 1) status = 'DORMIE'
    }
  } else if (holesPlayed > 0 && upDown === 0 && holesRemaining === 0) {
    status = 'EMPATE'
  }

  return { unitA, unitB, holeResults, status, upDown, holesRemaining, isFinished, winner }
}

// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────

export default function TournamentPage() {
  const { id }   = useParams<{ id: string }>()
  const supabase = createClient()

  const [loading,   setLoading]   = useState(true)
  const [tab,       setTab]       = useState<'leaderboard' | 'scorecard'>('leaderboard')
  const [fmtTab,    setFmtTab]    = useState(0)
  const [copied,    setCopied]    = useState(false)
  const [showMenu,  setShowMenu]  = useState(false)

  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [course,     setCourse]     = useState<Course | null>(null)
  const [holes,      setHoles]      = useState<Hole[]>([])
  const [players,    setPlayers]    = useState<Player[]>([])
  const [formats,    setFormats]    = useState<Format[]>([])
  const [round,      setRound]      = useState<Round | null>(null)
  const [scores,     setScores]     = useState<HoleScore[]>([])
  const [compUnits,  setCompUnits]  = useState<CompUnit[]>([])
  const [contests,   setContests]   = useState<Contest[]>([])
  const [contestEntries, setContestEntries] = useState<ContestEntry[]>([])

  useEffect(() => {
    const load = async () => {
      const { data: t } = await supabase
        .from('golf_tournaments')
        .select('id,name,status,holes_config,handicap_allowance,invite_code,num_rounds,course_id')
        .eq('id', id).single()
      if (!t) { setLoading(false); return }
      setTournament(t)

      const { data: c } = await supabase
        .from('golf_courses')
        .select('id,name,city,par,rating,slope,rating_black,slope_black,rating_blue,slope_blue,rating_white,slope_white,rating_yellow,slope_yellow,rating_red,slope_red')
        .eq('id', t.course_id)
        .single()
      setCourse(c ?? null)

      if (c) {
        const { data: hs } = await supabase.from('golf_holes').select('hole_number,par,stroke_index').eq('course_id', c.id).order('hole_number')
        setHoles(hs ?? [])
      }

      const [fmtRes, plRes, rndRes, cuRes] = await Promise.all([
        supabase.from('golf_formats').select('id,format_type,display_name,handicap_allowance,max_hcp_diff').eq('tournament_id', id).order('sort_order'),
        supabase.from('golf_players').select('id,display_name,handicap_index,tee_color').eq('tournament_id', id).order('sort_order'),
        supabase.from('golf_rounds').select('id,round_number,status,date').eq('tournament_id', id).order('round_number'),
        supabase.from('golf_competition_units').select('id,name,unit_type,format_id,golf_competition_unit_members(player_id)').eq('tournament_id', id),
      ])

      setFormats(fmtRes.data ?? [])
      setPlayers(plRes.data ?? [])
      setCompUnits(cuRes.data ?? [])

      const activeRound = (rndRes.data ?? []).find(r => r.status === 'active') ?? (rndRes.data ?? [])[0] ?? null
      setRound(activeRound)

      const { data: ctRes } = await supabase.from('golf_contests').select('id,contest_type,hole_number,display_name').eq('tournament_id', id).order('hole_number')
      const contestList = ctRes ?? []
      setContests(contestList)

      if (activeRound) {
        const [scRes, ceRes] = await Promise.all([
          supabase.from('golf_hole_scores').select('id,round_id,player_id,hole_number,gross,updated_at').eq('round_id', activeRound.id),
          contestList.length > 0
            ? supabase.from('golf_contest_entries').select('contest_id,player_id,tee_distance_m,distance_to_pin_m,qualifies').in('contest_id', contestList.map((c: Contest) => c.id)).eq('round_id', activeRound.id)
            : Promise.resolve({ data: [] }),
        ])
        setScores(scRes.data ?? [])
        setContestEntries((ceRes as any).data ?? [])
      }

      setLoading(false)
    }
    load()
  }, [id])

  useEffect(() => {
    if (!round) return
    const ch = supabase
      .channel(`golf-scores-${round.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'golf_hole_scores', filter: `round_id=eq.${round.id}` },
        (payload: any) => {
          const incoming = payload.new as HoleScore
          setScores(prev => {
            const idx = prev.findIndex(s => s.player_id === incoming.player_id && s.hole_number === incoming.hole_number)
            if (idx >= 0) { const next = [...prev]; next[idx] = incoming; return next }
            return [...prev, incoming]
          })
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [round?.id])

  const playedHoles = useMemo<Hole[]>(() => {
    if (!tournament || holes.length === 0) return []
    if (tournament.holes_config === 'front9') return holes.filter(h => h.hole_number <= 9)
    if (tournament.holes_config === 'back9')  return holes.filter(h => h.hole_number >= 10)
    return holes
  }, [holes, tournament?.holes_config])

  const totalHoles = playedHoles.length || (tournament?.holes_config === '18' ? 18 : 9)

  const playerCalcs = useMemo<PlayerCalc[]>(() => {
    if (!tournament || !course || players.length === 0) return []
    const fmt = formats[fmtTab]
    // 4_2_0, fourball_americano, laguneada usan 85% fijo
    const allowanceOverride = ['4_2_0','fourball_americano','laguneada'].includes(fmt?.format_type) ? 85 : null
    return computePlayerCalcs(players, playedHoles, course, tournament.handicap_allowance, allowanceOverride ?? fmt?.handicap_allowance ?? null)
  }, [players, formats, fmtTab, playedHoles, course, tournament])

  const leaderboard = useMemo<LeaderboardRow[]>(() => {
    if (!tournament || !course || players.length === 0 || formats.length === 0) return []
    const fmt = formats[fmtTab]
    if (!fmt) return []
    if (['match','fourball_clasico','fourball_americano'].includes(fmt.format_type)) return []
    if (fmt.format_type === '4_2_0') return [] // usa componente propio
    const calcs = computePlayerCalcs(players, playedHoles, course, tournament.handicap_allowance, fmt.handicap_allowance)
    if (['stableford','laguneada'].includes(fmt.format_type)) return buildStablefordLB(calcs, playedHoles, scores, totalHoles)
    return buildStrokeLB(calcs, playedHoles, scores, totalHoles)
  }, [players, formats, fmtTab, playedHoles, scores, course, tournament, totalHoles])

  const copyCode = () => {
    if (!tournament?.invite_code) return
    navigator.clipboard.writeText(tournament.invite_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return (
    <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
      <p style={{ color: C.muted, fontSize: 14 }}>Cargando partida...</p>
    </div>
  )

  if (!tournament) return (
    <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: C.text, fontSize: 16, marginBottom: 16 }}>Partida no encontrada</p>
        <Link href="/golf" style={{ color: C.primary, fontSize: 14 }}>← Volver al Golf</Link>
      </div>
    </div>
  )

  const isActive  = tournament.status === 'active'
  const fmt       = formats[fmtTab]
  const isMatch   = fmt?.format_type === 'match' || fmt?.format_type === 'fourball_clasico'
  const isAmeri   = fmt?.format_type === 'fourball_americano'
  const is420     = fmt?.format_type === '4_2_0'

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { height: 3px; width: 3px; }
        ::-webkit-scrollbar-thumb { background: #c8d8ec; border-radius: 3px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>

      <div style={{ background: C.bg, minHeight: '100vh', fontFamily: FONT, color: C.text, paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>

          {/* Navbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, background: C.bg, zIndex: 10 }}>
            <Link href="/golf" style={{ color: C.muted, display: 'flex', alignItems: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M15 18l-6-6 6-6" stroke={C.muted} strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </Link>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tournament.name}
            </span>
            {isActive && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#dcfce7', border: '1px solid #86efac', borderRadius: 20, padding: '3px 9px', flexShrink: 0 }}>
                <div style={{ width: 6, height: 6, borderRadius: 3, background: '#15803d', animation: 'pulse 2s infinite' }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: '#15803d' }}>EN VIVO</span>
              </div>
            )}
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowMenu(v => !v)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: '4px 6px', display: 'flex', alignItems: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="5"  r="1.5" fill={C.muted}/>
                  <circle cx="12" cy="12" r="1.5" fill={C.muted}/>
                  <circle cx="12" cy="19" r="1.5" fill={C.muted}/>
                </svg>
              </button>
              {showMenu && (
                <div style={{ position: 'absolute', right: 0, top: '100%', background: '#ffffff', border: `1px solid ${C.border}`, borderRadius: 12, padding: '6px', zIndex: 20, minWidth: 180, boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}
                  onClick={() => setShowMenu(false)}>
                  <MenuItem href={`/golf/${id}/scorear`}         icon="✏️" label="Anotar" />
                  <MenuItem href={`/golf/${id}/concursos`}       icon="🏌️" label="Concursos" />
                  <MenuItem href={`/golf/canchas`}               icon="⛳" label="Ver canchas" />
                  {isActive && <MenuItem href={`/golf/${id}/cerrar-ronda`} icon="🏁" label="Cerrar ronda" danger />}
                </div>
              )}
            </div>
          </div>

          {/* Info torneo */}
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>
              {course ? `${course.name}${course.city ? ` · ${course.city}` : ''}` : '—'}
              {' · '}
              {tournament.holes_config === '18' ? '18 hoyos' : tournament.holes_config === 'front9' ? 'Primeros 9' : 'Segundos 9'}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
              {formats.map(f => (
                <span key={f.id} style={{ fontSize: 10, fontWeight: 700, color: FORMAT_COLORS[f.format_type] ?? C.muted, background: (FORMAT_COLORS[f.format_type] ?? C.muted) + '18', border: `1px solid ${(FORMAT_COLORS[f.format_type] ?? C.muted)}40`, borderRadius: 5, padding: '2px 8px' }}>
                  {f.display_name}
                </span>
              ))}
            </div>
            <button onClick={copyCode}
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.card, border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 14px', cursor: 'pointer', width: '100%' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke={C.muted} strokeWidth="1.8"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke={C.muted} strokeWidth="1.8"/></svg>
              <span style={{ fontSize: 11, color: C.muted }}>Código:</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text, letterSpacing: 2 }}>{tournament.invite_code}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: copied ? '#15803d' : C.muted }}>{copied ? 'Copiado ✓' : 'Copiar'}</span>
            </button>
          </div>

          {/* Tabs principales */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 53, background: C.bg, zIndex: 9 }}>
            {(['leaderboard', 'scorecard'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ flex: 1, padding: '11px', background: 'none', border: 'none', borderBottom: `2px solid ${tab === t ? C.primary : 'transparent'}`, cursor: 'pointer', fontSize: 13, fontWeight: tab === t ? 700 : 500, color: tab === t ? C.text : C.muted, marginBottom: -1, fontFamily: FONT }}>
                {t === 'leaderboard' ? 'Leaderboard' : 'Scorecard'}
              </button>
            ))}
          </div>

          {/* Tabs de formato */}
          {formats.length > 1 && (
            <div style={{ display: 'flex', gap: 6, padding: '10px 18px', overflowX: 'auto', borderBottom: `1px solid ${C.border}` }}>
              {formats.map((f, i) => (
                <button key={f.id} onClick={() => setFmtTab(i)}
                  style={{ padding: '5px 12px', borderRadius: 20, border: `1px solid ${fmtTab === i ? (FORMAT_COLORS[f.format_type] ?? C.primary) : C.border}`, background: fmtTab === i ? (FORMAT_COLORS[f.format_type] ?? C.primary) + '20' : 'transparent', color: fmtTab === i ? (FORMAT_COLORS[f.format_type] ?? C.text) : C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: FONT }}>
                  {f.display_name}
                </button>
              ))}
            </div>
          )}

          {/* LEADERBOARD */}
          {tab === 'leaderboard' && (
            <>
              {isMatch && (
                <MatchLeaderboard
                  format={fmt} players={players} holes={playedHoles}
                  scores={scores} playerCalcs={playerCalcs}
                  units={compUnits.filter(u => u.format_id === fmt?.id)}
                  isFourball={fmt?.format_type === 'fourball_clasico'}
                />
              )}
              {isAmeri && (
                <FourballAmericanoLB
                  players={players} holes={playedHoles}
                  scores={scores} playerCalcs={playerCalcs}
                  units={compUnits.filter(u => u.format_id === fmt?.id)}
                />
              )}
              {is420 && (
                <FourTwoZeroLB
                  players={players} holes={playedHoles}
                  scores={scores} playerCalcs={playerCalcs}
                />
              )}
              {!isMatch && !isAmeri && !is420 && (
                <div style={{ padding: '14px 18px' }}>
                  {leaderboard.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted }}>
                      <div style={{ fontSize: 32, marginBottom: 10 }}>⛳</div>
                      <p style={{ fontSize: 14 }}>No hay scores ingresados aún</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 60px 50px 36px', gap: 8, padding: '6px 12px' }}>
                        {['#','JUGADOR', fmt?.format_type === 'stableford' ? 'PTS' : 'NETT','VS PAR','H'].map((h, i) => (
                          <span key={h} style={{ fontSize: 10, color: C.muted, fontWeight: 700, textAlign: i > 1 ? 'center' : 'left' }}>{h}</span>
                        ))}
                      </div>
                      {leaderboard.map((row, i) => {
                        const isStbf  = fmt?.format_type === 'stableford'
                        const vpColor = row.vsParDisplay === 'E' ? C.par : row.vsParDisplay.startsWith('-') ? C.birdie : C.bogey
                        return (
                          <div key={row.player.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 60px 50px 36px', gap: 8, padding: '11px 12px', background: i === 0 ? '#dcfce7' : C.card, border: `1px solid ${i === 0 ? '#86efac' : C.border}`, borderRadius: 10, alignItems: 'center' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: i === 0 ? '#15803d' : C.muted, textAlign: 'center' }}>{row.pos}</div>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ width: 8, height: 8, borderRadius: 4, background: TEE_HEX[row.player.tee_color] ?? '#888', flexShrink: 0 }} />
                                <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{row.player.display_name}</span>
                              </div>
                              <span style={{ fontSize: 11, color: C.muted, paddingLeft: 14 }}>HCP {row.playingHcp}</span>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              <span style={{ fontSize: 16, fontWeight: 700, color: i === 0 ? '#15803d' : C.text }}>{row.holesPlayed === 0 ? '—' : row.value}</span>
                              {isStbf && row.holesPlayed > 0 && <span style={{ fontSize: 10, color: C.muted, display: 'block' }}>pts</span>}
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: row.holesPlayed === 0 ? C.muted : vpColor }}>
                                {row.holesPlayed === 0 ? '—' : row.vsParDisplay}
                              </span>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <span style={{ fontSize: 11, color: C.muted }}>{row.holesPlayed}/{totalHoles}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {contests.length > 0 && (
                <ContestsSection contests={contests} entries={contestEntries} players={players} />
              )}
            </>
          )}

          {/* SCORECARD */}
          {tab === 'scorecard' && (
            <ScorecardView players={players} holes={playedHoles} scores={scores} playerCalcs={playerCalcs} format={fmt ?? null} />
          )}
        </div>
      </div>

      {/* FAB Scorear */}
      {isActive && round && (
        <div style={{ position: 'fixed', bottom: 'calc(24px + env(safe-area-inset-bottom))', right: 24, zIndex: 20 }}>
          <Link href={`/golf/${id}/scorear`}
            style={{ display: 'flex', alignItems: 'center', gap: 9, background: C.primary, color: '#ffffff', borderRadius: 28, padding: '14px 22px', textDecoration: 'none', fontSize: 15, fontWeight: 700, fontFamily: FONT, boxShadow: '0 6px 24px rgba(22,101,52,0.45)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 20h9" stroke="#ffffff" strokeWidth="2" strokeLinecap="round"/>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Anotar
          </Link>
        </div>
      )}
    </>
  )
}

// ─────────────────────────────────────────────
// MATCH LEADERBOARD
// ─────────────────────────────────────────────

function buildMatchUnits(units: CompUnit[], players: Player[], playerCalcs: PlayerCalc[]): MatchUnit[] {
  return units.map(u => {
    const unitPlayers = u.golf_competition_unit_members.map(m => players.find(p => p.id === m.player_id)).filter(Boolean) as Player[]
    const playingHcps = unitPlayers.map(p => playerCalcs.find(c => c.player.id === p.id)?.playingHcp ?? 0)
    const teamPlayingHcp = Math.round(playingHcps.reduce((a, b) => a + b, 0) / Math.max(playingHcps.length, 1))
    return { id: u.id, name: u.name, players: unitPlayers, playingHcps, teamPlayingHcp }
  })
}

function MatchLeaderboard({ format, players, holes, scores, playerCalcs, units, isFourball }: {
  format: Format | undefined; players: Player[]; holes: Hole[]
  scores: HoleScore[]; playerCalcs: PlayerCalc[]
  units: CompUnit[]; isFourball: boolean
}) {
  const matchUnits = buildMatchUnits(units, players, playerCalcs)
  const maxDiff    = format?.max_hcp_diff ?? 5
  const pairs: [MatchUnit, MatchUnit][] = []
  for (let i = 0; i + 1 < matchUnits.length; i += 2) pairs.push([matchUnits[i], matchUnits[i + 1]])

  if (pairs.length === 0) return (
    <div style={{ padding: '40px 18px', textAlign: 'center', color: C.muted, fontFamily: FONT }}>
      <div style={{ fontSize: 32, marginBottom: 10 }}>⛳</div>
      <p style={{ fontSize: 14 }}>No hay enfrentamientos configurados</p>
    </div>
  )

  return (
    <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {isFourball && (
        <p style={{ fontSize: 11, color: C.muted }}>
          HCP de pareja = 3/8 × (hcp_menor + mín(hcp_mayor, hcp_menor + {maxDiff}))
        </p>
      )}
      {pairs.map(([a, b], i) => (
        <MatchCard key={i} state={buildMatchState(a, b, holes, scores, isFourball, maxDiff)} holes={holes} scores={scores} />
      ))}
    </div>
  )
}

function MatchCard({ state, holes, scores }: { state: MatchState; holes: Hole[]; scores: HoleScore[] }) {
  const [expanded, setExpanded] = useState(false)
  const { unitA, unitB, status, upDown, isFinished, holeResults } = state
  const aLeads = upDown > 0; const bLeads = upDown < 0
  const statusColor = isFinished ? C.primary : upDown === 0 ? C.muted : upDown > 0 ? C.primary : C.bogey

  // Posición acumulada por hoyo
  let running = 0
  const runByHole: Record<number, number> = {}
  holes.forEach(h => {
    const r = holeResults[h.hole_number]
    if (r === 'win') running++; else if (r === 'loss') running--
    runByHole[h.hole_number] = running
  })

  const colW = { label: 60, hole: 34 }
  const tableW = colW.label + holes.length * colW.hole

  return (
    <div style={{ background: C.card, border: `1px solid ${isFinished ? C.primary : C.border}`, borderRadius: 14, overflow: 'hidden' }}>

      {/* ── Cabecera equipos */}
      <div style={{ padding: '14px 16px 10px' }}>
        {/* Equipo A */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 16, background: aLeads ? C.primary : C.border, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{unitA.name.charAt(0)}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: aLeads ? C.text : C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{unitA.name}</div>
            <div style={{ fontSize: 11, color: C.muted }}>{unitA.players.map(p => p.display_name.split(' ')[0]).join(' & ')} · HCP {unitA.teamPlayingHcp}</div>
          </div>
          {aLeads && (
            <div style={{ background: '#dcfce7', border: `1px solid #86efac`, borderRadius: 8, padding: '4px 10px', flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.primary }}>{status}</span>
            </div>
          )}
        </div>

        {/* Separador */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ flex: 1, height: 1, background: C.border }} />
          {!aLeads && !bLeads && <span style={{ fontSize: 12, fontWeight: 700, color: C.muted, padding: '0 4px' }}>{status}</span>}
          <div style={{ flex: 1, height: 1, background: C.border }} />
        </div>

        {/* Equipo B */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 16, background: bLeads ? C.bogey : C.border, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{unitB.name.charAt(0)}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: bLeads ? C.text : C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{unitB.name}</div>
            <div style={{ fontSize: 11, color: C.muted }}>{unitB.players.map(p => p.display_name.split(' ')[0]).join(' & ')} · HCP {unitB.teamPlayingHcp}</div>
          </div>
          {bLeads && (
            <div style={{ background: '#fee2e2', border: `1px solid #fca5a5`, borderRadius: 8, padding: '4px 10px', flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.bogey }}>{status}</span>
            </div>
          )}
        </div>

        {isFinished && (
          <div style={{ marginTop: 10, padding: '6px 10px', background: '#dcfce7', borderRadius: 8, textAlign: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.primary }}>
              {upDown > 0 ? unitA.name : unitB.name} ganó {status}
            </span>
          </div>
        )}
      </div>

      {/* ── Botón expandir */}
      <button onClick={() => setExpanded(!expanded)}
        style={{ width: '100%', padding: '9px 16px', background: C.bg, border: 'none', borderTop: `1px solid ${C.border}`, cursor: 'pointer', fontSize: 11, color: C.muted, fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          <path d="M6 9l6 6 6-6" stroke={C.muted} strokeWidth="2" strokeLinecap="round"/>
        </svg>
        {expanded ? 'Cerrar' : 'Ver hoyo a hoyo'}
      </button>

      {/* ── Tabla hoyo a hoyo */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}`, overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: tableW, width: '100%', fontFamily: FONT }}>
            <thead>
              <tr style={{ background: C.primary }}>
                <th style={{ position: 'sticky', left: 0, zIndex: 2, background: C.primary, width: colW.label, padding: '7px 8px', textAlign: 'left', fontSize: 10, color: 'rgba(255,255,255,0.55)', fontWeight: 400, borderRight: `1px solid rgba(255,255,255,0.15)` }}>
                  Hoyo
                </th>
                {holes.map(h => (
                  <th key={h.hole_number} style={{ width: colW.hole, textAlign: 'center', fontSize: 11, color: '#fff', fontWeight: 700, padding: '7px 2px' }}>
                    {h.hole_number}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Par */}
              <tr style={{ background: C.bg }}>
                <td style={{ position: 'sticky', left: 0, background: C.bg, padding: '4px 8px', fontSize: 10, color: C.muted, borderRight: `1px solid ${C.border}` }}>Par</td>
                {holes.map(h => <td key={h.hole_number} style={{ textAlign: 'center', fontSize: 10, color: C.muted, padding: '4px 2px' }}>{h.par}</td>)}
              </tr>
              {/* Hcp */}
              <tr style={{ background: C.bg }}>
                <td style={{ position: 'sticky', left: 0, background: C.bg, padding: '3px 8px', fontSize: 10, color: C.border, borderRight: `1px solid ${C.border}` }}>Hcp</td>
                {holes.map(h => <td key={h.hole_number} style={{ textAlign: 'center', fontSize: 10, color: C.border, padding: '3px 2px' }}>{h.stroke_index}</td>)}
              </tr>
              {/* Equipo A label */}
              <tr style={{ background: '#dcfce7' }}>
                <td colSpan={holes.length + 1} style={{ padding: '4px 8px', fontSize: 10, fontWeight: 700, color: C.primary }}>{unitA.name}</td>
              </tr>
              {unitA.players.map(p => (
                <MatchScoreRow key={p.id} player={p} holes={holes} scores={scores} bg={aLeads ? '#f0fdf4' : C.card} colW={colW} />
              ))}
              {/* Equipo B label */}
              <tr style={{ background: '#f5f5f5' }}>
                <td colSpan={holes.length + 1} style={{ padding: '4px 8px', fontSize: 10, fontWeight: 700, color: C.muted }}>{unitB.name}</td>
              </tr>
              {unitB.players.map(p => (
                <MatchScoreRow key={p.id} player={p} holes={holes} scores={scores} bg={bLeads ? '#fff7ed' : C.card} colW={colW} />
              ))}
              {/* Posición acumulada */}
              <tr style={{ background: C.bg, borderTop: `1.5px solid ${C.border}` }}>
                <td style={{ position: 'sticky', left: 0, background: C.bg, padding: '6px 8px', fontSize: 10, fontWeight: 700, color: C.muted, borderRight: `1px solid ${C.border}` }}>Pos</td>
                {holes.map(h => {
                  if (holeResults[h.hole_number] === 'pending' || holeResults[h.hole_number] === undefined)
                    return <td key={h.hole_number} style={{ textAlign: 'center', fontSize: 10, color: C.border }}>·</td>
                  const pos = runByHole[h.hole_number]
                  const label = pos === 0 ? 'AS' : pos > 0 ? `${pos}UP` : `${Math.abs(pos)}DN`
                  const color = pos === 0 ? C.muted : pos > 0 ? C.primary : C.bogey
                  return <td key={h.hole_number} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color, padding: '6px 1px' }}>{label}</td>
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function MatchScoreRow({ player, holes, scores, bg, colW }: {
  player: Player; holes: Hole[]; scores: HoleScore[]
  bg: string; colW: { label: number; hole: number }
}) {
  return (
    <tr style={{ background: bg }}>
      <td style={{ position: 'sticky', left: 0, zIndex: 1, background: bg, padding: '5px 8px', borderRight: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 6, height: 6, borderRadius: 3, background: TEE_HEX[player.tee_color] ?? '#888', flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: C.text, whiteSpace: 'nowrap' }}>{player.display_name.split(' ')[0]}</span>
        </div>
      </td>
      {holes.map(h => {
        const gross = scores.find(s => s.player_id === player.id && s.hole_number === h.hole_number)?.gross ?? null
        return (
          <td key={h.hole_number} style={{ textAlign: 'center', padding: '4px 2px' }}>
            {gross !== null
              ? <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{gross}</span>
              : <span style={{ fontSize: 12, color: C.border }}>·</span>}
          </td>
        )
      })}
    </tr>
  )
}

// ─────────────────────────────────────────────
// FOURBALL AMERICANO
// ─────────────────────────────────────────────

function FourballAmericanoLB({ players, holes, scores, playerCalcs, units }: {
  players: Player[]; holes: Hole[]; scores: HoleScore[]
  playerCalcs: PlayerCalc[]; units: CompUnit[]
}) {
  const pairRows = units.map(u => {
    const unitPlayers = u.golf_competition_unit_members.map(m => players.find(p => p.id === m.player_id)).filter(Boolean) as Player[]
    let pts = 0; let played = 0
    holes.forEach(h => {
      let best: number | null = null
      unitPlayers.forEach(p => {
        const calc = playerCalcs.find(c => c.player.id === p.id)
        const str  = calc?.strokes[h.hole_number] ?? 0
        const sc   = scores.find(s => s.player_id === p.id && s.hole_number === h.hole_number)
        if (!sc?.gross) return
        const p_ = Math.max(0, 2 - (sc.gross - str - h.par))
        if (best === null || p_ > best) best = p_
      })
      if (best !== null) { pts += best; played++ }
    })
    return { unit: u, players: unitPlayers, pts, played }
  }).sort((a, b) => b.pts - a.pts)

  const indivRows = playerCalcs.map(({ player, playingHcp, strokes }) => {
    let pts = 0; let played = 0
    holes.forEach(h => {
      const sc = scores.find(s => s.player_id === player.id && s.hole_number === h.hole_number)
      if (!sc?.gross) return
      pts += Math.max(0, 2 - (sc.gross - (strokes[h.hole_number] ?? 0) - h.par))
      played++
    })
    return { player, playingHcp, pts, played }
  }).sort((a, b) => b.pts - a.pts)

  return (
    <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <LBSection title="Ranking parejas">
        {pairRows.map((r, i) => (
          <div key={r.unit.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 50px 40px', gap: 8, padding: '11px 12px', background: i === 0 ? '#dcfce7' : C.card, border: `1px solid ${i === 0 ? '#86efac' : C.border}`, borderRadius: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: i === 0 ? '#15803d' : C.muted, textAlign: 'center' }}>{i + 1}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{r.unit.name}</div>
              <div style={{ fontSize: 11, color: C.muted }}>{r.players.map(p => p.display_name).join(' & ')}</div>
            </div>
            <PtsCell pts={r.pts} first={i === 0} />
            <span style={{ fontSize: 11, color: C.muted, textAlign: 'right' }}>{r.played}h</span>
          </div>
        ))}
      </LBSection>
      <LBSection title="Ranking individual">
        {indivRows.map((r, i) => (
          <div key={r.player.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 50px 40px', gap: 8, padding: '10px 12px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 9, alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.muted, textAlign: 'center' }}>{i + 1}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{r.player.display_name}</span>
            <PtsCell pts={r.pts} first={false} />
            <span style={{ fontSize: 11, color: C.muted, textAlign: 'right' }}>{r.played}h</span>
          </div>
        ))}
      </LBSection>
    </div>
  )
}

// ─────────────────────────────────────────────
// 4-2-0 LEADERBOARD
// ─────────────────────────────────────────────

function FourTwoZeroLB({ players, holes, scores, playerCalcs }: {
  players: Player[]; holes: Hole[]; scores: HoleScore[]; playerCalcs: PlayerCalc[]
}) {
  const rows = build420LB(playerCalcs, holes, scores)

  return (
    <div style={{ padding: '14px 18px' }}>
      <div style={{ background: '#e8f0fa', border: '1px solid #c8d8ec', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
        <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, margin: 0 }}>
          6 puntos por hoyo · 4-2-0 · Empates: top2→3-3-0 · bottom2→4-1-1 · todos→2-2-2 · HCP al 85%
        </p>
      </div>
      {rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>⛳</div>
          <p style={{ fontSize: 14 }}>No hay scores ingresados aún</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 60px 40px', gap: 8, padding: '6px 12px' }}>
            {['#', 'JUGADOR', 'PUNTOS', 'H'].map((h, i) => (
              <span key={h} style={{ fontSize: 10, color: C.muted, fontWeight: 700, textAlign: i > 1 ? 'center' : 'left' }}>{h}</span>
            ))}
          </div>
          {rows.map((row, i) => (
            <div key={row.player.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 60px 40px', gap: 8, padding: '11px 12px', background: i === 0 ? '#dcfce7' : C.card, border: `1px solid ${i === 0 ? '#86efac' : C.border}`, borderRadius: 10, alignItems: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: i === 0 ? '#15803d' : C.muted, textAlign: 'center' }}>{row.pos}</div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 4, background: TEE_HEX[row.player.tee_color] ?? '#888', flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{row.player.display_name}</span>
                </div>
                <span style={{ fontSize: 11, color: C.muted, paddingLeft: 14 }}>HCP {row.playingHcp}</span>
              </div>
              <PtsCell pts={row.value} first={i === 0} />
              <span style={{ fontSize: 11, color: C.muted, textAlign: 'right' }}>{row.holesPlayed}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// CONCURSOS — Tarjetas desplegables
// ─────────────────────────────────────────────

function ContestsSection({ contests, entries, players }: {
  contests: Contest[]; entries: ContestEntry[]; players: Player[]
}) {
  return (
    <div style={{ padding: '0 18px 4px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 1.5, textTransform: 'uppercase', padding: '14px 0 8px' }}>
        Concursos
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {contests.map(c => (
          <ContestCard key={c.id} contest={c} entries={entries.filter(e => e.contest_id === c.id)} players={players} />
        ))}
      </div>
    </div>
  )
}

function ContestCard({ contest, entries, players }: {
  contest: Contest; entries: ContestEntry[]; players: Player[]
}) {
  const [open, setOpen] = useState(false)
  const isLD = contest.contest_type === 'long_drive'
  const icon = isLD ? '🏌️' : '📍'

  const ranking = entries
    .filter(e => e.qualifies)
    .map(e => {
      const player = players.find(p => p.id === e.player_id)
      const metric = isLD ? e.tee_distance_m - e.distance_to_pin_m : e.distance_to_pin_m
      return { player, metric, e }
    })
    .filter(r => r.player)
    .sort((a, b) => isLD ? b.metric - a.metric : a.metric - b.metric)

  const leader = ranking[0]

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: FONT }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{contest.display_name}</div>
          <div style={{ fontSize: 11, color: C.muted }}>
            {leader
              ? `${leader.player!.display_name} · ${isLD ? `${leader.metric}m` : `${leader.metric}m al pin`}`
              : 'Sin datos aún'}
          </div>
        </div>
        {leader && (
          <span style={{ fontSize: 11, fontWeight: 700, color: C.primary, background: '#dcfce7', border: '1px solid #86efac', borderRadius: 6, padding: '2px 8px', flexShrink: 0 }}>
            {isLD ? `${leader.metric}m` : `${leader.metric}m`}
          </span>
        )}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
          <path d="M6 9l6 6 6-6" stroke={C.muted} strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </button>

      {open && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: '10px 16px 14px' }}>
          {ranking.length === 0 ? (
            <p style={{ fontSize: 13, color: C.muted, textAlign: 'center', padding: '8px 0' }}>Sin datos aún</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ranking.map((r, i) => (
                <div key={r.e.player_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: i === 0 ? '#15803d' : C.muted, width: 18, textAlign: 'center' }}>{i + 1}</span>
                  <div style={{ width: 7, height: 7, borderRadius: 4, background: TEE_HEX[(r.player as Player).tee_color] ?? '#888', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, color: C.text, fontWeight: i === 0 ? 700 : 500 }}>{(r.player as Player).display_name}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: i === 0 ? C.primary : C.muted }}>
                    {isLD ? `${r.metric}m` : `${r.metric}m`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// SCORECARD  (hoyos = filas, jugadores = columnas)
// ─────────────────────────────────────────────

function ScorecardView({ players, holes, scores, playerCalcs, format }: {
  players: Player[]; holes: Hole[]; scores: HoleScore[]
  playerCalcs: PlayerCalc[]; format: Format | null
}) {
  const isStableford = format?.format_type === 'stableford'

  const getScore   = (pid: string, hn: number) => scores.find(s => s.player_id === pid && s.hole_number === hn)?.gross ?? null
  const getStrokes = (pid: string, hn: number) => playerCalcs.find(c => c.player.id === pid)?.strokes[hn] ?? 0

  const subTotal = (pid: string, holeSet: Hole[]) => {
    const calc = playerCalcs.find(c => c.player.id === pid)
    let gross = 0, pts = 0, par = 0, count = 0
    holeSet.forEach(h => {
      const g = getScore(pid, h.hole_number)
      if (!g) return
      gross += g; par += h.par; count++
      if (isStableford) pts += stablefordPts(g, h.par, calc?.strokes[h.hole_number] ?? 0)
    })
    return { gross: count > 0 ? gross : null, pts: count > 0 ? pts : null, par }
  }

  const front9   = holes.filter(h => h.hole_number <= 9)
  const back9    = holes.filter(h => h.hole_number >= 10)
  const playerColW = players.length <= 2 ? 80 : players.length === 3 ? 68 : players.length === 4 ? 60 : 54
  const colW     = { hole: 38, par: 30, hcp: 28, player: playerColW }
  const tableW   = colW.hole + colW.par + colW.hcp + players.length * colW.player
  const totalPar = holes.reduce((a, h) => a + h.par, 0)

  const renderHoleRow = (h: Hole, even: boolean) => {
    const rowBg = even ? C.card : '#f0faf3'
    return (
      <tr key={h.hole_number} style={{ background: rowBg }}>
        <td style={{ position: 'sticky', left: 0, zIndex: 1, background: rowBg, width: colW.hole, textAlign: 'center', borderRight: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, padding: '11px 4px' }}>{h.hole_number}</div>
        </td>
        <td style={{ width: colW.par, textAlign: 'center', fontSize: 14, color: C.muted, borderRight: `1px solid ${C.border}` }}>{h.par}</td>
        <td style={{ width: colW.hcp, textAlign: 'center', fontSize: 11, color: C.border, borderRight: `1px solid ${C.border}` }}>{h.stroke_index}</td>
        {players.map(p => {
          const strokes = getStrokes(p.id, h.hole_number)
          const gross   = getScore(p.id, h.hole_number)
          const nett    = gross !== null ? gross - strokes : null
          let color: string | null = null
          if (gross !== null) {
            if (isStableford) {
              const pts = stablefordPts(gross, h.par, strokes)
              color = pts >= 3 ? C.birdie : pts === 2 ? C.par : pts === 1 ? C.bogey : C.double
            } else {
              color = scoreColor((gross - strokes) - h.par)
            }
          }
          return (
            <td key={p.id} style={{ width: colW.player, textAlign: 'center', padding: '5px 4px' }}>
              <div style={{
                width: 46, height: 42, borderRadius: 9, margin: '0 auto',
                background: gross !== null ? color! + '1c' : 'transparent',
                border: `1.5px solid ${gross !== null ? color! + '70' : C.border}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                position: 'relative',
              }}>
                {strokes > 0 && (
                  <div style={{ position: 'absolute', top: 3, right: 3, width: 5, height: 5, borderRadius: 3, background: C.primary + '70' }} />
                )}
                {gross !== null ? (
                  <>
                    <span style={{ fontSize: 18, fontWeight: 700, color: color!, lineHeight: 1 }}>{gross}</span>
                    {strokes > 0 && nett !== null && (
                      <span style={{ fontSize: 10, color: C.muted, lineHeight: 1.2 }}>/{nett}</span>
                    )}
                  </>
                ) : <span style={{ fontSize: 16, color: C.border }}>·</span>}
              </div>
            </td>
          )
        })}
      </tr>
    )
  }

  const renderSubtotalRow = (label: string, holeSet: Hole[]) => {
    const parTotal = holeSet.reduce((a, h) => a + h.par, 0)
    return (
      <tr key={label} style={{ background: '#dcfce7' }}>
        <td colSpan={3} style={{
          position: 'sticky', left: 0, zIndex: 1, background: '#dcfce7',
          padding: '7px 8px', fontSize: 11, fontWeight: 700, color: C.primary,
          borderTop: `1.5px solid ${C.border}`, borderBottom: `1.5px solid ${C.border}`,
        }}>
          {label} <span style={{ fontWeight: 400, color: C.muted, fontSize: 10 }}>{parTotal}</span>
        </td>
        {players.map(p => {
          const sub   = subTotal(p.id, holeSet)
          const val   = isStableford ? sub.pts : sub.gross
          const vsPar = sub.gross != null ? sub.gross - parTotal : null
          return (
            <td key={p.id} style={{ textAlign: 'center', padding: '4px 2px', borderTop: `1.5px solid ${C.border}`, borderBottom: `1.5px solid ${C.border}` }}>
              {val != null ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{val}</span>
                  {!isStableford && vsPar != null && (
                    <span style={{ fontSize: 10, color: vsPar > 0 ? C.bogey : vsPar < 0 ? C.birdie : C.muted }}>
                      {vsParStr(vsPar)}
                    </span>
                  )}
                </div>
              ) : <span style={{ fontSize: 12, color: C.border }}>—</span>}
            </td>
          )
        })}
      </tr>
    )
  }

  return (
    <div style={{ overflow: 'auto', margin: '0 10px 16px' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: tableW, fontFamily: FONT }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
          <tr style={{ background: C.primary }}>
            <th style={{ position: 'sticky', left: 0, zIndex: 2, background: C.primary, width: colW.hole, padding: '9px 4px', fontSize: 12, color: '#fff', textAlign: 'center', fontWeight: 700 }}>H</th>
            <th style={{ width: colW.par, padding: '9px 4px', fontSize: 12, color: 'rgba(255,255,255,0.8)', textAlign: 'center', fontWeight: 500 }}>Par</th>
            <th style={{ width: colW.hcp, padding: '9px 4px', fontSize: 11, color: 'rgba(255,255,255,0.45)', textAlign: 'center', fontWeight: 400 }}>Hcp</th>
            {players.map(p => {
              const phcp = playerCalcs.find(c => c.player.id === p.id)?.playingHcp
              return (
                <th key={p.id} style={{ width: colW.player, padding: '7px 2px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <div style={{ width: 9, height: 9, borderRadius: 5, background: TEE_HEX[p.tee_color] ?? '#888', border: '1.5px solid rgba(255,255,255,0.4)' }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: colW.player - 6 }}>
                      {p.display_name.split(' ')[0]}
                    </span>
                    {phcp != null && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)' }}>H: {phcp}</span>}
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {front9.length > 0 && back9.length > 0 && (
            <tr style={{ background: C.primary }}>
              <td colSpan={3} style={{ position: 'sticky', left: 0, zIndex: 1, background: C.primary, padding: '8px 10px', fontSize: 12, fontWeight: 700, color: '#fff' }}>
                TOT <span style={{ fontWeight: 400, fontSize: 10, opacity: 0.7 }}>{totalPar}</span>
              </td>
              {players.map(p => {
                const tots  = subTotal(p.id, holes)
                const val   = isStableford ? tots.pts : tots.gross
                const vsPar = tots.gross != null ? tots.gross - totalPar : null
                return (
                  <td key={p.id} style={{ textAlign: 'center', padding: '6px 2px' }}>
                    {val != null ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{val}</span>
                        {!isStableford && vsPar != null && (
                          <span style={{ fontSize: 9, color: vsPar > 0 ? '#fca5a5' : vsPar < 0 ? '#86efac' : 'rgba(255,255,255,0.5)' }}>
                            {vsParStr(vsPar)}
                          </span>
                        )}
                      </div>
                    ) : <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>—</span>}
                  </td>
                )
              })}
            </tr>
          )}
          {front9.map((h, i) => renderHoleRow(h, i % 2 === 0))}
          {front9.length > 0 && renderSubtotalRow('IDA', front9)}
          {back9.map((h, i)  => renderHoleRow(h, i % 2 === 0))}
          {back9.length > 0  && renderSubtotalRow('VTA', back9)}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────
// ATOMS
// ─────────────────────────────────────────────

function MenuItem({ href, icon, label, danger }: { href: string; icon: string; label: string; danger?: boolean }) {
  return (
    <Link href={href} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 8, textDecoration: 'none', color: danger ? '#be123c' : C.text, fontSize: 14, fontWeight: 500, fontFamily: FONT }}>
      <span>{icon}</span><span>{label}</span>
    </Link>
  )
}

function LBSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>{children}</div>
    </div>
  )
}

function PtsCell({ pts, first }: { pts: number; first: boolean }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <span style={{ fontSize: 16, fontWeight: 700, color: first ? '#15803d' : C.text }}>{pts}</span>
      <span style={{ fontSize: 10, color: C.muted, display: 'block' }}>pts</span>
    </div>
  )
}

