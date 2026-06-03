'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

const FONT = "'Ubuntu', sans-serif"
const GOLD = '#D4AF37'
const BG = '#01050F'
const BORDER = '#1e1736'
const TEXT = '#c1c1c6'
const MUTED = '#706c7e'
const ACCENT = '#055074'
const CARD = '#0a0a16'

const STAGE1_DEADLINE = new Date('2026-06-11T19:00:00Z')
const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']

type Match = {
  id: string; home_team: string; away_team: string; home_flag: string; away_flag: string
  kickoff: string; group_name: string | null; sort_order: number; stage: string
}

type Picks = Record<string, { h: string; a: string }>

type Specials = {
  champion: string; runner_up: string; third_place: string; fourth_place: string
  balon_oro: string; guante_oro: string; botin_oro: string
  fair_play: string; revelacion: string; goleada_match_id: string
}

const EMPTY_SPECIALS: Specials = {
  champion: '', runner_up: '', third_place: '', fourth_place: '',
  balon_oro: '', guante_oro: '', botin_oro: '',
  fair_play: '', revelacion: '', goleada_match_id: '',
}

export default function PredecirPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [user, setUser] = useState<any>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [picks, setPicks] = useState<Picks>({})
  const [specials, setSpecials] = useState<Specials>(EMPTY_SPECIALS)
  const [activeGroup, setActiveGroup] = useState<string>('A')
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [isParticipant, setIsParticipant] = useState(false)

  const picksRef = useRef<Picks>({})
  const specialsRef = useRef<Specials>(EMPTY_SPECIALS)
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const specialsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const userRef = useRef<any>(null)

  const isDeadlinePast = new Date() >= STAGE1_DEADLINE

  useEffect(() => {
    if (!id) return
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUser(user)
      userRef.current = user

      const { data: part } = await supabase
        .from('prode_participants')
        .select('id')
        .eq('tournament_id', id)
        .eq('user_id', user.id)
        .maybeSingle()

      setIsParticipant(!!part)
      if (!part) { setLoading(false); return }

      const [{ data: ms }, { data: myPicks }, { data: mySpecials }] = await Promise.all([
        supabase.from('prode_matches').select('id,home_team,away_team,home_flag,away_flag,kickoff,group_name,sort_order,stage').order('sort_order'),
        supabase.from('prode_stage1_picks').select('match_id,home_score,away_score').eq('tournament_id', id).eq('user_id', user.id),
        supabase.from('prode_stage1_specials').select('*').eq('tournament_id', id).eq('user_id', user.id).maybeSingle(),
      ])

      setMatches((ms ?? []) as Match[])

      const pickMap: Picks = {}
      for (const p of (myPicks ?? [])) {
        pickMap[p.match_id] = { h: String(p.home_score), a: String(p.away_score) }
      }
      setPicks(pickMap)
      picksRef.current = pickMap

      if (mySpecials) {
        const sp: Specials = {
          champion: mySpecials.champion ?? '',
          runner_up: mySpecials.runner_up ?? '',
          third_place: mySpecials.third_place ?? '',
          fourth_place: mySpecials.fourth_place ?? '',
          balon_oro: mySpecials.balon_oro ?? '',
          guante_oro: mySpecials.guante_oro ?? '',
          botin_oro: mySpecials.botin_oro ?? '',
          fair_play: mySpecials.fair_play ?? '',
          revelacion: mySpecials.revelacion ?? '',
          goleada_match_id: mySpecials.goleada_match_id ?? '',
        }
        setSpecials(sp)
        specialsRef.current = sp
      }

      setLoading(false)
    }
    load()
  }, [id])

  const showSaved = useCallback(() => {
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus('idle'), 2000)
  }, [])

  const savePick = useCallback(async (matchId: string) => {
    const pick = picksRef.current[matchId]
    if (!pick || pick.h === '' || pick.a === '') return
    const h = parseInt(pick.h)
    const a = parseInt(pick.a)
    if (isNaN(h) || isNaN(a)) return

    setSaveStatus('saving')
    const { error } = await supabase.from('prode_stage1_picks').upsert({
      tournament_id: id,
      user_id: userRef.current?.id,
      match_id: matchId,
      home_score: h,
      away_score: a,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tournament_id,user_id,match_id' })

    if (!error) showSaved()
    else setSaveStatus('idle')
  }, [id, showSaved])

  const saveSpecials = useCallback(async () => {
    const sp = specialsRef.current
    setSaveStatus('saving')
    const { error } = await supabase.from('prode_stage1_specials').upsert({
      tournament_id: id,
      user_id: userRef.current?.id,
      ...sp,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tournament_id,user_id' })
    if (!error) showSaved()
    else setSaveStatus('idle')
  }, [id, showSaved])

  const handlePickChange = (matchId: string, side: 'h' | 'a', value: string) => {
    if (isDeadlinePast) return
    const cleaned = value.replace(/\D/g, '').slice(0, 2)
    const updated = { ...(picksRef.current[matchId] ?? { h: '', a: '' }), [side]: cleaned }
    picksRef.current[matchId] = updated
    setPicks(prev => ({ ...prev, [matchId]: updated }))

    if (saveTimers.current[matchId]) clearTimeout(saveTimers.current[matchId])
    saveTimers.current[matchId] = setTimeout(() => savePick(matchId), 800)
  }

  const handleSpecialChange = (key: keyof Specials, value: string) => {
    if (isDeadlinePast) return
    const updated = { ...specialsRef.current, [key]: value }
    specialsRef.current = updated
    setSpecials(updated)
    if (specialsTimer.current) clearTimeout(specialsTimer.current)
    specialsTimer.current = setTimeout(() => saveSpecials(), 800)
  }

  const groupMatches = matches.filter(m => m.stage === 'group')
  const myPickCount = Object.values(picks).filter(p => p.h !== '' && p.a !== '').length

  // All teams for dropdowns
  const allTeams = [...new Set(groupMatches.flatMap(m => [m.home_team, m.away_team]))].sort()

  const fmtKickoff = (d: string) =>
    new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  if (loading) {
    return (
      <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: FONT, color: MUTED }}>Cargando...</div>
      </div>
    )
  }

  if (!isParticipant) {
    return (
      <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 15, color: TEXT, marginBottom: 8 }}>No estás inscripto en este torneo.</div>
          <Link href={`/prode/${id}`} style={{ color: MUTED, fontSize: 13 }}>← Volver al torneo</Link>
        </div>
      </div>
    )
  }

  const activeGroupMatches = groupMatches
    .filter(m => m.group_name === activeGroup)
    .sort((a, b) => a.sort_order - b.sort_order)

  const SaveIndicator = () => (
    <div style={{
      fontSize: 11, color: saveStatus === 'saved' ? '#4ade80' : saveStatus === 'saving' ? GOLD : 'transparent',
      transition: 'color 0.3s', fontWeight: 600,
    }}>
      {saveStatus === 'saving' ? '⏳ Guardando...' : saveStatus === 'saved' ? '✓ Guardado' : '·'}
    </div>
  )

  const TeamSelect = ({ field, label }: { field: keyof Specials; label: string }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>{label}</div>
      <select
        value={specials[field]}
        onChange={e => handleSpecialChange(field, e.target.value)}
        disabled={isDeadlinePast || allTeams.length === 0}
        style={{
          display: 'block', width: '100%', padding: '11px 14px',
          background: '#0e0e1a', color: specials[field] ? TEXT : MUTED,
          border: `1px solid ${BORDER}`, borderRadius: 10,
          fontFamily: FONT, fontSize: 13, outline: 'none',
          appearance: 'none',
        }}
      >
        <option value="">Elegir equipo...</option>
        {allTeams.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
    </div>
  )

  const TextInput = ({ field, label, placeholder }: { field: keyof Specials; label: string; placeholder: string }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>{label}</div>
      <input
        type="text"
        value={specials[field]}
        onChange={e => handleSpecialChange(field, e.target.value)}
        disabled={isDeadlinePast}
        placeholder={placeholder}
        style={{
          display: 'block', width: '100%', padding: '11px 14px',
          background: '#0e0e1a', color: TEXT, border: `1px solid ${BORDER}`,
          borderRadius: 10, fontFamily: FONT, fontSize: 13, outline: 'none',
        }}
      />
    </div>
  )

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .score-inp {
          width: 48px; height: 48px; padding: 0; text-align: center;
          background: #0e0e1a; color: ${TEXT}; border: 1.5px solid ${BORDER};
          border-radius: 10px; font-family: ${FONT}; font-size: 20px; font-weight: 700;
          outline: none; -moz-appearance: textfield;
        }
        .score-inp::-webkit-outer-spin-button, .score-inp::-webkit-inner-spin-button { -webkit-appearance: none; }
        .score-inp:focus { border-color: ${GOLD}; }
        .score-inp:disabled { opacity: 0.4; cursor: not-allowed; }
        .score-inp.filled { border-color: ${GOLD}40; color: ${GOLD}; }
        .group-tab { padding: 7px 12px; background: transparent; color: ${MUTED}; border: 1px solid ${BORDER}; border-radius: 8px; font-family: ${FONT}; font-size: 12px; font-weight: 700; cursor: pointer; flex-shrink: 0; transition: all 0.15s; }
        .group-tab.active { background: ${GOLD}; color: #01050F; border-color: ${GOLD}; }
        .group-tab:hover:not(.active) { border-color: ${MUTED}; color: ${TEXT}; }
        .match-card { background: #0d0d18; border: 1px solid #111827; border-radius: 12px; padding: 12px 14px; margin-bottom: 8px; }
        .team-name { font-size: 13px; color: ${TEXT}; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .flag { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; background: #1e1736; flex-shrink: 0; }
        select option { background: #0e0e1a; }
      `}</style>

      <div style={{ background: BG, minHeight: '100vh', fontFamily: FONT, paddingBottom: 80 }}>

        {/* Header */}
        <nav style={{ background: BG, borderBottom: `1px solid ${BORDER}`, padding: '12px 0', position: 'sticky', top: 0, zIndex: 20 }}>
          <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href={`/prode/${id}`} style={{ color: MUTED, textDecoration: 'none', fontSize: 20, lineHeight: 1, flexShrink: 0 }}>←</Link>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>Mis predicciones</div>
              <div style={{ fontSize: 11, color: MUTED }}>{myPickCount} de {groupMatches.length} partidos completados</div>
            </div>
            <SaveIndicator />
          </div>
        </nav>

        {/* Progress bar */}
        <div style={{ height: 3, background: BORDER }}>
          <div style={{ height: '100%', background: GOLD, width: `${groupMatches.length ? (myPickCount / groupMatches.length) * 100 : 0}%`, transition: 'width 0.4s' }} />
        </div>

        {isDeadlinePast && (
          <div style={{ background: '#1a0808', borderBottom: '1px solid #4a1010', padding: '10px 18px', textAlign: 'center', fontSize: 12, color: '#f87171' }}>
            Las predicciones de fase de grupos están cerradas. Solo podés ver tus picks.
          </div>
        )}

        <div style={{ maxWidth: 480, margin: '0 auto' }}>

          {/* Group tabs */}
          <div style={{ padding: '12px 18px 0', position: 'sticky', top: 57, zIndex: 10, background: BG, borderBottom: `1px solid ${BORDER}`, paddingBottom: 10 }}>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
              {GROUPS.map(g => {
                const gm = groupMatches.filter(m => m.group_name === g)
                const done = gm.filter(m => picks[m.id]?.h !== '' && picks[m.id]?.a !== '').length
                return (
                  <button
                    key={g}
                    className={`group-tab${activeGroup === g ? ' active' : ''}`}
                    onClick={() => setActiveGroup(g)}
                  >
                    {g}
                    {done > 0 && done === gm.length && <span style={{ marginLeft: 3 }}>✓</span>}
                  </button>
                )
              })}
              <button
                className={`group-tab${activeGroup === 'ESP' ? ' active' : ''}`}
                onClick={() => setActiveGroup('ESP')}
                style={{ minWidth: 80 }}
              >
                Especiales
              </button>
            </div>
          </div>

          <div style={{ padding: '14px 18px' }}>

            {/* Group matches */}
            {activeGroup !== 'ESP' && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: 1, marginBottom: 12 }}>GRUPO {activeGroup}</div>

                {activeGroupMatches.length === 0 ? (
                  <div style={{ fontSize: 13, color: MUTED, textAlign: 'center', padding: '24px 0' }}>
                    No hay partidos cargados para este grupo todavía.
                  </div>
                ) : activeGroupMatches.map(m => {
                  const pick = picks[m.id] ?? { h: '', a: '' }
                  const filled = pick.h !== '' && pick.a !== ''
                  return (
                    <div key={m.id} className="match-card">
                      <div style={{ fontSize: 10, color: MUTED, marginBottom: 8, textAlign: 'center' }}>
                        {fmtKickoff(m.kickoff)}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {/* Home */}
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, justifyContent: 'flex-end' }}>
                          <span className="team-name" style={{ textAlign: 'right' }}>{m.home_team}</span>
                          <img src={m.home_flag} alt="" className="flag" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        </div>

                        {/* Score inputs */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <input
                            type="number"
                            min={0}
                            max={20}
                            inputMode="numeric"
                            className={`score-inp${filled ? ' filled' : ''}`}
                            value={pick.h}
                            onChange={e => handlePickChange(m.id, 'h', e.target.value)}
                            disabled={isDeadlinePast}
                            placeholder="-"
                          />
                          <span style={{ color: MUTED, fontSize: 14, fontWeight: 700 }}>:</span>
                          <input
                            type="number"
                            min={0}
                            max={20}
                            inputMode="numeric"
                            className={`score-inp${filled ? ' filled' : ''}`}
                            value={pick.a}
                            onChange={e => handlePickChange(m.id, 'a', e.target.value)}
                            disabled={isDeadlinePast}
                            placeholder="-"
                          />
                        </div>

                        {/* Away */}
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          <img src={m.away_flag} alt="" className="flag" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          <span className="team-name">{m.away_team}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </>
            )}

            {/* Especiales */}
            {activeGroup === 'ESP' && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: 1, marginBottom: 16 }}>ESPECIALES</div>

                <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '16px 18px', marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 14 }}>Posiciones finales</div>
                  <TeamSelect field="champion" label="🏆 Campeón" />
                  <TeamSelect field="runner_up" label="🥈 Sub-campeón" />
                  <TeamSelect field="third_place" label="🥉 3er puesto" />
                  <TeamSelect field="fourth_place" label="4to puesto" />
                </div>

                <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '16px 18px', marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 14 }}>Premios individuales</div>
                  <TextInput field="balon_oro" label="⭐ Balón de Oro (jugador del torneo)" placeholder="Nombre del jugador" />
                  <TextInput field="guante_oro" label="🧤 Guante de Oro (mejor arquero)" placeholder="Nombre del arquero" />
                  <TextInput field="botin_oro" label="👟 Botín de Oro (máximo goleador)" placeholder="Nombre del goleador" />
                </div>

                <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '16px 18px', marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 14 }}>Otros especiales</div>
                  <TeamSelect field="fair_play" label="🤝 Premio Fair Play (equipo)" />
                  <TeamSelect field="revelacion" label="💥 Revelación (equipo sorpresa)" />

                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>💣 Goleada del torneo (partido)</div>
                    <select
                      value={specials.goleada_match_id}
                      onChange={e => handleSpecialChange('goleada_match_id', e.target.value)}
                      disabled={isDeadlinePast || groupMatches.length === 0}
                      style={{
                        display: 'block', width: '100%', padding: '11px 14px',
                        background: '#0e0e1a', color: specials.goleada_match_id ? TEXT : MUTED,
                        border: `1px solid ${BORDER}`, borderRadius: 10,
                        fontFamily: FONT, fontSize: 13, outline: 'none', appearance: 'none',
                      }}
                    >
                      <option value="">Elegir partido...</option>
                      {groupMatches.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.home_team} vs {m.away_team} (Grupo {m.group_name})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {allTeams.length === 0 && (
                  <div style={{ fontSize: 12, color: MUTED, textAlign: 'center', padding: '12px 0' }}>
                    Los equipos se cargan una vez que el admin sincronice los partidos desde la API.
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  )
}
