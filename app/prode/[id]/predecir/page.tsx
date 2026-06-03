'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

const FONT = "'Ubuntu', sans-serif"
const RED = '#D4001A'
const NAVY = '#002B7F'
const GOLD = '#C8950A'
const BG = '#FFFFFF'
const CARD_BG = '#F7F8FA'
const BORDER = '#E5E7EB'
const TEXT = '#111111'
const MUTED = '#6B7280'
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
      userRef.current = user

      const { data: part } = await supabase
        .from('prode_participants').select('id')
        .eq('tournament_id', id).eq('user_id', user.id).maybeSingle()
      setIsParticipant(!!part)
      if (!part) { setLoading(false); return }

      const [{ data: ms }, { data: myPicks }, { data: mySpecials }] = await Promise.all([
        supabase.from('prode_matches').select('id,home_team,away_team,home_flag,away_flag,kickoff,group_name,sort_order,stage').order('sort_order'),
        supabase.from('prode_stage1_picks').select('match_id,home_score,away_score').eq('tournament_id', id).eq('user_id', user.id),
        supabase.from('prode_stage1_specials').select('*').eq('tournament_id', id).eq('user_id', user.id).maybeSingle(),
      ])

      setMatches((ms ?? []) as Match[])
      const pickMap: Picks = {}
      for (const p of (myPicks ?? [])) pickMap[p.match_id] = { h: String(p.home_score), a: String(p.away_score) }
      setPicks(pickMap)
      picksRef.current = pickMap

      if (mySpecials) {
        const sp: Specials = {
          champion: mySpecials.champion ?? '', runner_up: mySpecials.runner_up ?? '',
          third_place: mySpecials.third_place ?? '', fourth_place: mySpecials.fourth_place ?? '',
          balon_oro: mySpecials.balon_oro ?? '', guante_oro: mySpecials.guante_oro ?? '',
          botin_oro: mySpecials.botin_oro ?? '', fair_play: mySpecials.fair_play ?? '',
          revelacion: mySpecials.revelacion ?? '', goleada_match_id: mySpecials.goleada_match_id ?? '',
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
    const h = parseInt(pick.h), a = parseInt(pick.a)
    if (isNaN(h) || isNaN(a)) return
    setSaveStatus('saving')
    const { error } = await supabase.from('prode_stage1_picks').upsert({
      tournament_id: id, user_id: userRef.current?.id, match_id: matchId,
      home_score: h, away_score: a, updated_at: new Date().toISOString(),
    }, { onConflict: 'tournament_id,user_id,match_id' })
    if (!error) showSaved(); else setSaveStatus('idle')
  }, [id, showSaved])

  const saveSpecials = useCallback(async () => {
    setSaveStatus('saving')
    const { error } = await supabase.from('prode_stage1_specials').upsert({
      tournament_id: id, user_id: userRef.current?.id,
      ...specialsRef.current, updated_at: new Date().toISOString(),
    }, { onConflict: 'tournament_id,user_id' })
    if (!error) showSaved(); else setSaveStatus('idle')
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
  const allTeams = [...new Set(groupMatches.flatMap(m => [m.home_team, m.away_team]))].sort()
  const fmtKickoff = (d: string) => new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const activeGroupMatches = groupMatches.filter(m => m.group_name === activeGroup).sort((a, b) => a.sort_order - b.sort_order)

  if (loading) {
    return (
      <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
        <div style={{ color: MUTED }}>Cargando...</div>
      </div>
    )
  }

  if (!isParticipant) {
    return (
      <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 15, color: TEXT, marginBottom: 8 }}>No estás inscripto en este torneo.</div>
          <Link href={`/prode/${id}`} style={{ color: RED, fontSize: 13 }}>← Volver al torneo</Link>
        </div>
      </div>
    )
  }

  const TeamSelect = ({ field, label }: { field: keyof Specials; label: string }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 6, fontWeight: 600 }}>{label}</div>
      <select
        value={specials[field]}
        onChange={e => handleSpecialChange(field, e.target.value)}
        disabled={isDeadlinePast || allTeams.length === 0}
        style={{ display: 'block', width: '100%', padding: '11px 14px', background: BG, color: specials[field] ? TEXT : '#aaa', border: `1.5px solid ${BORDER}`, borderRadius: 10, fontFamily: FONT, fontSize: 13, outline: 'none', appearance: 'none' }}
      >
        <option value="">Elegir equipo...</option>
        {allTeams.map(t => <option key={t} value={t} style={{ color: TEXT }}>{t}</option>)}
      </select>
    </div>
  )

  const TextInput = ({ field, label, placeholder }: { field: keyof Specials; label: string; placeholder: string }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 6, fontWeight: 600 }}>{label}</div>
      <input
        type="text"
        value={specials[field]}
        onChange={e => handleSpecialChange(field, e.target.value)}
        disabled={isDeadlinePast}
        placeholder={placeholder}
        style={{ display: 'block', width: '100%', padding: '11px 14px', background: BG, color: TEXT, border: `1.5px solid ${BORDER}`, borderRadius: 10, fontFamily: FONT, fontSize: 13, outline: 'none' }}
      />
    </div>
  )

  const groupDone = (g: string) => {
    const gm = groupMatches.filter(m => m.group_name === g)
    return gm.length > 0 && gm.every(m => picks[m.id]?.h !== '' && picks[m.id]?.a !== '')
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${BG}; }

        .score-inp {
          width: 52px; height: 52px; padding: 0; text-align: center;
          background: ${CARD_BG}; color: ${TEXT}; border: 1.5px solid ${BORDER};
          border-radius: 10px; font-family: ${FONT}; font-size: 22px; font-weight: 700;
          outline: none; -moz-appearance: textfield; transition: border-color 0.15s;
        }
        .score-inp::-webkit-outer-spin-button, .score-inp::-webkit-inner-spin-button { -webkit-appearance: none; }
        .score-inp:focus { border-color: ${RED}; background: #fff0f1; }
        .score-inp:disabled { opacity: 0.4; cursor: not-allowed; }
        .score-inp.filled { border-color: ${RED}; color: ${RED}; background: #fff8f8; }

        .group-tab {
          padding: 8px 14px; background: ${BG}; color: ${MUTED};
          border: 1.5px solid ${BORDER}; border-radius: 8px;
          font-family: ${FONT}; font-size: 12px; font-weight: 700;
          cursor: pointer; flex-shrink: 0; transition: all 0.12s;
          display: flex; align-items: center; gap: 4px;
        }
        .group-tab.active { background: ${TEXT}; color: #fff; border-color: ${TEXT}; }
        .group-tab.done { border-color: #10b981; color: #10b981; }
        .group-tab.done.active { background: #10b981; color: #fff; border-color: #10b981; }
        .group-tab:hover:not(.active) { border-color: ${TEXT}; color: ${TEXT}; }

        .match-card {
          background: ${CARD_BG}; border: 1.5px solid ${BORDER}; border-radius: 14px;
          padding: 14px 16px; transition: border-color 0.15s;
        }
        .match-card:hover { border-color: #d1d5db; }
        .match-card.filled { border-color: ${RED}20; }
        .flag { width: 26px; height: 26px; border-radius: 50%; object-fit: cover; background: ${BORDER}; flex-shrink: 0; }
        .team-name { font-size: 13px; color: ${TEXT}; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .matches-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
        @media (min-width: 900px) {
          .matches-grid { grid-template-columns: 1fr 1fr; }
        }

        .predecir-layout { display: flex; gap: 0; }
        .sidebar-groups {
          display: none;
        }
        .mobile-tabs {
          display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px;
        }
        @media (min-width: 768px) {
          .sidebar-groups {
            display: flex; flex-direction: column; gap: 6px;
            width: 120px; flex-shrink: 0; padding-right: 20px;
            position: sticky; top: 58px; height: fit-content;
            align-self: flex-start;
          }
          .mobile-tabs { display: none; }
          .predecir-layout { gap: 0; }
          .group-tab { width: 100%; justify-content: space-between; }
        }

        select option { background: ${BG}; color: ${TEXT}; }
      `}</style>

      <div style={{ background: BG, minHeight: '100vh', fontFamily: FONT, paddingBottom: 60 }}>

        {/* Header */}
        <nav style={{ background: '#000', position: 'sticky', top: 0, zIndex: 20 }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href={`/prode/${id}`} style={{ color: '#999', textDecoration: 'none', fontSize: 20, lineHeight: 1, flexShrink: 0 }}>←</Link>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Mis predicciones</div>
              <div style={{ fontSize: 11, color: '#777' }}>{myPickCount} de {groupMatches.length} partidos completados</div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: saveStatus === 'saved' ? '#10b981' : saveStatus === 'saving' ? GOLD : 'transparent', transition: 'color 0.3s', flexShrink: 0 }}>
              {saveStatus === 'saving' ? '⏳ Guardando...' : saveStatus === 'saved' ? '✓ Guardado' : '·'}
            </div>
          </div>
          {/* Progress bar */}
          <div style={{ height: 3, background: '#333' }}>
            <div style={{ height: '100%', background: RED, width: `${groupMatches.length ? (myPickCount / groupMatches.length) * 100 : 0}%`, transition: 'width 0.4s' }} />
          </div>
        </nav>

        {isDeadlinePast && (
          <div style={{ background: '#fff0f1', borderBottom: `1px solid #ffc0c5`, padding: '10px 20px', textAlign: 'center', fontSize: 13, color: RED, fontWeight: 600 }}>
            Las predicciones de fase de grupos están cerradas. Solo podés ver tus picks.
          </div>
        )}

        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 20px' }}>

          {/* Mobile: horizontal tabs */}
          <div className="mobile-tabs" style={{ marginBottom: 16 }}>
            {GROUPS.map(g => (
              <button key={g} className={`group-tab${activeGroup === g ? ' active' : ''}${groupDone(g) ? ' done' : ''}`} onClick={() => setActiveGroup(g)}>
                {g} {groupDone(g) && <span>✓</span>}
              </button>
            ))}
            <button className={`group-tab${activeGroup === 'ESP' ? ' active' : ''}`} onClick={() => setActiveGroup('ESP')} style={{ minWidth: 90 }}>
              Especiales
            </button>
          </div>

          <div className="predecir-layout">

            {/* Desktop: vertical sidebar */}
            <div className="sidebar-groups">
              <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Grupos</div>
              {GROUPS.map(g => (
                <button key={g} className={`group-tab${activeGroup === g ? ' active' : ''}${groupDone(g) ? ' done' : ''}`} onClick={() => setActiveGroup(g)}>
                  <span>Grupo {g}</span>
                  {groupDone(g) && <span style={{ fontSize: 11 }}>✓</span>}
                </button>
              ))}
              <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', margin: '8px 0 4px' }}>Extras</div>
              <button className={`group-tab${activeGroup === 'ESP' ? ' active' : ''}`} onClick={() => setActiveGroup('ESP')}>
                <span>Especiales</span>
              </button>
            </div>

            {/* Main content */}
            <div style={{ flex: 1, minWidth: 0 }}>

              {/* Group matches */}
              {activeGroup !== 'ESP' && (
                <>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, background: groupDone(activeGroup) ? '#10b981' : RED, color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>{activeGroup}</span>
                    Grupo {activeGroup}
                    <span style={{ fontSize: 12, color: MUTED, fontWeight: 400 }}>
                      {groupMatches.filter(m => m.group_name === activeGroup && picks[m.id]?.h !== '' && picks[m.id]?.a !== '').length}/{activeGroupMatches.length} partidos
                    </span>
                  </div>

                  {activeGroupMatches.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px 0', color: MUTED, fontSize: 13 }}>
                      No hay partidos cargados para este grupo.
                    </div>
                  ) : (
                    <div className="matches-grid">
                      {activeGroupMatches.map(m => {
                        const pick = picks[m.id] ?? { h: '', a: '' }
                        const filled = pick.h !== '' && pick.a !== ''
                        return (
                          <div key={m.id} className={`match-card${filled ? ' filled' : ''}`}>
                            <div style={{ fontSize: 11, color: MUTED, textAlign: 'center', marginBottom: 10 }}>
                              {fmtKickoff(m.kickoff)}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {/* Home */}
                              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, justifyContent: 'flex-end' }}>
                                <span className="team-name" style={{ textAlign: 'right' }}>{m.home_team}</span>
                                <img src={m.home_flag} alt="" className="flag" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                              </div>
                              {/* Scores */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                <input
                                  type="number" min={0} max={20} inputMode="numeric"
                                  className={`score-inp${filled ? ' filled' : ''}`}
                                  value={pick.h}
                                  onChange={e => handlePickChange(m.id, 'h', e.target.value)}
                                  disabled={isDeadlinePast}
                                  placeholder="—"
                                />
                                <span style={{ color: BORDER, fontSize: 18, fontWeight: 700 }}>:</span>
                                <input
                                  type="number" min={0} max={20} inputMode="numeric"
                                  className={`score-inp${filled ? ' filled' : ''}`}
                                  value={pick.a}
                                  onChange={e => handlePickChange(m.id, 'a', e.target.value)}
                                  disabled={isDeadlinePast}
                                  placeholder="—"
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
                    </div>
                  )}
                </>
              )}

              {/* Especiales */}
              {activeGroup === 'ESP' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>

                  <div style={{ background: CARD_BG, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '18px 20px' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 16 }}>🏆 Posiciones finales</div>
                    <TeamSelect field="champion" label="Campeón" />
                    <TeamSelect field="runner_up" label="Sub-campeón" />
                    <TeamSelect field="third_place" label="3er puesto" />
                    <TeamSelect field="fourth_place" label="4to puesto" />
                  </div>

                  <div style={{ background: CARD_BG, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '18px 20px' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 16 }}>⭐ Premios individuales</div>
                    <TextInput field="balon_oro" label="Balón de Oro — Jugador del torneo" placeholder="Nombre del jugador" />
                    <TextInput field="guante_oro" label="Guante de Oro — Mejor arquero" placeholder="Nombre del arquero" />
                    <TextInput field="botin_oro" label="Botín de Oro — Máximo goleador" placeholder="Nombre del goleador" />
                  </div>

                  <div style={{ background: CARD_BG, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '18px 20px' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 16 }}>💥 Otros especiales</div>
                    <TeamSelect field="fair_play" label="Premio Fair Play — Equipo" />
                    <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, color: MUTED, marginBottom: 6, fontWeight: 600 }}>Revelación — Equipo sorpresa (15 pts)</div>
                    <select
                      value={specials.revelacion}
                      onChange={e => handleSpecialChange('revelacion', e.target.value)}
                      disabled={isDeadlinePast}
                      style={{ display: 'block', width: '100%', padding: '11px 14px', background: BG, color: specials.revelacion ? TEXT : '#aaa', border: `1.5px solid ${BORDER}`, borderRadius: 10, fontFamily: FONT, fontSize: 13, outline: 'none', appearance: 'none' }}
                    >
                      <option value="">Elegir equipo...</option>
                      {['República Checa','Escocia','Túnez','RD del Congo','Uzbekistán','Qatar','Irak','Sudáfrica','Arabia Saudita','Jordania','Bosnia y Herzegovina','Cabo Verde','Ghana','Curazao','Haití','Nueva Zelanda'].map(t => (
                        <option key={t} value={t} style={{ color: TEXT }}>{t}</option>
                      ))}
                    </select>
                  </div>
                    <div>
                      <div style={{ fontSize: 12, color: MUTED, marginBottom: 6, fontWeight: 600 }}>Goleada del torneo — Partido</div>
                      <select
                        value={specials.goleada_match_id}
                        onChange={e => handleSpecialChange('goleada_match_id', e.target.value)}
                        disabled={isDeadlinePast || groupMatches.length === 0}
                        style={{ display: 'block', width: '100%', padding: '11px 14px', background: BG, color: specials.goleada_match_id ? TEXT : '#aaa', border: `1.5px solid ${BORDER}`, borderRadius: 10, fontFamily: FONT, fontSize: 13, outline: 'none', appearance: 'none' }}
                      >
                        <option value="">Elegir partido...</option>
                        {groupMatches.map(m => (
                          <option key={m.id} value={m.id} style={{ color: TEXT }}>
                            {m.home_team} vs {m.away_team} (Grupo {m.group_name})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </>
  )
}
