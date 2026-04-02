'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────

type Contest = {
  id: string; contest_type: 'long_drive' | 'best_approach'
  hole_number: number; display_name: string
}

type Player = { id: string; display_name: string; tee_color: string }

type Entry = {
  id?: string; contest_id: string; player_id: string; round_id: string
  tee_color: string; tee_distance_m: number; distance_to_pin_m: number
  qualifies: boolean; disqualify_reason: string | null
}

type TeeInfo = { key: string; label: string; hex: string }

type HoleDistance = {
  hole_number: number
  distance_black: number | null; distance_blue: number | null
  distance_white: number | null; distance_yellow: number | null; distance_red: number | null
}

// ─────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────

const FONT = "'Ubuntu', sans-serif"
const C = {
  bg: '#01050F', card: '#0d0d1a', border: '#1e1736',
  primary: '#055074', text: '#c1c1c6', muted: '#706c7e',
  success: '#4ade80', error: '#f87171',
} as const

const TEES: TeeInfo[] = [
  { key: 'black',  label: 'Negra',    hex: '#333' },
  { key: 'blue',   label: 'Azul',     hex: '#1d4ed8' },
  { key: 'white',  label: 'Blanca',   hex: '#d1d5db' },
  { key: 'yellow', label: 'Amarilla', hex: '#d97706' },
  { key: 'red',    label: 'Roja',     hex: '#dc2626' },
]

const TEE_HEX: Record<string, string> = Object.fromEntries(TEES.map(t => [t.key, t.hex]))

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  background: '#080812', border: `1px solid #1e1736`,
  borderRadius: 9, color: '#c1c1c6', fontSize: 14, fontFamily: FONT,
}

// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────

