'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────

type Player    = { id: string; display_name: string; handicap_index: number; tee_color: string }
type Hole      = { hole_number: number; par: number; stroke_index: number }
type Course    = { name: string; par: number | null; rating: number | null; slope: number | null }
type HoleScore = { player_id: string; hole_number: number; gross: number | null }
type Round     = { id: string; round_number: number; status: string; date: string | null }
type Tournament = { id: string; name: string; holes_config: string; handicap_allowance: number; num_rounds: number }
type Format    = { format_type: string; display_name: string; handicap_allowance: number | null }

// ─────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────

const FONT = "'Ubuntu', sans-serif"
const C = {
  bg: '#01050F', card: '#0d0d1a', border: '#1e1736',
  primary: '#055074', text: '#c1c1c6', muted: '#706c7e',
  success: '#4ade80', error: '#f87171',
  eagle: '#fbbf24', birdie: '#22c55e', par: '#c1c1c6',
  bogey: '#f97316', double: '#ef4444',
} as const

const TEE_HEX: Record<string, string> = {
  black: '#222', blue: '#1d4ed8', white: '#d1d5db', yellow: '#d97706', red: '#dc2626',
}

// ─────────────────────────────────────────────
// HELPERS DE CÁLCULO (iguales que en tournament page)
// ─────────────────────────────────────────────

function calcPlayingHcp(hcpIndex: number, course: Course, allowance: number): number {
  const slope  = course.slope  ?? 113
  const rating = course.rating ?? (course.par ?? 72)
  const par    = course.par    ?? 72
  return Math.round(Math.round(hcpIndex * (slope / 113) + (rating - par)) * allowance / 100)
}

function hcpStrokes(playingHcp: number, strokeIndex: number): number {
  if (playingHcp <= 0) return 0
  const base = Math.floor(playingHcp / 18)
  const rem  = playingHcp % 18
  return base + (strokeIndex <= rem ? 1 : 0)
}

function stablefordPts(gross: number, par: number, strokes: number): number {
  return Math.max(0, 2 - (gross - strokes - par))
}

function scoreLabel(gross: number, par: number, strokes: number): { label: string; color: string } {
  const net  = gross - strokes
  const diff = net - par
  if (diff <= -2) return { label: 'Eagle', color: C.eagle }
  if (diff === -1) return { label: 'Birdie', color: C.birdie }
  if (diff === 0)  return { label: 'Par',    color: C.par }
  if (diff === 1)  return { label: 'Bogey',  color: C.bogey }
  return { label: `+${diff}`, color: C.double }
}

// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────

