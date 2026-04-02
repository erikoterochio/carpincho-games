'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
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
  strokes: Record<number, number>   // hole_number → strokes recibidos (0,1,2)
}

type LeaderboardRow = {
  pos: number
  player: Player
  playingHcp: number
  value: number         // pts para stableford, nett para stroke
  holesPlayed: number
  vsParDisplay: string  // "+3", "-1", "E", etc.
  complete: boolean     // terminó todos los hoyos
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

const FORMAT_LABELS: Record<string, string> = {
  stroke: 'Medal', stableford: 'Stableford', match: 'Match Play',
  fourball_clasico: 'Fourball Clásico', fourball_americano: 'Fourball Americano', laguneada: 'Laguneada',
}

const TEE_HEX: Record<string, string> = {
  black: '#222', blue: '#1d4ed8', white: '#d1d5db', yellow: '#d97706', red: '#dc2626',
}

// ─────────────────────────────────────────────
// FUNCIONES DE CÁLCULO
// ─────────────────────────────────────────────

/** Strokes que recibe un jugador en un hoyo dado su playing hcp */
function hcpStrokes(playingHcp: number, strokeIndex: number): number {
  if (playingHcp <= 0) return 0
  const base = Math.floor(Math.abs(playingHcp) / 18)
  const rem  = Math.abs(playingHcp) % 18
  const extra = strokeIndex <= rem ? 1 : 0
  return playingHcp < 0 ? -(base + extra) : base + extra  // hcp negativo = plus handicap
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
  const slope   = course.slope   ?? 113
  const rating  = course.rating  ?? (course.par ?? 72)
  const par     = course.par     ?? 72
  const pct     = (formatAllowance ?? allowance) / 100

  return players.map(p => {
    const courseHcp  = calcCourseHcp(p.handicap_index, slope, rating, par)
    const playingHcp = Math.round(courseHcp * pct)
    const strokes: Record<number, number> = {}
    holes.forEach(h => { strokes[h.hole_number] = hcpStrokes(playingHcp, h.stroke_index) })
    return { player: p, courseHcp, playingHcp, strokes }
  })
}

/** Puntos Stableford de un hoyo */
function stablefordPts(gross: number, holePar: number, strokes: number): number {
  const net  = gross - strokes
  const diff = net - holePar  // vs par neto
  return Math.max(0, 2 - diff)
}

/** +/- par display */
function vsParStr(diff: number): string {
  if (diff === 0) return 'E'
  return diff > 0 ? `+${diff}` : `${diff}`
}

/** Color de un score vs par */
function scoreColor(vspar: number): string {
  if (vspar <= -2) return C.eagle
  if (vspar === -1) return C.birdie
  if (vspar === 0)  return C.par
  if (vspar === 1)  return C.bogey
  return C.double
}

// ─────────────────────────────────────────────
// BUILD LEADERBOARD por formato
// ─────────────────────────────────────────────

function buildStablefordLB(
  calcs: PlayerCalc[], holes: Hole[], scores: HoleScore[], totalHoles: number
): LeaderboardRow[] {
  const rows = calcs.map(({ player, playingHcp, strokes }) => {
    let pts = 0; let played = 0; let vsParAcc = 0
    holes.forEach(h => {
      const s = scores.find(x => x.player_id === player.id && x.hole_number === h.hole_number)
      if (!s?.gross) return
      const str = strokes[h.hole_number] ?? 0
      pts    += stablefordPts(s.gross, h.par, str)
      vsParAcc += s.gross - h.par
      played++
    })
    return { player, playingHcp, value: pts, holesPlayed: played, vsParAcc, complete: played >= totalHoles }
  }).sort((a, b) => b.value - a.value || a.vsParAcc - b.vsParAcc)

  let pos = 1
  return rows.map((r, i) => {
    if (i > 0 && r.value < rows[i-1].value) pos = i + 1
    return { pos, player: r.player, playingHcp: r.playingHcp, value: r.value, holesPlayed: r.holesPlayed, vsParDisplay: vsParStr(r.vsParAcc), complete: r.complete }
  })
}

function buildStrokeLB(
  calcs: PlayerCalc[], holes: Hole[], scores: HoleScore[], totalHoles: number
): LeaderboardRow[] {
  const rows = calcs.map(({ player, playingHcp, strokes }) => {
    let gross = 0; let parAcc = 0; let played = 0
    holes.forEach(h => {
      const s = scores.find(x => x.player_id === player.id && x.hole_number === h.hole_number)
      if (!s?.gross) return
      gross  += s.gross
      parAcc += h.par
      played++
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
    if (i > 0 && r.nett < rows[i-1].nett) pos = i + 1
    return { pos, player: r.player, playingHcp: r.playingHcp, value: r.nett, holesPlayed: r.holesPlayed, vsParDisplay: vsParStr(r.vsParN), complete: r.complete }
  })
}

// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────

export default function TournamentPage() {
  const { id }   = useParams<{ id: string }>()
  const router   = useRouter()
  const supabase = createClient()

  const [loading,    setLoading]    = useState(true)
  const [tab,        setTab]        = useState<'leaderboard' | 'scorecard'>('leaderboard')
  const [fmtTab,     setFmtTab]     = useState(0)   // índice del formato activo en leaderboard
  const [copied,     setCopied]     = useState(false)

  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [course,     setCourse]     = useState<Course | null>(null)
  const [holes,      setHoles]      = useState<Hole[]>([])
  const [players,    setPlayers]    = useState<Player[]>([])
  const [formats,    setFormats]    = useState<Format[]>([])
  const [round,      setRound]      = useState<Round | null>(null)
  const [scores,     setScores]     = useState<HoleScore[]>([])

  // ── Carga inicial
  useEffect(() => {
    const load = async () => {
      // Torneo
      const { data: t } = await supabase
        .from('golf_tournaments')
        .select('id,name,status,holes_config,handicap_allowance,invite_code,num_rounds,course_id')
        .eq('id', id)
        .single()
      if (!t) { setLoading(false); return }
      setTournament(t)

      // Cancha + hoyos
      const { data: c } = await supabase
        .from('golf_courses')
        .select('id,name,city,par,rating,slope')
        .eq('id', t.course_id)
        .single()
      setCourse(c ?? null)

      if (c) {
        const { data: hs } = await supabase
          .from('golf_holes')
          .select('hole_number,par,stroke_index')
          .eq('course_id', c.id)
          .order('hole_number')
        setHoles(hs ?? [])
      }

      // Formatos, jugadores, ronda activa
      const [fmtRes, plRes, rndRes] = await Promise.all([
        supabase.from('golf_formats').select('id,format_type,display_name,handicap_allowance').eq('tournament_id', id).order('sort_order'),
        supabase.from('golf_players').select('id,display_name,handicap_index,tee_color').eq('tournament_id', id).order('sort_order'),
        supabase.from('golf_rounds').select('id,round_number,status,date').eq('tournament_id', id).order('round_number'),
      ])
      setFormats(fmtRes.data ?? [])
      setPlayers(plRes.data ?? [])

      const activeRound = (rndRes.data ?? []).find(r => r.status === 'active') ?? (rndRes.data ?? [])[0] ?? null
      setRound(activeRound)

      // Scores de la ronda activa
      if (activeRound) {
        const { data: sc } = await supabase
          .from('golf_hole_scores')
          .select('id,round_id,player_id,hole_number,gross,updated_at')
          .eq('round_id', activeRound.id)
        setScores(sc ?? [])
      }

      setLoading(false)
    }
    load()
  }, [id])

  // ── Realtime: actualizar scores en vivo
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

  // ── Hoyos a jugar según config
  const playedHoles = useMemo<Hole[]>(() => {
    if (!tournament || holes.length === 0) return []
    if (tournament.holes_config === 'front9') return holes.filter(h => h.hole_number <= 9)
    if (tournament.holes_config === 'back9')  return holes.filter(h => h.hole_number >= 10)
    return holes
  }, [holes, tournament?.holes_config])

  const totalHoles = playedHoles.length || (tournament?.holes_config === '18' ? 18 : 9)

  // ── Leaderboard calculado para el formato activo
  const leaderboard = useMemo<LeaderboardRow[]>(() => {
    if (!tournament || !course || players.length === 0 || formats.length === 0) return []
    const fmt = formats[fmtTab]
    if (!fmt) return []
    const calcs = computePlayerCalcs(players, playedHoles, course, tournament.handicap_allowance, fmt.handicap_allowance)
    if (['stableford','fourball_clasico','fourball_americano','laguneada'].includes(fmt.format_type)) {
      return buildStablefordLB(calcs, playedHoles, scores, totalHoles)
    }
    return buildStrokeLB(calcs, playedHoles, scores, totalHoles)
  }, [players, formats, fmtTab, playedHoles, scores, course, tournament, totalHoles])

  // ── Calcs por jugador para el scorecard
  const playerCalcs = useMemo<PlayerCalc[]>(() => {
    if (!tournament || !course || players.length === 0) return []
    const fmt = formats[fmtTab]
    return computePlayerCalcs(players, playedHoles, course, tournament.handicap_allowance, fmt?.handicap_allowance ?? null)
  }, [players, formats, fmtTab, playedHoles, course, tournament])

  // ── Copiar código de invitación
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

  const isActive   = tournament.status === 'active'
  const activeRnd  = round

  // ─── RENDER ────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { height: 3px; width: 3px; }
        ::-webkit-scrollbar-thumb { background: #1e1736; border-radius: 3px; }
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
            <span style={{ fontSize: 16, fontWeight: 700, color: C.text, flex: 1 }} className="truncate">{tournament.name}</span>
            {/* Live indicator */}
            {isActive && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#0a2a1a', border: '1px solid #14532d', borderRadius: 20, padding: '3px 9px' }}>
                <div style={{ width: 6, height: 6, borderRadius: 3, background: '#4ade80', animation: 'pulse 2s infinite' }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: '#4ade80' }}>EN VIVO</span>
              </div>
            )}
          </div>

          {/* ── Header del torneo */}
          <div style={{ padding: '16px 18px', borderBottom: `1px solid ${C.border}` }}>
            {/* Cancha */}
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>
              {course ? `${course.name}${course.city ? ` · ${course.city}` : ''}` : '—'}
              {' · '}
              {tournament.holes_config === '18' ? '18 hoyos' : tournament.holes_config === 'front9' ? 'Primeros 9' : 'Segundos 9'}
            </div>

            {/* Formatos activos */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
              {formats.map(f => (
                <span key={f.id} style={{ fontSize: 10, fontWeight: 700, color: FORMAT_COLORS[f.format_type] ?? C.muted, background: (FORMAT_COLORS[f.format_type] ?? C.muted) + '18', border: `1px solid ${(FORMAT_COLORS[f.format_type] ?? C.muted)}40`, borderRadius: 5, padding: '2px 8px' }}>
                  {f.display_name}
                </span>
              ))}
            </div>

            {/* Código de invitación */}
            <button onClick={copyCode}
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.card, border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 14px', cursor: 'pointer', width: '100%' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <rect x="9" y="9" width="13" height="13" rx="2" stroke={C.muted} strokeWidth="1.8"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke={C.muted} strokeWidth="1.8"/>
              </svg>
              <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>Código de invitación:</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text, letterSpacing: 2 }}>{tournament.invite_code}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: copied ? '#4ade80' : C.muted }}>
                {copied ? 'Copiado ✓' : 'Copiar'}
              </span>
            </button>
          </div>

          {/* ── Tabs leaderboard / scorecard */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 53, background: C.bg, zIndex: 9 }}>
            {(['leaderboard', 'scorecard'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ flex: 1, padding: '11px', background: 'none', border: 'none', borderBottom: `2px solid ${tab === t ? C.primary : 'transparent'}`, cursor: 'pointer', fontSize: 13, fontWeight: tab === t ? 700 : 500, color: tab === t ? C.text : C.muted, marginBottom: -1, fontFamily: FONT, transition: 'all 0.15s' }}>
                {t === 'leaderboard' ? 'Leaderboard' : 'Scorecard'}
              </button>
            ))}
          </div>

          {/* ── Tabs de formato (encima del leaderboard si hay más de 1) */}
          {formats.length > 1 && (
            <div style={{ display: 'flex', gap: 6, padding: '10px 18px', overflowX: 'auto', borderBottom: `1px solid ${C.border}` }}>
              {formats.map((f, i) => (
                <button key={f.id} onClick={() => setFmtTab(i)}
                  style={{ padding: '5px 12px', borderRadius: 20, border: `1px solid ${fmtTab === i ? FORMAT_COLORS[f.format_type] ?? C.primary : C.border}`, background: fmtTab === i ? (FORMAT_COLORS[f.format_type] ?? C.primary) + '20' : 'transparent', color: fmtTab === i ? (FORMAT_COLORS[f.format_type] ?? C.text) : C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: FONT }}>
                  {f.display_name}
                </button>
              ))}
            </div>
          )}

          {/* ── Leaderboard */}
          {tab === 'leaderboard' && (
            <div style={{ padding: '14px 18px' }}>
              {leaderboard.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>⛳</div>
                  <p style={{ fontSize: 14 }}>No hay scores ingresados aún</p>
                  <p style={{ fontSize: 12, marginTop: 6 }}>Los jugadores cargan sus scores desde "Scorear"</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {/* Header */}
                  <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 60px 50px 36px', gap: 8, padding: '6px 12px', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: C.muted, fontWeight: 700 }}>#</span>
                    <span style={{ fontSize: 10, color: C.muted, fontWeight: 700 }}>JUGADOR</span>
                    <span style={{ fontSize: 10, color: C.muted, fontWeight: 700, textAlign: 'center' }}>
                      {formats[fmtTab]?.format_type === 'stableford' ? 'PTS' : 'NETT'}
                    </span>
                    <span style={{ fontSize: 10, color: C.muted, fontWeight: 700, textAlign: 'center' }}>VS PAR</span>
                    <span style={{ fontSize: 10, color: C.muted, fontWeight: 700, textAlign: 'right' }}>H</span>
                  </div>

                  {leaderboard.map((row, i) => {
                    const isStableford = formats[fmtTab]?.format_type === 'stableford'
                    const vsParColor = row.vsParDisplay === 'E' ? C.par :
                                       row.vsParDisplay.startsWith('-') ? C.birdie : C.bogey
                    return (
                      <div key={row.player.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 60px 50px 36px', gap: 8, padding: '11px 12px', background: i === 0 ? '#0d1a0d' : C.card, border: `1px solid ${i === 0 ? '#166534' : C.border}`, borderRadius: 10, alignItems: 'center' }}>
                        {/* Posición */}
                        <div style={{ fontSize: 13, fontWeight: 700, color: i === 0 ? '#4ade80' : C.muted, textAlign: 'center' }}>
                          {row.pos}
                        </div>
                        {/* Jugador */}
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 8, height: 8, borderRadius: 4, background: TEE_HEX[row.player.tee_color] ?? '#888', flexShrink: 0 }} />
                            <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{row.player.display_name}</span>
                          </div>
                          <span style={{ fontSize: 11, color: C.muted, paddingLeft: 14 }}>HCP {row.playingHcp}</span>
                        </div>
                        {/* Puntaje */}
                        <div style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: 16, fontWeight: 700, color: i === 0 ? '#4ade80' : C.text }}>
                            {row.holesPlayed === 0 ? '—' : isStableford ? row.value : row.value}
                          </span>
                          {isStableford && row.holesPlayed > 0 && (
                            <span style={{ fontSize: 10, color: C.muted, display: 'block' }}>pts</span>
                          )}
                        </div>
                        {/* Vs par */}
                        <div style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: row.holesPlayed === 0 ? C.muted : vsParColor }}>
                            {row.holesPlayed === 0 ? '—' : row.vsParDisplay}
                          </span>
                        </div>
                        {/* Hoyos jugados */}
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

          {/* ── Scorecard */}
          {tab === 'scorecard' && (
            <ScorecardView
              players={players}
              holes={playedHoles}
              scores={scores}
              playerCalcs={playerCalcs}
              course={course}
              format={formats[fmtTab] ?? null}
            />
          )}

        </div>
      </div>

      {/* ── Botón flotante Scorear */}
      {isActive && activeRnd && (
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

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </>
  )
}

// ─────────────────────────────────────────────
// SCORECARD GRID
// ─────────────────────────────────────────────

function ScorecardView({ players, holes, scores, playerCalcs, course, format }: {
  players: Player[]; holes: Hole[]; scores: HoleScore[]
  playerCalcs: PlayerCalc[]; course: Course | null; format: Format | null
}) {
  const isStableford = format?.format_type === 'stableford'

  const getScore = (playerId: string, holeNum: number) =>
    scores.find(s => s.player_id === playerId && s.hole_number === holeNum)?.gross ?? null

  const getStrokes = (playerId: string, holeNum: number) => {
    const calc = playerCalcs.find(c => c.player.id === playerId)
    return calc?.strokes[holeNum] ?? 0
  }

  // Calcular subtotales
  const subTotals = (playerId: string, holeSet: Hole[]) => {
    let gross = 0; let pts = 0; let par = 0; let count = 0
    const calc = playerCalcs.find(c => c.player.id === playerId)
    holeSet.forEach(h => {
      const g = getScore(playerId, h.hole_number)
      if (!g) return
      gross += g; par += h.par; count++
      if (isStableford) pts += stablefordPts(g, h.par, calc?.strokes[h.hole_number] ?? 0)
    })
    return { gross: count > 0 ? gross : null, pts: count > 0 ? pts : null, par }
  }

  const front9 = holes.filter(h => h.hole_number <= 9)
  const back9  = holes.filter(h => h.hole_number >= 10)
  const show18 = holes.some(h => h.hole_number >= 10)

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 16 }}>
      <table style={{ borderCollapse: 'collapse', minWidth: '100%', fontSize: 12, fontFamily: FONT }}>
        {/* Header: par por hoyo */}
        <thead>
          <tr>
            <td style={stickyCell}>—</td>
            {holes.map(h => (
              <td key={h.hole_number} style={{ ...hdrCell, color: C.muted, fontSize: 10 }}>
                {h.hole_number}
              </td>
            ))}
            {show18 && <td style={{ ...hdrCell, color: C.muted, fontSize: 10, minWidth: 36 }}>TOT</td>}
          </tr>
          <tr>
            <td style={{ ...stickyCell, fontSize: 10, color: C.muted }}>PAR</td>
            {holes.map(h => (
              <td key={h.hole_number} style={{ ...hdrCell, color: C.muted, fontSize: 10 }}>{h.par}</td>
            ))}
            {show18 && <td style={{ ...hdrCell, color: C.muted }}>{holes.reduce((s, h) => s + h.par, 0)}</td>}
          </tr>
        </thead>

        {/* Scores por jugador */}
        <tbody>
          {players.map(p => {
            const calc = playerCalcs.find(c => c.player.id === p.id)
            const tee  = TEE_HEX[p.tee_color] ?? '#888'
            const totFront = show18 ? subTotals(p.id, front9) : null
            const totBack  = show18 ? subTotals(p.id, back9)  : null
            const totAll   = subTotals(p.id, holes)

            return (
              <tr key={p.id}>
                {/* Nombre fijo a la izquierda */}
                <td style={{ ...stickyCell, whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 7, height: 7, borderRadius: 4, background: tee, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{p.display_name}</span>
                  </div>
                  <span style={{ fontSize: 10, color: C.muted, paddingLeft: 12 }}>
                    {calc ? `hcp ${calc.playingHcp}` : ''}
                  </span>
                </td>

                {/* Una celda por hoyo */}
                {holes.map(h => {
                  const gross   = getScore(p.id, h.hole_number)
                  const strokes = getStrokes(p.id, h.hole_number)
                  const nett    = gross !== null ? gross - strokes : null
                  const vspar   = gross !== null ? (isStableford ? stablefordPts(gross, h.par, strokes) : gross - h.par) : null
                  const color   = vspar !== null
                    ? (isStableford
                        ? vspar >= 3 ? C.birdie : vspar === 2 ? C.par : vspar === 1 ? C.bogey : C.double
                        : scoreColor(vspar))
                    : C.muted

                  return (
                    <td key={h.hole_number} style={{ ...scoreCell, position: 'relative' }}>
                      {/* Indicador de strokes */}
                      {strokes > 0 && (
                        <div style={{ position: 'absolute', top: 3, right: 3, display: 'flex', gap: 1 }}>
                          {Array.from({ length: Math.min(strokes, 2) }).map((_, i) => (
                            <div key={i} style={{ width: 4, height: 4, borderRadius: 2, background: C.primary }} />
                          ))}
                        </div>
                      )}
                      {/* Score */}
                      {gross !== null ? (
                        <div style={{ lineHeight: 1.1 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color }}>
                            {gross}
                          </div>
                          {strokes > 0 && nett !== null && (
                            <div style={{ fontSize: 9, color: C.muted }}>
                              /{nett}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: C.border, fontSize: 11 }}>·</span>
                      )}
                    </td>
                  )
                })}

                {/* Total */}
                {show18 && (
                  <td style={{ ...scoreCell, background: '#111124', minWidth: 36 }}>
                    {totAll.gross !== null ? (
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{isStableford ? totAll.pts : totAll.gross}</div>
                        {!isStableford && calc && totAll.gross !== null && (
                          <div style={{ fontSize: 9, color: C.muted }}>/{totAll.gross - calc.playingHcp}</div>
                        )}
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

// ── Estilos de tabla
const stickyCell: React.CSSProperties = {
  position: 'sticky', left: 0, background: '#080812',
  zIndex: 2, padding: '8px 12px', borderRight: `1px solid #1e1736`,
  minWidth: 110,
}

const hdrCell: React.CSSProperties = {
  textAlign: 'center', padding: '6px 4px',
  background: '#0a0a14', color: '#706c7e',
  minWidth: 32, fontWeight: 700, borderRight: '1px solid #0d0d1a',
}

const scoreCell: React.CSSProperties = {
  textAlign: 'center', padding: '6px 4px',
  background: '#0d0d1a', minWidth: 32,
  borderRight: '1px solid #080812',
  borderBottom: '1px solid #080812',
}