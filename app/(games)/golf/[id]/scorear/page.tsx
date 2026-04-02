'use client'

import { useState, useEffect, useCallback, useTransition } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────

type Player    = { id: string; display_name: string; handicap_index: number; tee_color: string }
type Hole      = { hole_number: number; par: number; stroke_index: number }
type Course    = { par: number | null; rating: number | null; slope: number | null }
type Tournament = { id: string; holes_config: string; handicap_allowance: number; name: string }
type Round     = { id: string; status: string }
type HoleScore = { player_id: string; hole_number: number; gross: number | null }
type Format    = { format_type: string; handicap_allowance: number | null }

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

const TEE_HEX: Record<string, string> = {
  black: '#222', blue: '#1d4ed8', white: '#d1d5db', yellow: '#d97706', red: '#dc2626',
}

// ─────────────────────────────────────────────
// FUNCIONES DE CÁLCULO (mismas que en la página principal)
// ─────────────────────────────────────────────

function hcpStrokes(playingHcp: number, strokeIndex: number): number {
  if (playingHcp <= 0) return 0
  const base = Math.floor(Math.abs(playingHcp) / 18)
  const rem  = Math.abs(playingHcp) % 18
  return base + (strokeIndex <= rem ? 1 : 0)
}

function calcPlayingHcp(hcpIndex: number, course: Course, allowance: number): number {
  const slope  = course.slope  ?? 113
  const rating = course.rating ?? (course.par ?? 72)
  const par    = course.par    ?? 72
  const courseHcp = Math.round(hcpIndex * (slope / 113) + (rating - par))
  return Math.round(courseHcp * allowance / 100)
}

function stablefordPts(gross: number, par: number, strokes: number): number {
  return Math.max(0, 2 - (gross - strokes - par))
}

function scoreColor(gross: number, par: number, strokes: number): string {
  const net = gross - strokes
  const diff = net - par
  if (diff <= -2) return C.eagle
  if (diff === -1) return C.birdie
  if (diff === 0)  return C.par
  if (diff === 1)  return C.bogey
  return C.double
}

// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────