export default function CerrarRondaPage() {
  const { id }   = useParams<{ id: string }>()
  const router   = useRouter()
  const supabase = createClient()

  const [loading,    setLoading]    = useState(true)
  const [closing,    setClosing]    = useState(false)
  const [confirmed,  setConfirmed]  = useState(false)
  const [error,      setError]      = useState('')

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
      const { data: t } = await supabase
        .from('golf_tournaments')
        .select('id,name,holes_config,handicap_allowance,num_rounds,course_id')
        .eq('id', id).single()
      if (!t) { setLoading(false); return }
      setTournament(t)

      const { data: c } = await supabase
        .from('golf_courses').select('name,par,rating,slope').eq('id', t.course_id).single()
      setCourse(c ?? null)

      const [hRes, pRes, fRes, rRes] = await Promise.all([
        supabase.from('golf_holes').select('hole_number,par,stroke_index').eq('course_id', t.course_id).order('hole_number'),
        supabase.from('golf_players').select('id,display_name,handicap_index,tee_color').eq('tournament_id', id).order('sort_order'),
        supabase.from('golf_formats').select('format_type,display_name,handicap_allowance').eq('tournament_id', id),
        supabase.from('golf_rounds').select('id,round_number,status,date').eq('tournament_id', id).order('round_number'),
      ])

      setHoles(hRes.data ?? [])
      setPlayers(pRes.data ?? [])
      setFormats(fRes.data ?? [])

      const activeRound = (rRes.data ?? []).find(r => r.status === 'active') ?? null
      setRound(activeRound)

      if (activeRound) {
        const { data: sc } = await supabase
          .from('golf_hole_scores')
          .select('player_id,hole_number,gross')
          .eq('round_id', activeRound.id)
        setScores(sc ?? [])
      }

      setLoading(false)
    }
    load()
  }, [id])

  // ── Filtrar hoyos según config
  const playedHoles = (() => {
    if (!tournament) return holes
    if (tournament.holes_config === 'front9') return holes.filter(h => h.hole_number <= 9)
    if (tournament.holes_config === 'back9')  return holes.filter(h => h.hole_number >= 10)
    return holes
  })()

  // ── Estadísticas finales por jugador
  type PlayerStats = {
    player: Player; playingHcp: number
    gross: number; nett: number; stableford: number
    vsParGross: number; vsParNett: number
    holesPlayed: number; totalHoles: number
    bestHole: { hole: number; gross: number; label: string } | null
    holeByHole: { hole: Hole; gross: number | null; strokes: number; pts: number }[]
  }

  const playerStats: PlayerStats[] = players.map(p => {
    const allowance = formats[0]?.handicap_allowance ?? tournament?.handicap_allowance ?? 100
    const phcp      = course ? calcPlayingHcp(p.handicap_index, course, allowance) : Math.round(p.handicap_index)

    let gross = 0; let parAcc = 0; let pts = 0; let played = 0
    let bestHole: PlayerStats['bestHole'] = null; let bestDiff = Infinity

    const holeByHole = playedHoles.map(h => {
      const sc  = scores.find(s => s.player_id === p.id && s.hole_number === h.hole_number)
      const str = hcpStrokes(phcp, h.stroke_index)
      if (!sc?.gross) return { hole: h, gross: null, strokes: str, pts: 0 }

      const g = sc.gross
      gross  += g; parAcc += h.par; played++
      const holePts = stablefordPts(g, h.par, str)
      pts   += holePts

      const diff = g - str - h.par
      if (diff < bestDiff) {
        bestDiff = diff
        const { label } = scoreLabel(g, h.par, str)
        bestHole = { hole: h.hole_number, gross: g, label }
      }
      return { hole: h, gross: g, strokes: str, pts: holePts }
    })

    return {
      player: p, playingHcp: phcp,
      gross, nett: gross > 0 ? gross - phcp : 0,
      stableford: pts,
      vsParGross: gross > 0 ? gross - parAcc : 0,
      vsParNett:  gross > 0 ? (gross - phcp) - parAcc : 0,
      holesPlayed: played, totalHoles: playedHoles.length,
      bestHole, holeByHole,
    }
  })

  // ── Completitud de scores
  const totalExpected = players.length * playedHoles.length
  const totalEntered  = scores.filter(s => s.gross !== null).length
  const completePct   = totalExpected > 0 ? Math.round(totalEntered / totalExpected * 100) : 0
  const missingScores = players.flatMap(p =>
    playedHoles
      .filter(h => !scores.some(s => s.player_id === p.id && s.hole_number === h.hole_number && s.gross))
      .map(h => ({ player: p.display_name, hole: h.hole_number }))
  )

  // ── Cerrar ronda
  const handleClose = async () => {
    if (!round || !tournament) return
    setClosing(true); setError('')
    try {
      // 1. Marcar ronda como finalizada
      const { error: rErr } = await supabase
        .from('golf_rounds')
        .update({ status: 'finished' })
        .eq('id', round.id)
      if (rErr) throw rErr

      // 2. Si es la última ronda del torneo → cerrar torneo también
      const { data: allRounds } = await supabase
        .from('golf_rounds')
        .select('id,status')
        .eq('tournament_id', id)

      const allFinished = (allRounds ?? []).every(r => r.id === round.id || r.status === 'finished')
      if (allFinished) {
        await supabase.from('golf_tournaments').update({ status: 'finished' }).eq('id', id)
      }

      router.push(`/golf/${id}`)
    } catch (err: any) {
      setError(err?.message ?? 'Error al cerrar la ronda')
      setClosing(false)
    }
  }

  // ─── LOADING ─────────────────────────────────────────────────

  if (loading) return (
    <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: C.muted, fontFamily: FONT }}>Cargando...</p>
    </div>
  )

  if (!tournament || !round) return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: FONT, padding: '20px 18px' }}>
      <Link href={`/golf/${id}`} style={{ color: C.muted, fontSize: 13 }}>← Volver</Link>
      <p style={{ color: C.text, marginTop: 20 }}>No hay ronda activa para cerrar.</p>
    </div>
  )

  // ─── RENDER ──────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
      `}</style>

      <div style={{ background: C.bg, minHeight: '100vh', fontFamily: FONT, color: C.text, paddingBottom: 40 }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>

          {/* Navbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
            <Link href={`/golf/${id}`} style={{ color: C.muted, display: 'flex', alignItems: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M15 18l-6-6 6-6" stroke={C.muted} strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </Link>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Cerrar ronda {round.round_number}</span>
          </div>

          <div style={{ padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Progreso de scores */}
            <div style={{ background: C.card, border: `1px solid ${completePct === 100 ? '#166534' : C.border}`, borderRadius: 14, padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Completitud de scores</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: completePct === 100 ? C.success : C.muted }}>
                  {completePct}%
                </span>
              </div>
              {/* Barra */}
              <div style={{ height: 8, background: '#111124', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ height: '100%', width: `${completePct}%`, background: completePct === 100 ? C.success : C.primary, borderRadius: 4, transition: 'width 0.3s' }} />
              </div>
              <div style={{ fontSize: 12, color: C.muted }}>{totalEntered} de {totalExpected} scores ingresados</div>

              {/* Scores faltantes */}
              {missingScores.length > 0 && (
                <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.error, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>
                    Faltantes
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {missingScores.slice(0, 12).map((m, i) => (
                      <span key={i} style={{ fontSize: 11, color: C.muted, background: '#1a0505', border: '1px solid #3a1515', borderRadius: 5, padding: '2px 8px' }}>
                        {m.player} H{m.hole}
                      </span>
                    ))}
                    {missingScores.length > 12 && (
                      <span style={{ fontSize: 11, color: C.muted }}>+{missingScores.length - 12} más</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Resumen de resultados */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>
                Resultados finales
              </div>

              {/* Tabla resumen */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 44px 44px 44px 50px', gap: 4, padding: '8px 14px', background: '#111124', borderBottom: `1px solid ${C.border}` }}>
                  {['Jugador', 'Gross', 'Nett', 'Pts', '+/−'].map(h => (
                    <span key={h} style={{ fontSize: 10, fontWeight: 700, color: C.muted, textAlign: h === 'Jugador' ? 'left' : 'center' }}>{h}</span>
                  ))}
                </div>
                {playerStats
                  .sort((a, b) => a.nett - b.nett)
                  .map((s, i) => {
                    const vsN = s.vsParNett
                    const vsColor = vsN < 0 ? C.birdie : vsN === 0 ? C.par : C.bogey
                    return (
                      <div key={s.player.id} style={{ display: 'grid', gridTemplateColumns: '1fr 44px 44px 44px 50px', gap: 4, padding: '11px 14px', borderBottom: i < playerStats.length - 1 ? `1px solid ${C.border}` : 'none', background: i === 0 ? '#0d1a0d' : 'transparent' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <div style={{ width: 7, height: 7, borderRadius: 4, background: TEE_HEX[s.player.tee_color] ?? '#888' }} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: i === 0 ? C.success : C.text }}>{s.player.display_name}</span>
                          </div>
                          <span style={{ fontSize: 10, color: C.muted, paddingLeft: 12 }}>HCP {s.playingHcp}</span>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 600, color: C.muted, textAlign: 'center' }}>{s.gross || '—'}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: i === 0 ? C.success : C.text, textAlign: 'center' }}>{s.nett || '—'}</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: C.text, textAlign: 'center' }}>{s.stableford || '—'}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: s.gross ? vsColor : C.muted, textAlign: 'center' }}>
                          {s.gross ? (vsN === 0 ? 'E' : vsN > 0 ? `+${vsN}` : `${vsN}`) : '—'}
                        </span>
                      </div>
                    )
                  })}
              </div>
            </div>

            {/* Stats destacadas */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>
                Destacados de la ronda
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {playerStats
                  .filter(s => s.bestHole)
                  .sort((a, b) => {
                    // ordenar por mejor resultado (eagle > birdie > par)
                    const order = ['Eagle', 'Birdie', 'Par', 'Bogey']
                    return order.indexOf(a.bestHole!.label) - order.indexOf(b.bestHole!.label)
                  })
                  .slice(0, 5)
                  .map(s => {
                    const { label, color } = scoreLabel(s.bestHole!.gross, playedHoles.find(h => h.hole_number === s.bestHole!.hole)?.par ?? 4, hcpStrokes(s.playingHcp, playedHoles.find(h => h.hole_number === s.bestHole!.hole)?.stroke_index ?? 1))
                    return (
                      <div key={s.player.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px' }}>
                        <div style={{ width: 7, height: 7, borderRadius: 4, background: TEE_HEX[s.player.tee_color] ?? '#888' }} />
                        <span style={{ flex: 1, fontSize: 13, color: C.text }}>{s.player.display_name}</span>
                        <span style={{ fontSize: 12, color: C.muted }}>H{s.bestHole!.hole}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color }}>{label}</span>
                      </div>
                    )
                  })}
              </div>
            </div>

            {/* Confirmar cierre */}
            <div style={{ background: '#0d0d1a', border: `1px solid ${confirmed ? '#166534' : '#2a1a0a'}`, borderRadius: 14, padding: '16px' }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>
                ¿Cerrar la ronda {round.round_number}?
              </p>
              <p style={{ fontSize: 12, color: C.muted, marginBottom: 16, lineHeight: 1.5 }}>
                Al cerrar se bloquea la edición de scores. Los resultados quedan guardados.
                {missingScores.length > 0 && ` Hay ${missingScores.length} score${missingScores.length > 1 ? 's' : ''} sin ingresar.`}
              </p>

              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 14 }}>
                <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: C.primary }} />
                <span style={{ fontSize: 13, color: C.text }}>
                  Confirmé que los scores están OK
                </span>
              </label>

              {error && <p style={{ fontSize: 12, color: C.error, marginBottom: 12 }}>⚠️ {error}</p>}

              <button onClick={handleClose} disabled={!confirmed || closing}
                style={{ width: '100%', padding: '14px', background: confirmed && !closing ? '#0a2a1a' : '#111124', border: `1px solid ${confirmed && !closing ? '#166534' : C.border}`, borderRadius: 11, fontFamily: FONT, fontSize: 14, fontWeight: 700, color: confirmed && !closing ? C.success : C.muted, cursor: confirmed && !closing ? 'pointer' : 'not-allowed' }}>
                {closing ? 'Cerrando...' : '🏁 Cerrar ronda y ver resultados finales'}
              </button>
            </div>

          </div>
        </div>
      </div>
    </>
  )
}