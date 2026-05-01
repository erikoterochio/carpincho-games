'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────

type Player    = { id: string; display_name: string; handicap_index: number; tee_color: string }
type Hole      = { hole_number: number; par: number; stroke_index: number }
type Course    = {
  id: string; name: string; city: string | null; par: number | null
  rating: number | null; slope: number | null
  rating_black: number | null; slope_black: number | null
  rating_blue: number | null; slope_blue: number | null
  rating_white: number | null; slope_white: number | null
  rating_yellow: number | null; slope_yellow: number | null
  rating_red: number | null; slope_red: number | null
}
type Tournament = { id: string; holes_config: string; handicap_allowance: number; name: string; course_id: string }
type Round     = { id: string; status: string }
type HoleScore = { player_id: string; hole_number: number; gross: number | null }
type Format    = { format_type: string; handicap_allowance: number | null }

// ─────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────

const FONT = "'Ubuntu', sans-serif"
const C = {
  bg: '#f2faf5', card: '#ffffff', border: '#bdd5c5',
  primary: '#166534', text: '#1a3a28', muted: '#4d7a5e',
  eagle: '#92400e', birdie: '#15803d', par: '#374151',
  bogey: '#c2410c', double: '#b91c1c',
} as const

const TEE_HEX: Record<string, string> = {
  black: '#222', blue: '#1d4ed8', white: '#9ca3af', yellow: '#d97706', red: '#dc2626',
}

// ─────────────────────────────────────────────
// FUNCIONES DE CÁLCULO
// ─────────────────────────────────────────────

function getCourseRating(course: Course, teeColor: string): number {
  const map: Record<string, number | null> = {
    black: course.rating_black, blue: course.rating_blue, white: course.rating_white,
    yellow: course.rating_yellow, red: course.rating_red,
  }
  return map[teeColor] ?? course.rating ?? (course.par ?? 72)
}

function getCourseSlope(course: Course, teeColor: string): number {
  const map: Record<string, number | null> = {
    black: course.slope_black, blue: course.slope_blue, white: course.slope_white,
    yellow: course.slope_yellow, red: course.slope_red,
  }
  return map[teeColor] ?? course.slope ?? 113
}

function calcPlayingHcp(hcpIndex: number, course: Course, teeColor: string, allowance: number): number {
  const slope  = getCourseSlope(course, teeColor)
  const rating = getCourseRating(course, teeColor)
  const par    = course.par ?? 72
  const courseHcp = Math.round(hcpIndex * (slope / 113) + (rating - par))
  return Math.round(courseHcp * allowance / 100)
}

function hcpStrokes(playingHcp: number, strokeIndex: number): number {
  if (playingHcp <= 0) return 0
  const base = Math.floor(Math.abs(playingHcp) / 18)
  const rem  = Math.abs(playingHcp) % 18
  return base + (strokeIndex <= rem ? 1 : 0)
}

function stablefordPts(gross: number, par: number, strokes: number): number {
  return Math.max(0, 2 - (gross - strokes - par))
}

function scoreColor(gross: number, par: number, strokes: number): string {
  const diff = (gross - strokes) - par
  if (diff <= -2) return C.eagle
  if (diff === -1) return C.birdie
  if (diff === 0)  return C.par
  if (diff === 1)  return C.bogey
  return C.double
}

function vsParText(diff: number): string {
  if (diff === 0) return 'E'
  return diff > 0 ? `+${diff}` : `${diff}`
}

function getResultLabel(gross: number, par: number, strokes: number): string {
  const diff = (gross - strokes) - par
  if (diff <= -3) return 'Albatross 🦤'
  if (diff === -2) return 'Eagle 🦅'
  if (diff === -1) return 'Birdie 🐦'
  if (diff === 0)  return 'Par'
  if (diff === 1)  return 'Bogey'
  if (diff === 2)  return 'Doble bogey'
  if (diff === 3)  return 'Triple bogey'
  return `+${diff}`
}

// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────