export default function ScorearPage() {
  const { id }   = useParams<{ id: string }>()
  const router   = useRouter()
  const supabase = createClient()

  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState<string | null>(null) // player_id guardando

  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [course,     setCourse]     = useState<Course | null>(null)
  const [holes,      setHoles]      = useState<Hole[]>([])
  const [players,    setPlayers]    = useState<Player[]>([])
  const [round,      setRound]      = useState<Round | null>(null)
  const [scores,     setScores]     = useState<HoleScore[]>([])
  const [formats,    setFormats]    = useState<Format[]>([])

  const [currentHole, setCurrentHole] = useState(1)

  // ── Carga inicial
  useEffect(() => {
    const load = async () => {
      const { data: t } = await supabase
        .from('golf_tournaments')
        .select('id,name,holes_config,handicap_allowance,course_id')
        .eq('id', id).single()
      if (!t) { setLoading(false); return }
      setTournament(t)

      const { data: c } = await supabase
        .from('golf_courses').select('par,rating,slope').eq('id', t.course_id).single()
      setCourse(c ?? null)

      const [hRes, pRes, fRes, rRes] = await Promise.all([
        supabase.from('golf_holes').select('hole_number,par,stroke_index').eq('course_id', t.course_id).order('hole_number'),
        supabase.from('golf_players').select('id,display_name,handicap_index,tee_color').eq('tournament_id', id).order('sort_order'),
        supabase.from('golf_formats').select('format_type,handicap_allowance').eq('tournament_id', id),
        supabase.from('golf_rounds').select('id,status').eq('tournament_id', id).order('round_number'),
      ])

      setHoles(hRes.data ?? [])
      setPlayers(pRes.data ?? [])
      setFormats(fRes.data ?? [])

      const activeRound = (rRes.data ?? []).find(r => r.status === 'active') ?? (rRes.data ?? [])[0] ?? null
      setRound(activeRound)

      if (activeRound) {
        const { data: sc } = await supabase
          .from('golf_hole_scores')
          .select('player_id,hole_number,gross')
          .eq('round_id', activeRound.id)
        setScores(sc ?? [])
      }

      // Empezar en el primer hoyo con algún score incompleto
      const firstHole = hRes.data?.[0]?.hole_number ?? 1
      setCurrentHole(firstHole)
      setLoading(false)
    }
    load()
  }, [id])

  // ── Hoyos disponibles según config
  const playedHoles = (() => {
    if (!tournament) return holes
    if (tournament.holes_config === 'front9') return holes.filter(h => h.hole_number <= 9)
    if (tournament.holes_config === 'back9')  return holes.filter(h => h.hole_number >= 10)
    return holes
  })()

  const totalHoles    = playedHoles.length
  const currentHoleData = playedHoles.find(h => h.hole_number === currentHole) ?? playedHoles[0]
  const currentIndex  = playedHoles.findIndex(h => h.hole_number === currentHole)

  // ── Playing handicap de cada jugador
  const playerHcps = players.map(p => {
    const allowance = (formats.length > 0 ? (formats[0].handicap_allowance ?? tournament?.handicap_allowance) : tournament?.handicap_allowance) ?? 100
    const phcp = course ? calcPlayingHcp(p.handicap_index, course, allowance) : Math.round(p.handicap_index)
    return { playerId: p.id, playingHcp: phcp }
  })

  // ── Guardar score (upsert)
  const saveScore = useCallback(async (playerId: string, gross: number | null) => {
    if (!round) return
    setSaving(playerId)

    // Optimistic update
    setScores(prev => {
      const idx = prev.findIndex(s => s.player_id === playerId && s.hole_number === currentHole)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], gross }
        return next
      }
      return [...prev, { player_id: playerId, hole_number: currentHole, gross }]
    })

    if (gross === null) {
      await supabase
        .from('golf_hole_scores')
        .delete()
        .eq('round_id', round.id)
        .eq('player_id', playerId)
        .eq('hole_number', currentHole)
    } else {
      await supabase
        .from('golf_hole_scores')
        .upsert({ round_id: round.id, player_id: playerId, hole_number: currentHole, gross },
                 { onConflict: 'round_id,player_id,hole_number' })
    }

    setSaving(null)
  }, [round, currentHole])

  // ── Modificar score (stepper)
  const adjustScore = (playerId: string, delta: number) => {
    const current = scores.find(s => s.player_id === playerId && s.hole_number === currentHole)?.gross ?? null
    const hole    = currentHoleData
    if (!hole) return

    let next: number | null
    if (current === null) {
      next = delta > 0 ? hole.par : hole.par - 1
      if (next < 1) next = 1
    } else {
      next = current + delta
      if (next < 1)  return        // no puede ser 0 o negativo
      if (next > 15) return        // límite razonable
    }
    saveScore(playerId, next)
  }

  const clearScore = (playerId: string) => saveScore(playerId, null)

  // ── Progreso: cuántos hoyos tiene score de todos los jugadores
  const holesCompleted = playedHoles.filter(h =>
    players.every(p => scores.some(s => s.player_id === p.id && s.hole_number === h.hole_number && s.gross !== null))
  ).length

  // ─── LOADING ───────────────────────────────────────────────────
  if (loading) return (
    <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: C.muted, fontSize: 14, fontFamily: FONT }}>Cargando...</p>
    </div>
  )

  if (!currentHoleData) return (
    <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: C.muted, fontSize: 14, fontFamily: FONT }}>Sin hoyos configurados para esta cancha</p>
    </div>
  )

  // ─── RENDER ────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
      `}</style>

      <div style={{ background: C.bg, minHeight: '100vh', fontFamily: FONT, color: C.text }}>
        <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

          {/* ── Navbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            <Link href={`/golf/${id}`} style={{ color: C.muted, display: 'flex', alignItems: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M15 18l-6-6 6-6" stroke={C.muted} strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </Link>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text, flex: 1 }}>Scorecar</span>
            {/* Progreso general */}
            <span style={{ fontSize: 12, color: C.muted }}>
              {holesCompleted}/{totalHoles} hoyos
            </span>
          </div>

          {/* ── Header del hoyo actual */}
          <div style={{ padding: '20px 18px 16px', textAlign: 'center', borderBottom: `1px solid ${C.border}`, background: '#080812', flexShrink: 0 }}>
            {/* Número de hoyo grande */}
            <div style={{ fontSize: 56, fontWeight: 700, color: C.text, lineHeight: 1, marginBottom: 6 }}>
              {currentHole}
            </div>
            {/* Par y SI */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 8 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: C.muted, letterSpacing: 1, textTransform: 'uppercase' }}>Par</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>{currentHoleData.par}</div>
              </div>
              <div style={{ width: 1, background: C.border }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: C.muted, letterSpacing: 1, textTransform: 'uppercase' }}>SI</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: C.muted }}>{currentHoleData.stroke_index}</div>
              </div>
            </div>

            {/* Barra de progreso de hoyos */}
            <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginTop: 4 }}>
              {playedHoles.map(h => {
                const isComplete = players.every(p => scores.some(s => s.player_id === p.id && s.hole_number === h.hole_number && s.gross))
                const isCurrent  = h.hole_number === currentHole
                return (
                  <button key={h.hole_number}
                    onClick={() => setCurrentHole(h.hole_number)}
                    style={{ width: isCurrent ? 16 : 8, height: 8, borderRadius: 4, background: isCurrent ? C.primary : isComplete ? '#22c55e' : C.border, border: 'none', cursor: 'pointer', padding: 0, transition: 'width 0.2s' }} />
                )
              })}
            </div>
          </div>

          {/* ── Scores por jugador */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {players.map(p => {
                const hcpData   = playerHcps.find(h => h.playerId === p.id)
                const phcp      = hcpData?.playingHcp ?? 0
                const strokes   = hcpStrokes(phcp, currentHoleData.stroke_index)
                const gross     = scores.find(s => s.player_id === p.id && s.hole_number === currentHole)?.gross ?? null
                const nett      = gross !== null ? gross - strokes : null
                const isSaving  = saving === p.id
                const tee       = TEE_HEX[p.tee_color] ?? '#888'

                // Color del score según vs par neto
                const color = gross !== null ? scoreColor(gross, currentHoleData.par, strokes) : C.muted

                // Totales del jugador hasta el hoyo anterior
                const prevHoles = playedHoles.filter(h => h.hole_number < currentHole)
                let grossAcc = 0; let parAcc = 0; let ptsAcc = 0; let played = 0
                prevHoles.forEach(h => {
                  const s = scores.find(x => x.player_id === p.id && x.hole_number === h.hole_number)
                  if (!s?.gross) return
                  const str = hcpStrokes(phcp, h.stroke_index)
                  grossAcc += s.gross; parAcc += h.par
                  ptsAcc += stablefordPts(s.gross, h.par, str)
                  played++
                })

                return (
                  <div key={p.id} style={{ background: C.card, border: `1px solid ${gross !== null ? C.border : C.border}`, borderRadius: 14, padding: '14px 16px', transition: 'border-color 0.2s' }}>
                    {/* Cabecera del jugador */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 5, background: tee }} />
                      <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{p.display_name}</span>

                      {/* Indicador de strokes recibidos */}
                      {strokes > 0 && (
                        <div style={{ display: 'flex', gap: 3, marginLeft: 4 }}>
                          {Array.from({ length: strokes }).map((_, i) => (
                            <div key={i} style={{ width: 7, height: 7, borderRadius: 4, background: C.primary }} title={`Recibe ${strokes} golpe${strokes > 1 ? 's' : ''} en este hoyo`} />
                          ))}
                        </div>
                      )}

                      {/* Totales acumulados */}
                      {played > 0 && (
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: C.muted }}>
                            {ptsAcc > 0 ? `${ptsAcc}pts` : vsParText(grossAcc - parAcc)}
                          </span>
                          <span style={{ fontSize: 10, color: C.border }}>·</span>
                          <span style={{ fontSize: 10, color: C.muted }}>{played}h</span>
                        </div>
                      )}
                    </div>

                    {/* Stepper de score */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                      {/* Botón - */}
                      <button
                        onClick={() => adjustScore(p.id, -1)}
                        disabled={gross !== null && gross <= 1}
                        style={{ width: 52, height: 52, borderRadius: '12px 0 0 12px', border: `1px solid ${C.border}`, background: '#080812', color: C.muted, fontSize: 24, fontWeight: 300, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.1s' }}>
                        −
                      </button>

                      {/* Score display */}
                      <div style={{ flex: 1, height: 52, border: `1px solid ${gross !== null ? color + '60' : C.border}`, borderLeft: 'none', borderRight: 'none', background: gross !== null ? color + '10' : '#0a0a14', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', transition: 'all 0.15s', position: 'relative' }}>
                        {isSaving && (
                          <div style={{ position: 'absolute', top: 4, right: 6, width: 5, height: 5, borderRadius: 3, background: C.primary, animation: 'pulse 1s infinite' }} />
                        )}
                        {gross !== null ? (
                          <>
                            <span style={{ fontSize: 24, fontWeight: 700, color, lineHeight: 1 }}>{gross}</span>
                            {strokes > 0 && nett !== null && (
                              <span style={{ fontSize: 11, color: C.muted, lineHeight: 1 }}>
                                /{nett}  <span style={{ color: C.border }}>neto</span>
                              </span>
                            )}
                          </>
                        ) : (
                          <span style={{ fontSize: 14, color: C.muted }}>—</span>
                        )}
                      </div>

                      {/* Botón + */}
                      <button
                        onClick={() => adjustScore(p.id, +1)}
                        style={{ width: 52, height: 52, borderRadius: '0 12px 12px 0', border: `1px solid ${C.border}`, background: '#080812', color: C.muted, fontSize: 24, fontWeight: 300, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.1s' }}>
                        +
                      </button>
                    </div>

                    {/* Descripción del resultado */}
                    {gross !== null && (
                      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color, fontWeight: 600 }}>
                          {getResultLabel(gross, currentHoleData.par, strokes)}
                        </span>
                        <button onClick={() => clearScore(p.id)}
                          style={{ fontSize: 11, color: C.muted, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
                          Borrar
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Navegación entre hoyos */}
          <div style={{ padding: '12px 18px 28px', borderTop: `1px solid ${C.border}`, background: C.bg, flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { if (currentIndex > 0) setCurrentHole(playedHoles[currentIndex - 1].hole_number) }}
                disabled={currentIndex === 0}
                style={{ flex: 1, padding: '14px', background: currentIndex === 0 ? '#0a0a14' : C.card, border: `1px solid ${C.border}`, borderRadius: 12, fontFamily: FONT, fontSize: 14, fontWeight: 600, color: currentIndex === 0 ? C.muted : C.text, cursor: currentIndex === 0 ? 'not-allowed' : 'pointer' }}>
                ← Hoyo {currentIndex > 0 ? playedHoles[currentIndex - 1].hole_number : '–'}
              </button>

              <button
                onClick={() => { if (currentIndex < totalHoles - 1) setCurrentHole(playedHoles[currentIndex + 1].hole_number) }}
                disabled={currentIndex >= totalHoles - 1}
                style={{ flex: 1, padding: '14px', background: currentIndex >= totalHoles - 1 ? '#0a0a14' : C.primary, border: 'none', borderRadius: 12, fontFamily: FONT, fontSize: 14, fontWeight: 700, color: currentIndex >= totalHoles - 1 ? C.muted : C.text, cursor: currentIndex >= totalHoles - 1 ? 'not-allowed' : 'pointer' }}>
                Hoyo {currentIndex < totalHoles - 1 ? playedHoles[currentIndex + 1].hole_number : '–'} →
              </button>
            </div>

            {/* Si terminó todos los hoyos */}
            {holesCompleted === totalHoles && (
              <div style={{ marginTop: 10, textAlign: 'center' }}>
                <Link href={`/golf/${id}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', background: '#0a2a1a', border: '1px solid #166534', borderRadius: 12, color: '#4ade80', textDecoration: 'none', fontFamily: FONT, fontSize: 14, fontWeight: 700 }}>
                  ✓ Todos los scores cargados — Ver resultados
                </Link>
              </div>
            )}
          </div>

        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
      `}</style>
    </>
  )
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function vsParText(diff: number): string {
  if (diff === 0)   return 'E'
  if (diff > 0)     return `+${diff}`
  return `${diff}`
}

function getResultLabel(gross: number, par: number, strokes: number): string {
  const net  = gross - strokes
  const diff = net - par
  if (diff <= -3) return 'Albatross 🦅🦅'
  if (diff === -2) return 'Eagle 🦅'
  if (diff === -1) return 'Birdie 🐦'
  if (diff === 0)  return 'Par'
  if (diff === 1)  return 'Bogey'
  if (diff === 2)  return 'Doble bogey'
  if (diff === 3)  return 'Triple bogey'
  return `+${diff}`
}