export default function ConcursosPage() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()

  const [loading,   setLoading]   = useState(true)
  const [contests,  setContests]  = useState<Contest[]>([])
  const [players,   setPlayers]   = useState<Player[]>([])
  const [entries,   setEntries]   = useState<Entry[]>([])
  const [roundId,   setRoundId]   = useState<string | null>(null)
  const [holeDistances, setHoleDistances] = useState<HoleDistance[]>([])
  const [activeContest, setActiveContest] = useState<string | null>(null)
  const [saving,    setSaving]    = useState<string | null>(null)

  // ── Carga inicial
  useEffect(() => {
    const load = async () => {
      // Torneo → course_id
      const { data: t } = await supabase
        .from('golf_tournaments')
        .select('id, course_id')
        .eq('id', id).single()
      if (!t) { setLoading(false); return }

      const [cRes, pRes, rRes, hRes] = await Promise.all([
        supabase.from('golf_contests').select('id,contest_type,hole_number,display_name').eq('tournament_id', id).order('hole_number'),
        supabase.from('golf_players').select('id,display_name,tee_color').eq('tournament_id', id).order('sort_order'),
        supabase.from('golf_rounds').select('id,status').eq('tournament_id', id).order('round_number'),
        supabase.from('golf_holes').select('hole_number,distance_black,distance_blue,distance_white,distance_yellow,distance_red').eq('course_id', t.course_id).order('hole_number'),
      ])

      const contestList = cRes.data ?? []
      const roundActive = (rRes.data ?? []).find(r => r.status === 'active') ?? (rRes.data ?? [])[0] ?? null

      setContests(contestList)
      setPlayers(pRes.data ?? [])
      setRoundId(roundActive?.id ?? null)
      setHoleDistances(hRes.data ?? [])

      if (roundActive && contestList.length > 0) {
        const { data: eData } = await supabase
          .from('golf_contest_entries')
          .select('*')
          .in('contest_id', contestList.map((c: Contest) => c.id))
          .eq('round_id', roundActive.id)
        setEntries(eData ?? [])
        setActiveContest(contestList[0]?.id ?? null)
      }

      setLoading(false)
    }
    load()
  }, [id])

  // ── Guardar / actualizar entrada
  const saveEntry = useCallback(async (contestId: string, playerId: string, patch: Partial<Entry>) => {
    if (!roundId) return
    setSaving(playerId)

    const existing = entries.find(e => e.contest_id === contestId && e.player_id === playerId)
    const base: Entry = existing ?? {
      contest_id: contestId, player_id: playerId, round_id: roundId,
      tee_color: players.find(p => p.id === playerId)?.tee_color ?? 'white',
      tee_distance_m: 0, distance_to_pin_m: 0,
      qualifies: true, disqualify_reason: null,
    }
    const updated = { ...base, ...patch }

    // Optimistic
    setEntries(prev => {
      const idx = prev.findIndex(e => e.contest_id === contestId && e.player_id === playerId)
      if (idx >= 0) { const next = [...prev]; next[idx] = updated; return next }
      return [...prev, updated]
    })

    await supabase.from('golf_contest_entries').upsert(
      { ...updated },
      { onConflict: 'contest_id,player_id,round_id' }
    )
    setSaving(null)
  }, [roundId, entries, players])

  // ── Obtener distancia de la cancha según tee + hoyo
  const getHoleDistance = (holeNum: number, teeColor: string): number | null => {
    const h = holeDistances.find(h => h.hole_number === holeNum)
    if (!h) return null
    const key = `distance_${teeColor}` as keyof HoleDistance
    return (h[key] as number | null) ?? null
  }

  // ─── RANKING ─────────────────────────────────────────────────

  const buildRanking = (contest: Contest): (Entry & { player: Player; drove?: number; rank: number })[] => {
    const cEntries = entries.filter(e => e.contest_id === contest.id && e.qualifies)
    const isLD = contest.contest_type === 'long_drive'

    const sorted = cEntries
      .map(e => {
        const player = players.find(p => p.id === e.player_id)!
        const drove  = isLD ? e.tee_distance_m - e.distance_to_pin_m : undefined
        return { ...e, player, drove }
      })
      .filter(e => e.player)
      .sort((a, b) => isLD
        ? (b.drove ?? 0) - (a.drove ?? 0)
        : a.distance_to_pin_m - b.distance_to_pin_m
      )

    let rank = 1
    return sorted.map((r, i) => {
      if (i > 0) {
        const prev = sorted[i - 1]
        const same = isLD
          ? (r.drove ?? 0) === (prev.drove ?? 0)
          : r.distance_to_pin_m === prev.distance_to_pin_m
        if (!same) rank = i + 1
      }
      return { ...r, rank }
    })
  }

  // ─── LOADING ─────────────────────────────────────────────────

  if (loading) return (
    <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: C.muted, fontFamily: FONT }}>Cargando...</p>
    </div>
  )

  if (contests.length === 0) return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: FONT }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 18px' }}>
        <Link href={`/golf/${id}`} style={{ color: C.muted, fontSize: 13 }}>← Volver</Link>
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🏌️</div>
          <p style={{ color: C.text, fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Sin concursos</p>
          <p style={{ color: C.muted, fontSize: 13 }}>Esta partida no tiene concursos configurados.</p>
        </div>
      </div>
    </div>
  )

  const currentContest = contests.find(c => c.id === activeContest)

  // ─── RENDER ──────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input::placeholder { color: #4a4a55; }
        input:focus { outline: none; }
        input[type=number]::-webkit-inner-spin-button { opacity: 0.4; }
      `}</style>

      <div style={{ background: C.bg, minHeight: '100vh', fontFamily: FONT, color: C.text, paddingBottom: 40 }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>

          {/* Navbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${C.border}`, sticky: 'top' } as any}>
            <Link href={`/golf/${id}`} style={{ color: C.muted, display: 'flex', alignItems: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M15 18l-6-6 6-6" stroke={C.muted} strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </Link>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Concursos</span>
          </div>

          {/* Tabs de concurso */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}` }}>
            {contests.map(c => {
              const isLD   = c.contest_type === 'long_drive'
              const active = activeContest === c.id
              return (
                <button key={c.id} onClick={() => setActiveContest(c.id)}
                  style={{ flex: 1, padding: '12px 10px', background: 'none', border: 'none', borderBottom: `2px solid ${active ? C.primary : 'transparent'}`, cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: active ? 700 : 500, color: active ? C.text : C.muted, marginBottom: -1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <span style={{ fontSize: 20 }}>{isLD ? '🏌️' : '📍'}</span>
                  <span>{c.display_name}</span>
                  <span style={{ fontSize: 10, color: C.muted }}>Hoyo {c.hole_number}</span>
                </button>
              )
            })}
          </div>

          {currentContest && (
            <div style={{ padding: '18px 18px 0' }}>
              {/* Descripción */}
              <ContestInfo contest={currentContest} />

              {/* Ranking */}
              <RankingSection contest={currentContest} ranking={buildRanking(currentContest)} />

              {/* Entradas por jugador */}
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>
                  Cargar resultados
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {players.map(p => (
                    <PlayerEntryCard
                      key={p.id}
                      player={p}
                      contest={currentContest}
                      entry={entries.find(e => e.contest_id === currentContest.id && e.player_id === p.id) ?? null}
                      holeDistance={getHoleDistance(currentContest.hole_number, p.tee_color)}
                      saving={saving === p.id}
                      onSave={(patch) => saveEntry(currentContest.id, p.id, patch)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────
// COMPONENTE: info del concurso
// ─────────────────────────────────────────────

function ContestInfo({ contest }: { contest: Contest }) {
  const isLD = contest.contest_type === 'long_drive'
  return (
    <div style={{ background: '#0a0a14', border: `1px solid #1e1736`, borderRadius: 11, padding: '12px 14px', marginBottom: 18 }}>
      <p style={{ fontSize: 13, color: '#c1c1c6', lineHeight: 1.6, margin: 0 }}>
        {isLD
          ? <>🏌️ <strong>Long Drive — Hoyo {contest.hole_number}:</strong> Ingresá la distancia de tu salida al hoyo y dónde quedó tu pelota. La app calcula cuánto recorriste. Solo aplica si entró al fairway.</>
          : <>📍 <strong>Más cerca — Hoyo {contest.hole_number}:</strong> Ingresá cuántos metros quedó tu pelota del hoyo. Gana el que quede más cerca. Solo aplica si entró al green.</>
        }
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────
// COMPONENTE: ranking
// ─────────────────────────────────────────────

function RankingSection({ contest, ranking }: { contest: Contest; ranking: any[] }) {
  const isLD = contest.contest_type === 'long_drive'
  if (ranking.length === 0) return (
    <div style={{ textAlign: 'center', padding: '20px 0', color: '#706c7e', fontSize: 13 }}>
      Sin resultados válidos aún
    </div>
  )

  return (
    <div style={{ background: '#0d0d1a', border: '1px solid #1e1736', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '8px 14px', background: '#111124', borderBottom: '1px solid #1e1736' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#706c7e', letterSpacing: 1, textTransform: 'uppercase' }}>
          Ranking
        </span>
      </div>
      {ranking.map((r, i) => (
        <div key={r.player_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderBottom: i < ranking.length - 1 ? '1px solid #1e1736' : 'none', background: i === 0 ? '#0d1a0d' : 'transparent' }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: i === 0 ? '#4ade80' : '#706c7e', width: 24, textAlign: 'center' }}>
            {r.rank}
          </span>
          <div style={{ width: 8, height: 8, borderRadius: 4, background: TEE_HEX[r.player.tee_color] ?? '#888', flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#c1c1c6' }}>{r.player.display_name}</span>
          <div style={{ textAlign: 'right' }}>
            {isLD ? (
              <>
                <span style={{ fontSize: 16, fontWeight: 700, color: i === 0 ? '#4ade80' : '#c1c1c6' }}>
                  {r.drove}m
                </span>
                <span style={{ fontSize: 10, color: '#706c7e', display: 'block' }}>recorrido</span>
              </>
            ) : (
              <>
                <span style={{ fontSize: 16, fontWeight: 700, color: i === 0 ? '#4ade80' : '#c1c1c6' }}>
                  {r.distance_to_pin_m}m
                </span>
                <span style={{ fontSize: 10, color: '#706c7e', display: 'block' }}>del hoyo</span>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────
// COMPONENTE: card de entrada por jugador
// ─────────────────────────────────────────────

function PlayerEntryCard({ player, contest, entry, holeDistance, saving, onSave }: {
  player: Player; contest: Contest; entry: Entry | null
  holeDistance: number | null; saving: boolean
  onSave: (patch: Partial<Entry>) => void
}) {
  const isLD = contest.contest_type === 'long_drive'

  // Estado local del form (se sincroniza desde entry)
  const [teeColor,    setTeeColor]    = useState(entry?.tee_color ?? player.tee_color)
  const [teeDist,     setTeeDist]     = useState(entry?.tee_distance_m?.toString() ?? holeDistance?.toString() ?? '')
  const [pinDist,     setPinDist]     = useState(entry?.distance_to_pin_m?.toString() ?? '')
  const [qualifies,   setQualifies]   = useState(entry?.qualifies ?? true)
  const [dqReason,    setDqReason]    = useState(entry?.disqualify_reason ?? '')

  const tee       = TEES.find(t => t.key === teeColor) ?? TEES[2]
  const teeDistN  = parseFloat(teeDist)  || 0
  const pinDistN  = parseFloat(pinDist)  || 0
  const drove     = isLD ? teeDistN - pinDistN : null

  const handleSave = () => {
    onSave({
      tee_color: teeColor,
      tee_distance_m: teeDistN,
      distance_to_pin_m: pinDistN,
      qualifies,
      disqualify_reason: qualifies ? null : (dqReason || (isLD ? 'No entró al fairway' : 'No entró al green')),
    })
  }

  const hasData = entry !== null

  return (
    <div style={{ background: '#0d0d1a', border: `1px solid ${hasData ? (qualifies ? '#1e4a2a' : '#3a1a1a') : '#1e1736'}`, borderRadius: 14, overflow: 'hidden' }}>
      {/* Header jugador */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid #1e1736', background: '#0a0a14' }}>
        <div style={{ width: 9, height: 9, borderRadius: 5, background: TEE_HEX[player.tee_color] ?? '#888' }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: '#c1c1c6', flex: 1 }}>{player.display_name}</span>
        {saving && <span style={{ fontSize: 11, color: '#706c7e' }}>Guardando...</span>}
        {hasData && !saving && (
          <span style={{ fontSize: 11, color: qualifies ? '#4ade80' : '#f87171', fontWeight: 600 }}>
            {qualifies ? '✓ Válido' : '✕ No aplica'}
          </span>
        )}
      </div>

      <div style={{ padding: '14px' }}>
        {/* Aplica / no aplica */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button onClick={() => setQualifies(true)}
            style={{ flex: 1, padding: '9px', borderRadius: 9, border: `1px solid ${qualifies ? '#166534' : '#1e1736'}`, background: qualifies ? '#0a2a1a' : 'transparent', color: qualifies ? '#4ade80' : '#706c7e', fontFamily: FONT, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {isLD ? '✓ Entró al fairway' : '✓ Entró al green'}
          </button>
          <button onClick={() => setQualifies(false)}
            style={{ flex: 1, padding: '9px', borderRadius: 9, border: `1px solid ${!qualifies ? '#7f1d1d' : '#1e1736'}`, background: !qualifies ? '#1a0505' : 'transparent', color: !qualifies ? '#f87171' : '#706c7e', fontFamily: FONT, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {isLD ? '✕ No entró fairway' : '✕ No entró green'}
          </button>
        </div>

        {qualifies && (
          <>
            {/* Salida */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#706c7e', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Salida usada</div>
              <div style={{ display: 'flex', gap: 7 }}>
                {TEES.map(t => (
                  <button key={t.key} onClick={() => {
                    setTeeColor(t.key)
                    // Auto-fill distancia si la cancha la tiene
                  }}
                    style={{ flex: 1, padding: '7px 4px', borderRadius: 8, border: `2px solid ${teeColor === t.key ? t.hex : '#1e1736'}`, background: teeColor === t.key ? t.hex + '22' : 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 6, background: t.hex }} />
                    <span style={{ fontSize: 9, color: teeColor === t.key ? '#c1c1c6' : '#706c7e', fontFamily: FONT }}>{t.label.slice(0, 3)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Distancias */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#706c7e', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
                  {isLD ? 'Dist. salida → hoyo (m)' : 'Dist. salida → hoyo (m)'}
                </div>
                <input style={inputStyle} type="number" min="0" step="1"
                  placeholder={holeDistance?.toString() ?? 'ej: 380'}
                  value={teeDist} onChange={e => setTeeDist(e.target.value)} />
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#706c7e', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
                  {isLD ? 'Dist. pelota → hoyo (m)' : 'Dist. pelota → hoyo (m)'}
                </div>
                <input style={inputStyle} type="number" min="0" step="0.1"
                  placeholder={isLD ? 'ej: 45' : 'ej: 3.5'}
                  value={pinDist} onChange={e => setPinDist(e.target.value)} />
              </div>
            </div>

            {/* Resultado calculado */}
            {isLD && teeDistN > 0 && pinDistN > 0 && (
              <div style={{ background: '#055074' + '18', border: '1px solid #055074' + '40', borderRadius: 9, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#706c7e' }}>Recorrido calculado:</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#c1c1c6' }}>{drove}m</span>
              </div>
            )}
            {!isLD && pinDistN > 0 && (
              <div style={{ background: '#055074' + '18', border: '1px solid #055074' + '40', borderRadius: 9, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#706c7e' }}>Distancia al hoyo:</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#c1c1c6' }}>{pinDistN}m</span>
              </div>
            )}
          </>
        )}

        {!qualifies && (
          <input style={{ ...inputStyle, marginBottom: 12 }}
            placeholder={isLD ? 'Motivo (ej: fuera, OB, agua...)' : 'Motivo (ej: no llegó al green...)'}
            value={dqReason} onChange={e => setDqReason(e.target.value)} />
        )}

        {/* Guardar */}
        <button onClick={handleSave} disabled={saving || (qualifies && (teeDistN <= 0 || pinDistN <= 0))}
          style={{ width: '100%', padding: '11px', background: (saving || (qualifies && (teeDistN <= 0 || pinDistN <= 0))) ? '#111124' : '#055074', border: 'none', borderRadius: 9, fontFamily: FONT, fontSize: 14, fontWeight: 700, color: (saving || (qualifies && (teeDistN <= 0 || pinDistN <= 0))) ? '#706c7e' : '#c1c1c6', cursor: 'pointer' }}>
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}