export default function ScorearPage() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()

  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState<string | null>(null)
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [course,     setCourse]     = useState<Course | null>(null)
  const [holes,      setHoles]      = useState<Hole[]>([])
  const [players,    setPlayers]    = useState<Player[]>([])
  const [round,      setRound]      = useState<Round | null>(null)
  const [scores,     setScores]     = useState<HoleScore[]>([])
  const [formats,    setFormats]    = useState<Format[]>([])
  const [editCell,   setEditCell]   = useState<{ playerId: string; holeNumber: number } | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: t } = await supabase
        .from('golf_tournaments')
        .select('id,name,holes_config,handicap_allowance,course_id')
        .eq('id', id).single()
      if (!t) { setLoading(false); return }
      setTournament(t)

      const { data: c } = await supabase
        .from('golf_courses')
        .select('id,name,city,par,rating,slope,rating_black,slope_black,rating_blue,slope_blue,rating_white,slope_white,rating_yellow,slope_yellow,rating_red,slope_red')
        .eq('id', t.course_id).single()
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
          .from('golf_hole_scores').select('player_id,hole_number,gross').eq('round_id', activeRound.id)
        setScores(sc ?? [])
      }
      setLoading(false)
    }
    load()
  }, [id])

  // ── Hoyos según configuración
  const playedHoles = (() => {
    if (!tournament) return holes
    if (tournament.holes_config === 'front9') return holes.filter(h => h.hole_number <= 9)
    if (tournament.holes_config === 'back9')  return holes.filter(h => h.hole_number >= 10)
    return holes
  })()

  const front9 = playedHoles.filter(h => h.hole_number <= 9)
  const back9  = playedHoles.filter(h => h.hole_number >= 10)

  const allowance = (formats[0]?.handicap_allowance ?? tournament?.handicap_allowance) ?? 100

  const getPlayingHcp = useCallback((player: Player): number => {
    if (!course) return Math.round(player.handicap_index)
    return calcPlayingHcp(player.handicap_index, course, player.tee_color, allowance)
  }, [course, allowance])

  const getScore = (playerId: string, holeNumber: number): number | null =>
    scores.find(s => s.player_id === playerId && s.hole_number === holeNumber)?.gross ?? null

  // ── Guardar score (upsert)
  const saveScore = useCallback(async (playerId: string, holeNumber: number, gross: number | null) => {
    if (!round) return
    setSaving(`${playerId}-${holeNumber}`)

    setScores(prev => {
      const idx = prev.findIndex(s => s.player_id === playerId && s.hole_number === holeNumber)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], gross }
        return next
      }
      return [...prev, { player_id: playerId, hole_number: holeNumber, gross }]
    })

    if (gross === null) {
      await supabase.from('golf_hole_scores').delete()
        .eq('round_id', round.id).eq('player_id', playerId).eq('hole_number', holeNumber)
    } else {
      await supabase.from('golf_hole_scores').upsert(
        { round_id: round.id, player_id: playerId, hole_number: holeNumber, gross },
        { onConflict: 'round_id,player_id,hole_number' }
      )
    }
    setSaving(null)
  }, [round])

  // ── Valores derivados del cell en edición
  const editHole    = editCell ? playedHoles.find(h => h.hole_number === editCell.holeNumber) ?? null : null
  const editPlayer  = editCell ? players.find(p => p.id === editCell.playerId) ?? null : null
  const editPhcp    = editPlayer ? getPlayingHcp(editPlayer) : 0
  const editStrokes = editCell && editHole ? hcpStrokes(editPhcp, editHole.stroke_index) : 0
  const editGross   = editCell ? getScore(editCell.playerId, editCell.holeNumber) : null

  const adjustEditScore = (delta: number) => {
    if (!editCell || !editHole) return
    const current = getScore(editCell.playerId, editCell.holeNumber)
    let next: number
    if (current === null) {
      next = Math.max(1, delta > 0 ? editHole.par : editHole.par - 1)
    } else {
      next = current + delta
      if (next < 1 || next > 15) return
    }
    saveScore(editCell.playerId, editCell.holeNumber, next)
  }

  // ── Totales por jugador
  const playerTotals = useCallback((player: Player) => {
    const phcp = getPlayingHcp(player)
    let gross = 0, par = 0, netto = 0, pts = 0, played = 0, lastHole = 0
    playedHoles.forEach(h => {
      const s = getScore(player.id, h.hole_number)
      if (s == null) return
      const str = hcpStrokes(phcp, h.stroke_index)
      gross += s; par += h.par
      netto += s - str
      pts += stablefordPts(s, h.par, str)
      played++; lastHole = h.hole_number
    })
    return { gross, par, netto, pts, played, lastHole, vsPar: gross - par }
  }, [playedHoles, scores, getPlayingHcp])

  const subtotal = (playerId: string, holeNumbers: number[]): number | null => {
    let total = 0, played = 0
    holeNumbers.forEach(hn => {
      const s = getScore(playerId, hn)
      if (s == null) return
      total += s; played++
    })
    return played > 0 ? total : null
  }

  const holesCompleted = playedHoles.filter(h =>
    players.every(p => getScore(p.id, h.hole_number) !== null)
  ).length

  const isRoundComplete = players.length > 0 && holesCompleted === playedHoles.length

  // ─── LOADING ────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: C.muted, fontSize: 14, fontFamily: FONT }}>Cargando...</p>
    </div>
  )

  if (playedHoles.length === 0) return (
    <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: C.muted, fontSize: 14, fontFamily: FONT }}>Sin hoyos configurados para esta cancha</p>
    </div>
  )

  const colW = { hole: 38, par: 30, hcp: 30, player: 56 }
  const tableW = colW.hole + colW.par + colW.hcp + players.length * colW.player

  // ─── RENDER ────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        td, th { padding: 0; }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
      `}</style>

      <div style={{ background: C.bg, minHeight: '100vh', fontFamily: FONT, color: C.text }}>
        <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

          {/* ── Navbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${C.border}`, background: C.card, flexShrink: 0 }}>
            <Link href={`/golf/${id}`} style={{ color: C.muted, display: 'flex', alignItems: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M15 18l-6-6 6-6" stroke={C.muted} strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </Link>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text, flex: 1 }}>Scorecard</span>
            <span style={{ fontSize: 12, color: C.muted }}>{holesCompleted}/{playedHoles.length} hoyos</span>
          </div>

          {/* ── Leaderboard strip (medal) */}
          <div style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: '10px 0 10px 18px', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingRight: 18 }}>
              {players.map(p => {
                const tots = playerTotals(p)
                const phcp = getPlayingHcp(p)
                const tee  = TEE_HEX[p.tee_color] ?? '#888'
                return (
                  <div key={p.id} style={{ flexShrink: 0, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 10px', minWidth: 76, textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 2 }}>
                      <div style={{ width: 7, height: 7, borderRadius: 4, background: tee }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 60 }}>
                        {p.display_name.split(' ')[0]}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>Hcp {phcp}</div>
                    {tots.played > 0 ? (
                      <>
                        <div style={{ fontSize: 22, fontWeight: 700, color: C.text, lineHeight: 1 }}>{tots.gross}</div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: tots.vsPar > 0 ? C.bogey : tots.vsPar < 0 ? C.birdie : C.muted }}>
                          {vsParText(tots.vsPar)}
                        </div>
                        <div style={{ fontSize: 10, color: C.muted }}>h.{tots.lastHole}</div>
                        {isRoundComplete && (
                          <div style={{ fontSize: 10, color: C.muted, marginTop: 2, borderTop: `1px solid ${C.border}`, paddingTop: 2 }}>
                            neto {tots.netto}
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ fontSize: 18, color: C.border, lineHeight: 2 }}>—</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Scorecard Table */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: tableW }}>

                {/* Cabecera */}
                <thead>
                  <tr style={{ background: C.primary }}>
                    <th style={{
                      position: 'sticky', left: 0, zIndex: 2, background: C.primary,
                      width: colW.hole, padding: '9px 4px', fontSize: 12, color: '#fff',
                      textAlign: 'center', fontWeight: 700,
                    }}>H</th>
                    <th style={{ width: colW.par, padding: '9px 4px', fontSize: 12, color: 'rgba(255,255,255,0.8)', textAlign: 'center', fontWeight: 500 }}>Par</th>
                    <th style={{ width: colW.hcp, padding: '9px 4px', fontSize: 11, color: 'rgba(255,255,255,0.45)', textAlign: 'center', fontWeight: 400 }}>Hcp</th>
                    {players.map(p => {
                      const phcp = getPlayingHcp(p)
                      return (
                        <th key={p.id} style={{ width: colW.player, padding: '7px 2px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                            <div style={{ width: 9, height: 9, borderRadius: 5, background: TEE_HEX[p.tee_color] ?? '#888', border: '1.5px solid rgba(255,255,255,0.4)' }} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: colW.player - 6 }}>
                              {p.display_name.split(' ')[0]}
                            </span>
                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)' }}>H: {phcp}</span>
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>

                <tbody>
                  {/* Front 9 */}
                  {front9.map((h, i) => (
                    <HoleRow key={h.hole_number} hole={h} players={players} scores={scores}
                      getPlayingHcp={getPlayingHcp} onTap={pid => setEditCell({ playerId: pid, holeNumber: h.hole_number })}
                      even={i % 2 === 0} saving={saving} colW={colW} />
                  ))}

                  {front9.length > 0 && (
                    <SubtotalRow label="OUT" players={players} subtotal={subtotal}
                      holeNumbers={front9.map(h => h.hole_number)}
                      parTotal={front9.reduce((a, h) => a + h.par, 0)} colW={colW} />
                  )}

                  {/* Back 9 */}
                  {back9.map((h, i) => (
                    <HoleRow key={h.hole_number} hole={h} players={players} scores={scores}
                      getPlayingHcp={getPlayingHcp} onTap={pid => setEditCell({ playerId: pid, holeNumber: h.hole_number })}
                      even={i % 2 === 0} saving={saving} colW={colW} />
                  ))}

                  {back9.length > 0 && (
                    <SubtotalRow label="IN" players={players} subtotal={subtotal}
                      holeNumbers={back9.map(h => h.hole_number)}
                      parTotal={back9.reduce((a, h) => a + h.par, 0)} colW={colW} />
                  )}

                  {/* TOTAL (solo si hay front + back) */}
                  {front9.length > 0 && back9.length > 0 && (
                    <tr style={{ background: C.primary }}>
                      <td colSpan={3} style={{
                        position: 'sticky', left: 0, zIndex: 1, background: C.primary,
                        padding: '8px 10px', fontSize: 12, fontWeight: 700, color: '#fff',
                      }}>TOT</td>
                      {players.map(p => {
                        const tots = playerTotals(p)
                        return (
                          <td key={p.id} style={{ textAlign: 'center', padding: '6px 2px' }}>
                            {tots.played > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{tots.gross}</span>
                                <span style={{ fontSize: 9, color: tots.vsPar > 0 ? '#fca5a5' : tots.vsPar < 0 ? '#86efac' : 'rgba(255,255,255,0.5)' }}>
                                  {vsParText(tots.vsPar)}
                                </span>
                              </div>
                            ) : (
                              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>—</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {isRoundComplete && (
              <div style={{ padding: '16px 18px', textAlign: 'center' }}>
                <Link href={`/golf/${id}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 12, color: '#15803d', textDecoration: 'none', fontFamily: FONT, fontSize: 14, fontWeight: 700 }}>
                  ✓ Todos los scores cargados — Ver resultados
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom sheet: editar score */}
      {editCell && editHole && editPlayer && (
        <>
          <div onClick={() => setEditCell(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(11,38,89,0.45)', zIndex: 10 }} />
          <div style={{
            position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
            width: '100%', maxWidth: 480, background: C.card,
            borderRadius: '20px 20px 0 0', padding: '16px 24px 40px',
            zIndex: 11, boxShadow: '0 -6px 32px rgba(0,0,0,0.15)',
          }}>
            {/* Handle */}
            <div style={{ width: 36, height: 4, borderRadius: 2, background: C.border, margin: '0 auto 16px' }} />

            {/* Info del hoyo y jugador */}
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>
                Hoyo {editCell.holeNumber} · Par {editHole.par} · Hcp {editHole.stroke_index}
                {editStrokes > 0 && ` · +${editStrokes} golpe${editStrokes > 1 ? 's' : ''}`}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 5, background: TEE_HEX[editPlayer.tee_color] ?? '#888' }} />
                <span style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{editPlayer.display_name}</span>
              </div>
            </div>

            {/* Stepper */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'center', marginBottom: 14 }}>
              <button onClick={() => adjustEditScore(-1)}
                style={{ width: 60, height: 60, borderRadius: 14, border: `1.5px solid ${C.border}`, background: '#e0f5e8', color: C.text, fontSize: 30, fontWeight: 300, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
                −
              </button>

              <div style={{
                width: 84, height: 84, borderRadius: 18,
                border: `2px solid ${editGross !== null ? scoreColor(editGross, editHole.par, editStrokes) + '80' : C.border}`,
                background: editGross !== null ? scoreColor(editGross, editHole.par, editStrokes) + '12' : C.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 40, fontWeight: 700, color: editGross !== null ? scoreColor(editGross, editHole.par, editStrokes) : C.border, lineHeight: 1 }}>
                  {editGross ?? '·'}
                </span>
              </div>

              <button onClick={() => adjustEditScore(+1)}
                style={{ width: 60, height: 60, borderRadius: 14, border: `1.5px solid ${C.border}`, background: '#e0f5e8', color: C.text, fontSize: 30, fontWeight: 300, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
                +
              </button>
            </div>

            {/* Resultado */}
            {editGross !== null && (
              <div style={{ textAlign: 'center', marginBottom: 16, minHeight: 22 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: scoreColor(editGross, editHole.par, editStrokes) }}>
                  {getResultLabel(editGross, editHole.par, editStrokes)}
                </span>
                {editStrokes > 0 && (
                  <span style={{ fontSize: 12, color: C.muted }}> · neto {editGross - editStrokes}</span>
                )}
              </div>
            )}
            {editGross === null && <div style={{ minHeight: 22, marginBottom: 16 }} />}

            {/* Acciones */}
            <div style={{ display: 'flex', gap: 10 }}>
              {editGross !== null && (
                <button onClick={() => { saveScore(editCell.playerId, editCell.holeNumber, null); setEditCell(null) }}
                  style={{ flex: 1, padding: '13px', background: '#e0f5e8', border: `1px solid ${C.border}`, borderRadius: 12, fontSize: 14, color: C.muted, cursor: 'pointer', fontFamily: FONT }}>
                  Borrar
                </button>
              )}
              <button onClick={() => setEditCell(null)}
                style={{ flex: 2, padding: '13px', background: C.primary, border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: FONT }}>
                Listo
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}

// ─────────────────────────────────────────────
// SUBCOMPONENTES
// ─────────────────────────────────────────────

type ColW = { hole: number; par: number; hcp: number; player: number }

function HoleRow({ hole, players, scores, getPlayingHcp, onTap, even, saving, colW }: {
  hole: Hole; players: Player[]; scores: HoleScore[]
  getPlayingHcp: (p: Player) => number; onTap: (pid: string) => void
  even: boolean; saving: string | null; colW: ColW
}) {
  const rowBg = even ? C.card : '#f0faf3'
  return (
    <tr style={{ background: rowBg }}>
      <td style={{
        position: 'sticky', left: 0, zIndex: 1, background: rowBg,
        width: colW.hole, textAlign: 'center',
        borderRight: `1px solid ${C.border}`,
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, padding: '11px 4px' }}>
          {hole.hole_number}
        </div>
      </td>
      <td style={{ width: colW.par, textAlign: 'center', fontSize: 14, color: C.muted, borderRight: `1px solid ${C.border}` }}>
        {hole.par}
      </td>
      <td style={{ width: colW.hcp, textAlign: 'center', fontSize: 11, color: C.border, borderRight: `1px solid ${C.border}` }}>
        {hole.stroke_index}
      </td>
      {players.map(p => {
        const phcp    = getPlayingHcp(p)
        const strokes = hcpStrokes(phcp, hole.stroke_index)
        const gross   = scores.find(s => s.player_id === p.id && s.hole_number === hole.hole_number)?.gross ?? null
        const color   = gross !== null ? scoreColor(gross, hole.par, strokes) : null
        const isSaving = saving === `${p.id}-${hole.hole_number}`

        return (
          <td key={p.id} onClick={() => onTap(p.id)}
            style={{ width: colW.player, textAlign: 'center', padding: '5px 4px', cursor: 'pointer' }}>
            <div style={{
              width: 46, height: 42, borderRadius: 9, margin: '0 auto',
              background: gross !== null ? color! + '1c' : 'transparent',
              border: `1.5px solid ${gross !== null ? color! + '70' : C.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative', transition: 'all 0.1s',
            }}>
              {isSaving && (
                <div style={{ position: 'absolute', top: 3, right: 3, width: 5, height: 5, borderRadius: 3, background: C.primary, animation: 'pulse 1s infinite' }} />
              )}
              {strokes > 0 && !isSaving && (
                <div style={{ position: 'absolute', top: 3, right: 3, width: 5, height: 5, borderRadius: 3, background: C.primary + '50' }} />
              )}
              <span style={{ fontSize: 18, fontWeight: 700, color: gross !== null ? color! : C.border, lineHeight: 1 }}>
                {gross ?? '·'}
              </span>
            </div>
          </td>
        )
      })}
    </tr>
  )
}

function SubtotalRow({ label, players, subtotal, holeNumbers, parTotal, colW }: {
  label: string; players: Player[]
  subtotal: (pid: string, hns: number[]) => number | null
  holeNumbers: number[]; parTotal: number; colW: ColW
}) {
  return (
    <tr style={{ background: '#dcfce7' }}>
      <td style={{
        position: 'sticky', left: 0, zIndex: 1, background: '#dcfce7',
        width: colW.hole, padding: '7px 8px', fontSize: 11, fontWeight: 700, color: C.primary,
        borderTop: `1.5px solid ${C.border}`, borderBottom: `1.5px solid ${C.border}`,
      }}>{label}</td>
      <td style={{ width: colW.par, textAlign: 'center', fontSize: 11, fontWeight: 600, color: C.muted, borderTop: `1.5px solid ${C.border}`, borderBottom: `1.5px solid ${C.border}` }}>
        {parTotal}
      </td>
      <td style={{ width: colW.hcp, borderTop: `1.5px solid ${C.border}`, borderBottom: `1.5px solid ${C.border}` }} />
      {players.map(p => {
        const sub    = subtotal(p.id, holeNumbers)
        const vsPar  = sub != null ? sub - parTotal : null
        return (
          <td key={p.id} style={{ width: colW.player, textAlign: 'center', padding: '4px 2px', borderTop: `1.5px solid ${C.border}`, borderBottom: `1.5px solid ${C.border}` }}>
            {sub != null ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{sub}</span>
                {vsPar != null && (
                  <span style={{ fontSize: 9, color: vsPar > 0 ? C.bogey : vsPar < 0 ? C.birdie : C.muted }}>
                    {vsParText(vsPar)}
                  </span>
                )}
              </div>
            ) : (
              <span style={{ fontSize: 12, color: C.border }}>—</span>
            )}
          </td>
        )
      })}
    </tr>
  )
}
