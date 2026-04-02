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
type Course    = { id: string; name: string; city: string | null; par: number | null; rating: number | null; slope: number | null }
type Hole      = { hole_number: number; par: number; stroke_index: number }
type Player    = { id: string; display_name: string; handicap_index: number; tee_color: string }
type Format    = { id: string; format_type: string; display_name: string; handicap_allowance: number | null }
type Round     = { id: string; round_number: number; status: string; date: string | null }
type HoleScore = { id: string; round_id: string; player_id: string; hole_number: number; gross: number | null; updated_at: string }

type PlayerCalc = {
  player: Player
  courseHcp: number
  playingHcp: number
  strokes: Record<number, number>
}

type LeaderboardRow = {
  pos: number; player: Player; playingHcp: number
  value: number; holesPlayed: number; vsParDisplay: string; complete: boolean
}

type CompUnit = {
  id: string; name: string; unit_type: string; format_id: string
  golf_competition_unit_members: { player_id: string }[]
}

// ─────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────

const FONT = "'Ubuntu', sans-serif"
const C = {
  bg: '#01050F', card: '#0d0d1a', border: '#1e1736',
  primary: '#055074', text: '#c1c1c6', muted: '#706c7e',
  eagle: '#fbbf24', birdie: '#22c55e', par: '#c1c1c6',
  bogey: '#f97316', double: '#ef4444',
} as const

const FORMAT_COLORS: Record<string, string> = {
  stroke: '#5b9bd5', stableford: '#4caf84', match: '#e07b4f',
  fourball_clasico: '#9b72cf', fourball_americano: '#cf9e3a', laguneada: '#c15b8a',
}

const TEE_HEX: Record<string, string> = {
  black: '#222', blue: '#1d4ed8', white: '#d1d5db', yellow: '#d97706', red: '#dc2626',
}

// ─────────────────────────────────────────────
// FUNCIONES DE CÁLCULO
// ─────────────────────────────────────────────

function hcpStrokes(playingHcp: number, strokeIndex: number): number {
  if (playingHcp <= 0) return 0
  const base = Math.floor(Math.abs(playingHcp) / 18)
  const rem  = Math.abs(playingHcp) % 18
  const extra = strokeIndex <= rem ? 1 : 0
  return playingHcp < 0 ? -(base + extra) : base + extra
}

function calcCourseHcp(hcpIndex: number, slope: number, rating: number, par: number): number {
  return Math.round(hcpIndex * (slope / 113) + (rating - par))
}

function computePlayerCalcs(
  players: Player[], holes: Hole[], course: Course,
  allowance: number, formatAllowance: number | null,
): PlayerCalc[] {
  const slope  = course.slope  ?? 113
  const rating = course.rating ?? (course.par ?? 72)
  const par    = course.par    ?? 72
  const pct    = (formatAllowance ?? allowance) / 100
  return players.map(p => {
    const courseHcp  = calcCourseHcp(p.handicap_index, slope, rating, par)
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
      vsParAcc += s.gross - h.par
      played++
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

function bestBallNett(unit: MatchUnit, holeNum: number, strokeIndex: number, scores: HoleScore[]): number | null {
  let best: number | null = null
  unit.players.forEach((p, i) => {
    const str = hcpStrokes(unit.playingHcps[i], strokeIndex)
    const sc  = scores.find(s => s.player_id === p.id && s.hole_number === holeNum)
    if (!sc?.gross) return
    const nett = sc.gross - str
    if (best === null || nett < best) best = nett
  })
  return best
}

function buildMatchState(unitA: MatchUnit, unitB: MatchUnit, holes: Hole[], scores: HoleScore[], isFourball: boolean): MatchState {
  const diff         = Math.abs(unitA.teamPlayingHcp - unitB.teamPlayingHcp)
  const higherIsA    = unitA.teamPlayingHcp >= unitB.teamPlayingHcp
  let upDown = 0
  const holeResults: MatchState['holeResults'] = {}
  let holesPlayed = 0

  holes.forEach(h => {
    let nettA: number | null
    let nettB: number | null

    if (isFourball) {
      nettA = bestBallNett(unitA, h.hole_number, h.stroke_index, scores)
      nettB = bestBallNett(unitB, h.hole_number, h.stroke_index, scores)
    } else {
      const pA = unitA.players[0]; const pB = unitB.players[0]
      const scA = scores.find(s => s.player_id === pA.id && s.hole_number === h.hole_number)
      const scB = scores.find(s => s.player_id === pB.id && s.hole_number === h.hole_number)
      if (!scA?.gross || !scB?.gross) { holeResults[h.hole_number] = 'pending'; return }
      const strDiff = matchDiffStrokes(diff, h.stroke_index)
      nettA = scA.gross - (higherIsA ? strDiff : 0)
      nettB = scB.gross - (higherIsA ? 0 : strDiff)
    }

    if (nettA === null || nettB === null) { holeResults[h.hole_number] = 'pending'; return }
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

  const [loading,    setLoading]    = useState(true)
  const [tab,        setTab]        = useState<'leaderboard' | 'scorecard'>('leaderboard')
  const [fmtTab,     setFmtTab]     = useState(0)
  const [copied,     setCopied]     = useState(false)
  const [showMenu,   setShowMenu]   = useState(false)

  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [course,     setCourse]     = useState<Course | null>(null)
  const [holes,      setHoles]      = useState<Hole[]>([])
  const [players,    setPlayers]    = useState<Player[]>([])
  const [formats,    setFormats]    = useState<Format[]>([])
  const [round,      setRound]      = useState<Round | null>(null)
  const [scores,     setScores]     = useState<HoleScore[]>([])
  const [compUnits,  setCompUnits]  = useState<CompUnit[]>([])

  // ── Carga inicial
  useEffect(() => {
    const load = async () => {
      const { data: t } = await supabase
        .from('golf_tournaments')
        .select('id,name,status,holes_config,handicap_allowance,invite_code,num_rounds,course_id')
        .eq('id', id).single()
      if (!t) { setLoading(false); return }
      setTournament(t)

      const { data: c } = await supabase
        .from('golf_courses').select('id,name,city,par,rating,slope').eq('id', t.course_id).single()
      setCourse(c ?? null)

      if (c) {
        const { data: hs } = await supabase
          .from('golf_holes').select('hole_number,par,stroke_index').eq('course_id', c.id).order('hole_number')
        setHoles(hs ?? [])
      }

      const [fmtRes, plRes, rndRes, cuRes] = await Promise.all([
        supabase.from('golf_formats').select('id,format_type,display_name,handicap_allowance').eq('tournament_id', id).order('sort_order'),
        supabase.from('golf_players').select('id,display_name,handicap_index,tee_color').eq('tournament_id', id).order('sort_order'),
        supabase.from('golf_rounds').select('id,round_number,status,date').eq('tournament_id', id).order('round_number'),
        supabase.from('golf_competition_units').select('id,name,unit_type,format_id,golf_competition_unit_members(player_id)').eq('tournament_id', id),
      ])

      setFormats(fmtRes.data ?? [])
      setPlayers(plRes.data ?? [])
      setCompUnits(cuRes.data ?? [])

      const activeRound = (rndRes.data ?? []).find(r => r.status === 'active') ?? (rndRes.data ?? [])[0] ?? null
      setRound(activeRound)

      if (activeRound) {
        const { data: sc } = await supabase
          .from('golf_hole_scores').select('id,round_id,player_id,hole_number,gross,updated_at').eq('round_id', activeRound.id)
        setScores(sc ?? [])
      }

      setLoading(false)
    }
    load()
  }, [id])

  // ── Realtime
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

  // ── Hoyos según config
  const playedHoles = useMemo<Hole[]>(() => {
    if (!tournament || holes.length === 0) return []
    if (tournament.holes_config === 'front9') return holes.filter(h => h.hole_number <= 9)
    if (tournament.holes_config === 'back9')  return holes.filter(h => h.hole_number >= 10)
    return holes
  }, [holes, tournament?.holes_config])

  const totalHoles = playedHoles.length || (tournament?.holes_config === '18' ? 18 : 9)

  // ── Player calcs
  const playerCalcs = useMemo<PlayerCalc[]>(() => {
    if (!tournament || !course || players.length === 0) return []
    const fmt = formats[fmtTab]
    return computePlayerCalcs(players, playedHoles, course, tournament.handicap_allowance, fmt?.handicap_allowance ?? null)
  }, [players, formats, fmtTab, playedHoles, course, tournament])

  // ── Leaderboard (stroke / stableford / laguneada)
  const leaderboard = useMemo<LeaderboardRow[]>(() => {
    if (!tournament || !course || players.length === 0 || formats.length === 0) return []
    const fmt = formats[fmtTab]
    if (!fmt) return []
    // Match y fourball se renderizan con componentes propios
    if (['match', 'fourball_clasico', 'fourball_americano'].includes(fmt.format_type)) return []
    const calcs = computePlayerCalcs(players, playedHoles, course, tournament.handicap_allowance, fmt.handicap_allowance)
    if (['stableford', 'laguneada'].includes(fmt.format_type)) {
      return buildStablefordLB(calcs, playedHoles, scores, totalHoles)
    }
    return buildStrokeLB(calcs, playedHoles, scores, totalHoles)
  }, [players, formats, fmtTab, playedHoles, scores, course, tournament, totalHoles])

  const copyCode = () => {
    if (!tournament?.invite_code) return
    navigator.clipboard.writeText(tournament.invite_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ─── LOADING ───────────────────────────────────────────────────
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

  // ─── RENDER ────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { height: 3px; width: 3px; }
        ::-webkit-scrollbar-thumb { background: #1e1736; border-radius: 3px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>

      <div style={{ background: C.bg, minHeight: '100vh', fontFamily: FONT, color: C.text, paddingBottom: 80 }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>

          {/* ── Navbar */}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#0a2a1a', border: '1px solid #14532d', borderRadius: 20, padding: '3px 9px', flexShrink: 0 }}>
                <div style={{ width: 6, height: 6, borderRadius: 3, background: '#4ade80', animation: 'pulse 2s infinite' }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: '#4ade80' }}>EN VIVO</span>
              </div>
            )}
            {/* Menú de acciones */}
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
                <div style={{ position: 'absolute', right: 0, top: '100%', background: '#111124', border: `1px solid ${C.border}`, borderRadius: 12, padding: '6px', zIndex: 20, minWidth: 180, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
                  onClick={() => setShowMenu(false)}>
                  <MenuItem href={`/golf/${id}/scorear`}      icon="✏️" label="Scorear" />
                  <MenuItem href={`/golf/${id}/concursos`}    icon="🏌️" label="Concursos" />
                  <MenuItem href={`/golf/canchas`}            icon="⛳" label="Ver canchas" />
                  {isActive && <MenuItem href={`/golf/${id}/cerrar-ronda`} icon="🏁" label="Cerrar ronda" danger />}
                </div>
              )}
            </div>
          </div>

          {/* ── Info torneo */}
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
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <rect x="9" y="9" width="13" height="13" rx="2" stroke={C.muted} strokeWidth="1.8"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke={C.muted} strokeWidth="1.8"/>
              </svg>
              <span style={{ fontSize: 11, color: C.muted }}>Código:</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text, letterSpacing: 2 }}>{tournament.invite_code}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: copied ? '#4ade80' : C.muted }}>{copied ? 'Copiado ✓' : 'Copiar'}</span>
            </button>
          </div>

          {/* ── Tabs principales */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 53, background: C.bg, zIndex: 9 }}>
            {(['leaderboard', 'scorecard'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ flex: 1, padding: '11px', background: 'none', border: 'none', borderBottom: `2px solid ${tab === t ? C.primary : 'transparent'}`, cursor: 'pointer', fontSize: 13, fontWeight: tab === t ? 700 : 500, color: tab === t ? C.text : C.muted, marginBottom: -1, fontFamily: FONT }}>
                {t === 'leaderboard' ? 'Leaderboard' : 'Scorecard'}
              </button>
            ))}
          </div>

          {/* ── Tabs de formato */}
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

          {/* ── LEADERBOARD */}
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

              {!isMatch && !isAmeri && (
                <div style={{ padding: '14px 18px' }}>
                  {leaderboard.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted }}>
                      <div style={{ fontSize: 32, marginBottom: 10 }}>⛳</div>
                      <p style={{ fontSize: 14 }}>No hay scores ingresados aún</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 60px 50px 36px', gap: 8, padding: '6px 12px' }}>
                        {['#', 'JUGADOR', fmt?.format_type === 'stableford' ? 'PTS' : 'NETT', 'VS PAR', 'H'].map((h, i) => (
                          <span key={h} style={{ fontSize: 10, color: C.muted, fontWeight: 700, textAlign: i > 1 ? 'center' : 'left' }}>{h}</span>
                        ))}
                      </div>
                      {leaderboard.map((row, i) => {
                        const isStbf    = fmt?.format_type === 'stableford'
                        const vpColor   = row.vsParDisplay === 'E' ? C.par : row.vsParDisplay.startsWith('-') ? C.birdie : C.bogey
                        return (
                          <div key={row.player.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 60px 50px 36px', gap: 8, padding: '11px 12px', background: i === 0 ? '#0d1a0d' : C.card, border: `1px solid ${i === 0 ? '#166534' : C.border}`, borderRadius: 10, alignItems: 'center' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: i === 0 ? '#4ade80' : C.muted, textAlign: 'center' }}>{row.pos}</div>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ width: 8, height: 8, borderRadius: 4, background: TEE_HEX[row.player.tee_color] ?? '#888', flexShrink: 0 }} />
                                <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{row.player.display_name}</span>
                              </div>
                              <span style={{ fontSize: 11, color: C.muted, paddingLeft: 14 }}>HCP {row.playingHcp}</span>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              <span style={{ fontSize: 16, fontWeight: 700, color: i === 0 ? '#4ade80' : C.text }}>
                                {row.holesPlayed === 0 ? '—' : row.value}
                              </span>
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
            </>
          )}

          {/* ── SCORECARD */}
          {tab === 'scorecard' && (
            <ScorecardView
              players={players} holes={playedHoles} scores={scores}
              playerCalcs={playerCalcs} format={fmt ?? null}
            />
          )}

        </div>
      </div>

      {/* ── FAB Scorear */}
      {isActive && round && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 20 }}>
          <Link href={`/golf/${id}/scorear`}
            style={{ display: 'flex', alignItems: 'center', gap: 9, background: C.primary, color: C.text, borderRadius: 28, padding: '14px 22px', textDecoration: 'none', fontSize: 15, fontWeight: 700, fontFamily: FONT, boxShadow: '0 4px 24px rgba(5,80,116,0.5)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 20h9" stroke={C.text} strokeWidth="2" strokeLinecap="round"/>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke={C.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Scorear
          </Link>
        </div>
      )}
    </>
  )
}

// ─────────────────────────────────────────────
// MATCH LEADERBOARD COMPONENT
// ─────────────────────────────────────────────

function buildMatchUnits(units: CompUnit[], players: Player[], playerCalcs: PlayerCalc[]): MatchUnit[] {
  return units.map(u => {
    const unitPlayers = u.golf_competition_unit_members
      .map(m => players.find(p => p.id === m.player_id))
      .filter(Boolean) as Player[]
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
      {pairs.map(([a, b], i) => (
        <MatchCard key={i} state={buildMatchState(a, b, holes, scores, isFourball)} holes={holes} />
      ))}
    </div>
  )
}

function MatchCard({ state, holes }: { state: MatchState; holes: Hole[] }) {
  const [expanded, setExpanded] = useState(false)
  const { unitA, unitB, status, upDown, isFinished } = state
  const statusColor = isFinished ? '#4ade80' : upDown === 0 ? C.muted : upDown > 0 ? '#5b9bd5' : '#e07b4f'

  return (
    <div style={{ background: C.card, border: `1px solid ${isFinished ? '#166534' : C.border}`, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
          {/* Unidad A */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: upDown > 0 ? C.text : C.muted }}>{unitA.name}</div>
            <div style={{ fontSize: 11, color: C.muted }}>{unitA.players.map(p => p.display_name).join(' & ')}</div>
            <div style={{ fontSize: 10, color: '#4a4a55' }}>HCP {unitA.teamPlayingHcp}</div>
          </div>
          {/* Status */}
          <div style={{ flexShrink: 0, textAlign: 'center', padding: '0 12px' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: statusColor }}>{status}</div>
            <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              {isFinished ? 'Finalizado' : `${state.holesRemaining} restantes`}
            </div>
          </div>
          {/* Unidad B */}
          <div style={{ flex: 1, textAlign: 'right' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: upDown < 0 ? C.text : C.muted }}>{unitB.name}</div>
            <div style={{ fontSize: 11, color: C.muted }}>{unitB.players.map(p => p.display_name).join(' & ')}</div>
            <div style={{ fontSize: 10, color: '#4a4a55' }}>HCP {unitB.teamPlayingHcp}</div>
          </div>
        </div>

        {/* Barra visual */}
        <div style={{ position: 'relative', height: 6, background: '#111124', borderRadius: 3, overflow: 'hidden', marginBottom: 10 }}>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 2, background: '#2a2a3a', transform: 'translateX(-50%)', zIndex: 1 }} />
          {upDown !== 0 && (() => {
            const played = holes.length - state.holesRemaining
            const pct    = played > 0 ? Math.min(0.5, Math.abs(upDown) / Math.max(played, 1) * 0.5) : 0
            return (
              <div style={{
                position: 'absolute', top: 0, bottom: 0, borderRadius: 3,
                width: `${pct * 100}%`,
                left:  upDown > 0 ? `${50 - pct * 100}%` : '50%',
                background: upDown > 0 ? '#5b9bd5' : '#e07b4f',
              }} />
            )
          })()}
        </div>

        <button onClick={() => setExpanded(!expanded)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: C.muted, fontFamily: FONT, padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
          {expanded ? '▲' : '▼'} Hoyo a hoyo
        </button>
      </div>

      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: '10px 16px', overflowX: 'auto' }}>
          <div style={{ display: 'flex', gap: 4, minWidth: 'fit-content' }}>
            {holes.map(h => {
              const res   = state.holeResults[h.hole_number] ?? 'pending'
              const bg    = res === 'win' ? '#0a2040' : res === 'loss' ? '#2a0a0a' : res === 'halved' ? '#111124' : '#0a0a14'
              const color = res === 'win' ? '#5b9bd5' : res === 'loss' ? '#e07b4f' : res === 'halved' ? C.muted : '#2a2a3a'
              const label = res === 'win' ? 'A' : res === 'loss' ? 'B' : res === 'halved' ? '—' : '·'
              return (
                <div key={h.hole_number} style={{ textAlign: 'center', minWidth: 26 }}>
                  <div style={{ fontSize: 9, color: C.muted, marginBottom: 2 }}>{h.hole_number}</div>
                  <div style={{ width: 26, height: 26, borderRadius: 6, background: bg, border: `1px solid ${color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color }}>
                    {label}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// FOURBALL AMERICANO LEADERBOARD
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
      {/* Parejas */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Ranking parejas</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {pairRows.map((r, i) => (
            <div key={r.unit.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 50px 40px', gap: 8, padding: '11px 12px', background: i === 0 ? '#0d1a0d' : C.card, border: `1px solid ${i === 0 ? '#166534' : C.border}`, borderRadius: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: i === 0 ? '#4ade80' : C.muted, textAlign: 'center' }}>{i + 1}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{r.unit.name}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{r.players.map(p => p.display_name).join(' & ')}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: i === 0 ? '#4ade80' : C.text }}>{r.pts}</span>
                <span style={{ fontSize: 10, color: C.muted, display: 'block' }}>pts</span>
              </div>
              <span style={{ fontSize: 11, color: C.muted, textAlign: 'right' }}>{r.played}h</span>
            </div>
          ))}
        </div>
      </div>
      {/* Individual */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Ranking individual</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {indivRows.map((r, i) => (
            <div key={r.player.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 50px 40px', gap: 8, padding: '10px 12px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 9, alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.muted, textAlign: 'center' }}>{i + 1}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{r.player.display_name}</span>
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{r.pts}</span>
                <span style={{ fontSize: 10, color: C.muted, display: 'block' }}>pts</span>
              </div>
              <span style={{ fontSize: 11, color: C.muted, textAlign: 'right' }}>{r.played}h</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// SCORECARD GRID
// ─────────────────────────────────────────────

function ScorecardView({ players, holes, scores, playerCalcs, format }: {
  players: Player[]; holes: Hole[]; scores: HoleScore[]
  playerCalcs: PlayerCalc[]; format: Format | null
}) {
  const isStableford = format?.format_type === 'stableford'

  const getScore   = (pid: string, h: number) => scores.find(s => s.player_id === pid && s.hole_number === h)?.gross ?? null
  const getStrokes = (pid: string, h: number) => playerCalcs.find(c => c.player.id === pid)?.strokes[h] ?? 0
  const subTotals  = (pid: string, holeSet: Hole[]) => {
    let gross = 0; let pts = 0; let par = 0; let count = 0
    const calc = playerCalcs.find(c => c.player.id === pid)
    holeSet.forEach(h => {
      const g = getScore(pid, h.hole_number)
      if (!g) return
      gross += g; par += h.par; count++
      if (isStableford) pts += stablefordPts(g, h.par, calc?.strokes[h.hole_number] ?? 0)
    })
    return { gross: count > 0 ? gross : null, pts: count > 0 ? pts : null, par }
  }

  const show18 = holes.some(h => h.hole_number >= 10)

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 16 }}>
      <table style={{ borderCollapse: 'collapse', minWidth: '100%', fontSize: 12, fontFamily: FONT }}>
        <thead>
          <tr>
            <td style={stickyCell}>—</td>
            {holes.map(h => <td key={h.hole_number} style={{ ...hdrCell, fontSize: 10 }}>{h.hole_number}</td>)}
            {show18 && <td style={{ ...hdrCell, fontSize: 10, minWidth: 36 }}>TOT</td>}
          </tr>
          <tr>
            <td style={{ ...stickyCell, fontSize: 10, color: C.muted }}>PAR</td>
            {holes.map(h => <td key={h.hole_number} style={{ ...hdrCell, fontSize: 10 }}>{h.par}</td>)}
            {show18 && <td style={hdrCell}>{holes.reduce((s, h) => s + h.par, 0)}</td>}
          </tr>
        </thead>
        <tbody>
          {players.map(p => {
            const calc   = playerCalcs.find(c => c.player.id === p.id)
            const totAll = subTotals(p.id, holes)
            return (
              <tr key={p.id}>
                <td style={{ ...stickyCell, whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 7, height: 7, borderRadius: 4, background: TEE_HEX[p.tee_color] ?? '#888', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{p.display_name}</span>
                  </div>
                  <span style={{ fontSize: 10, color: C.muted, paddingLeft: 12 }}>{calc ? `hcp ${calc.playingHcp}` : ''}</span>
                </td>
                {holes.map(h => {
                  const gross   = getScore(p.id, h.hole_number)
                  const strokes = getStrokes(p.id, h.hole_number)
                  const nett    = gross !== null ? gross - strokes : null
                  const vspar   = gross !== null ? (isStableford ? stablefordPts(gross, h.par, strokes) : gross - h.par) : null
                  const color   = vspar !== null
                    ? (isStableford ? vspar >= 3 ? C.birdie : vspar === 2 ? C.par : vspar === 1 ? C.bogey : C.double : scoreColor(vspar))
                    : C.muted
                  return (
                    <td key={h.hole_number} style={{ ...scoreCell, position: 'relative' }}>
                      {strokes > 0 && (
                        <div style={{ position: 'absolute', top: 3, right: 3, display: 'flex', gap: 1 }}>
                          {Array.from({ length: Math.min(strokes, 2) }).map((_, i) => (
                            <div key={i} style={{ width: 4, height: 4, borderRadius: 2, background: C.primary }} />
                          ))}
                        </div>
                      )}
                      {gross !== null ? (
                        <div style={{ lineHeight: 1.1 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color }}>{gross}</div>
                          {strokes > 0 && nett !== null && <div style={{ fontSize: 9, color: C.muted }}>/{nett}</div>}
                        </div>
                      ) : <span style={{ color: C.border, fontSize: 11 }}>·</span>}
                    </td>
                  )
                })}
                {show18 && (
                  <td style={{ ...scoreCell, background: '#111124', minWidth: 36 }}>
                    {totAll.gross !== null ? (
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{isStableford ? totAll.pts : totAll.gross}</div>
                        {!isStableford && calc && <div style={{ fontSize: 9, color: C.muted }}>/{totAll.gross! - calc.playingHcp}</div>}
                      </div>
                    ) : <span style={{ color: C.border }}>·</span>}
                  </td>
                )}
              </tr>
            )
          })}
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
    <Link href={href} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 8, textDecoration: 'none', color: danger ? '#f87171' : C.text, fontSize: 14, fontWeight: 500, fontFamily: FONT }}>
      <span>{icon}</span>
      <span>{label}</span>
    </Link>
  )
}

const stickyCell: React.CSSProperties = {
  position: 'sticky', left: 0, background: '#080812',
  zIndex: 2, padding: '8px 12px', borderRight: `1px solid #1e1736`, minWidth: 110,
}
const hdrCell: React.CSSProperties = {
  textAlign: 'center', padding: '6px 4px', background: '#0a0a14', color: '#706c7e',
  minWidth: 32, fontWeight: 700, borderRight: '1px solid #0d0d1a',
}
const scoreCell: React.CSSProperties = {
  textAlign: 'center', padding: '6px 4px', background: '#0d0d1a',
  minWidth: 32, borderRight: '1px solid #080812', borderBottom: '1px solid #080812',
}