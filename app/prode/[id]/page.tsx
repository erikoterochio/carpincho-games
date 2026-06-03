'use client'

import { useState, useEffect } from 'react'
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

type Tournament = { id: string; name: string; code: string; stage1_deadline: string; admin_id: string }
type Participant = {
  user_id: string; paid: boolean
  profiles: { username: string; nombre?: string; apellido?: string } | null
  pick_count?: number
}
type Match = {
  id: string; home_team: string; away_team: string; home_flag: string; away_flag: string
  kickoff: string; stage: string; group_name: string | null; sort_order: number
  home_score: number | null; away_score: number | null; status: string
}
type UserPick = { match_id: string; home_score: number; away_score: number; user_id: string }

const STAGE_LABEL: Record<string, string> = {
  group: 'Fase de Grupos', r32: 'Ronda de 32', r16: 'Ronda de 16',
  qf: 'Cuartos de Final', sf: 'Semifinales', '3rd': 'Tercer Puesto', final: 'Final',
}

function calcScore(pick: UserPick, match: Match) {
  if (match.home_score === null || match.away_score === null) return null
  if (pick.home_score === match.home_score && pick.away_score === match.away_score) return 3
  const pr = Math.sign(pick.home_score - pick.away_score)
  const mr = Math.sign(match.home_score - match.away_score)
  return pr === mr ? 1 : 0
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function TournamentPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const [tab, setTab] = useState<'predecir' | 'fixture' | 'tabla' | 'info'>('predecir')
  const [user, setUser] = useState<any>(null)
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [allPicks, setAllPicks] = useState<UserPick[]>([])
  const [myPickCount, setMyPickCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [isParticipant, setIsParticipant] = useState(false)

  useEffect(() => {
    if (!id) return
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      const [{ data: t }, { data: ps }, { data: ms }] = await Promise.all([
        supabase.from('prode_tournaments').select('*').eq('id', id).maybeSingle(),
        supabase.from('prode_participants').select('user_id, paid, profiles(username, nombre, apellido)').eq('tournament_id', id),
        supabase.from('prode_matches').select('*').order('sort_order'),
      ])

      setTournament(t)
      setMatches((ms ?? []) as Match[])

      if (user && ps) {
        setIsParticipant(!!(ps as any[]).find(p => p.user_id === user.id))
        const { data: picks } = await supabase
          .from('prode_stage1_picks')
          .select('match_id, home_score, away_score, user_id')
          .eq('tournament_id', id)
        const allP = (picks ?? []) as UserPick[]
        setAllPicks(allP)
        setMyPickCount(allP.filter(p => p.user_id === user.id).length)
        setParticipants((ps as any[]).map(p => ({ ...p, pick_count: allP.filter(pk => pk.user_id === p.user_id).length })))
      } else {
        setParticipants((ps ?? []) as any[])
      }

      setLoading(false)
    }
    load()
  }, [id])

  const handleSync = async () => {
    setSyncing(true)
    const res = await fetch('/api/prode/sync', { method: 'POST' })
    const json = await res.json()
    if (json.synced != null) {
      alert(`✓ Sincronizados ${json.synced} partidos.`)
      router.refresh()
    } else {
      alert(`Error: ${json.error}`)
    }
    setSyncing(false)
  }

  const handleJoin = async () => {
    if (!user) { router.push('/login'); return }
    await supabase.from('prode_participants').insert({ tournament_id: id, user_id: user.id })
    setIsParticipant(true)
    window.location.reload()
  }

  const isDeadlinePast = new Date() >= STAGE1_DEADLINE
  const groupMatches = matches.filter(m => m.stage === 'group')
  const progress = groupMatches.length > 0 ? Math.round((myPickCount / groupMatches.length) * 100) : 0

  const leaderboard = participants.map(p => {
    const name = p.profiles?.nombre
      ? `${p.profiles.nombre} ${p.profiles.apellido ?? ''}`.trim()
      : p.profiles?.username ?? 'Jugador'
    const userPicks = allPicks.filter(pk => pk.user_id === p.user_id)
    const pts = isDeadlinePast
      ? userPicks.reduce((acc, pk) => {
          const m = matches.find(m => m.id === pk.match_id)
          return acc + (m ? (calcScore(pk, m) ?? 0) : 0)
        }, 0)
      : null
    return { user_id: p.user_id, name, pick_count: p.pick_count ?? 0, pts, paid: p.paid }
  }).sort((a, b) => (b.pts ?? 0) - (a.pts ?? 0) || (b.pick_count ?? 0) - (a.pick_count ?? 0))

  if (loading) {
    return (
      <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
        <div style={{ color: MUTED }}>Cargando...</div>
      </div>
    )
  }

  if (!tournament) {
    return (
      <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: TEXT, fontSize: 15, marginBottom: 12 }}>Torneo no encontrado.</div>
          <Link href="/prode" style={{ color: RED, fontSize: 13 }}>← Volver</Link>
        </div>
      </div>
    )
  }

  const isAdmin = user?.id === tournament.admin_id

  const TABS = [
    { key: 'predecir', label: 'Predecir' },
    { key: 'fixture', label: 'Fixture' },
    { key: 'tabla', label: 'Tabla' },
    { key: 'info', label: 'Info' },
  ] as const

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .wrap { max-width: 1100px; margin: 0 auto; padding: 24px 20px; }
        .match-row { display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid ${BORDER}; }
        .match-row:last-child { border-bottom: none; }
        .flag { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; background: ${BORDER}; flex-shrink: 0; }
        .prog-bar { height: 8px; background: ${BORDER}; border-radius: 4px; overflow: hidden; }
        .prog-fill { height: 100%; background: ${RED}; border-radius: 4px; transition: width 0.4s; }
        .lb-row { display: flex; align-items: center; padding: 11px 0; border-bottom: 1px solid ${BORDER}; }
        .lb-row:last-child { border-bottom: none; }
        .section-title { font-size: 11px; font-weight: 700; color: ${MUTED}; letter-spacing: 1.2px; text-transform: uppercase; margin-bottom: 12px; font-family: ${FONT}; }

        .fixture-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
        @media (min-width: 768px) {
          .fixture-grid { grid-template-columns: 1fr 1fr; }
          .pred-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        }
      `}</style>

      <div style={{ background: BG, minHeight: '100vh', fontFamily: FONT }}>

        {/* Header */}
        <nav style={{ background: '#000' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href="/prode" style={{ color: '#999', textDecoration: 'none', fontSize: 20, lineHeight: 1, flexShrink: 0 }}>←</Link>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tournament.name}</div>
              <div style={{ fontSize: 11, color: '#777' }}>Código: <span style={{ color: GOLD, fontWeight: 700 }}>{tournament.code}</span> · {participants.length} participantes</div>
            </div>
            {isAdmin && (
              <button
                onClick={handleSync}
                disabled={syncing}
                style={{ padding: '7px 14px', background: '#222', color: '#ccc', border: '1px solid #444', borderRadius: 8, fontFamily: FONT, fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
              >
                {syncing ? 'Sincronizando...' : '↻ Sync'}
              </button>
            )}
          </div>
        </nav>

        {/* Tabs */}
        <div style={{ borderBottom: `1px solid ${BORDER}`, background: BG, position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 20px', display: 'flex', gap: 0 }}>
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  padding: '14px 20px', background: 'transparent', border: 'none',
                  borderBottom: tab === t.key ? `3px solid ${RED}` : '3px solid transparent',
                  color: tab === t.key ? RED : MUTED,
                  fontFamily: FONT, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  transition: 'all 0.15s', marginBottom: -1,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="wrap">

          {/* ── PREDECIR ── */}
          {tab === 'predecir' && (
            <div>
              {!user ? (
                <div style={{ background: CARD_BG, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: 32, textAlign: 'center' }}>
                  <div style={{ fontSize: 15, color: TEXT, marginBottom: 8 }}>Iniciá sesión para predecir</div>
                  <Link href="/login" style={{ display: 'inline-block', padding: '11px 28px', background: RED, color: '#fff', fontFamily: FONT, fontSize: 14, fontWeight: 700, borderRadius: 10, textDecoration: 'none' }}>
                    Iniciar sesión
                  </Link>
                </div>
              ) : !isParticipant ? (
                <div style={{ background: CARD_BG, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: 32, textAlign: 'center' }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>⚽</div>
                  <div style={{ fontSize: 15, color: TEXT, fontWeight: 700, marginBottom: 6 }}>¿Querés participar?</div>
                  <div style={{ fontSize: 13, color: MUTED, marginBottom: 20 }}>Uníte al torneo para hacer tus predicciones.</div>
                  <button onClick={handleJoin} style={{ padding: '12px 32px', background: RED, color: '#fff', border: 'none', borderRadius: 10, fontFamily: FONT, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                    Unirme al torneo
                  </button>
                </div>
              ) : (
                <div className="pred-grid">
                  {/* Left: progress + link */}
                  <div>
                    <div style={{ background: CARD_BG, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: 20, marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Fase de grupos</div>
                        <div style={{ fontSize: 13, color: RED, fontWeight: 700 }}>{myPickCount}/{groupMatches.length}</div>
                      </div>
                      <div className="prog-bar" style={{ marginBottom: 8 }}>
                        <div className="prog-fill" style={{ width: `${progress}%` }} />
                      </div>
                      <div style={{ fontSize: 12, color: MUTED }}>{progress}% completado</div>
                    </div>

                    {isDeadlinePast ? (
                      <div style={{ background: '#fff0f1', border: `1px solid #ffc0c5`, borderRadius: 12, padding: '14px 16px', fontSize: 13, color: RED }}>
                        Las predicciones de fase de grupos están cerradas.
                      </div>
                    ) : (
                      <Link
                        href={`/prode/${id}/predecir`}
                        style={{
                          display: 'block', padding: '16px 20px', background: RED, color: '#fff',
                          borderRadius: 14, textDecoration: 'none', textAlign: 'center',
                          fontWeight: 700, fontSize: 15,
                        }}
                      >
                        {myPickCount === 0 ? '⚽ Comenzar a predecir' : '✏️ Continuar predicciones'}
                      </Link>
                    )}
                  </div>

                  {/* Right: scoring */}
                  <div>
                    <div style={{ background: CARD_BG, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: 20 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 14 }}>Sistema de puntos</div>
                      {[
                        { pts: '3', label: 'Resultado exacto', desc: 'Ej: predeciste 2-1 y fue 2-1', color: '#10b981' },
                        { pts: '1', label: 'Resultado correcto', desc: 'Acertaste el ganador o el empate', color: GOLD },
                        { pts: '0', label: 'Resultado incorrecto', desc: 'No acertaste el resultado', color: MUTED },
                      ].map(({ pts, label, desc, color }) => (
                        <div key={pts} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderBottom: `1px solid ${BORDER}` }}>
                          <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: 16, fontWeight: 700, color }}>{pts}</span>
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 2 }}>{label}</div>
                            <div style={{ fontSize: 11, color: MUTED }}>{desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── FIXTURE ── */}
          {tab === 'fixture' && (
            <div>
              {matches.length === 0 ? (
                <div style={{ background: CARD_BG, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: 32, textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: MUTED, marginBottom: 8 }}>No hay partidos cargados todavía.</div>
                  {isAdmin && <div style={{ fontSize: 12, color: MUTED }}>Usá el botón "Sync" del header para cargar los partidos desde la API.</div>}
                </div>
              ) : (
                <>
                  <div className="fixture-grid">
                    {GROUPS.map(g => {
                      const gm = matches.filter(m => m.group_name === g).sort((a, b) => a.sort_order - b.sort_order)
                      if (!gm.length) return null
                      return (
                        <div key={g} style={{ background: CARD_BG, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '14px 16px' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: RED, letterSpacing: 1, marginBottom: 10 }}>GRUPO {g}</div>
                          {gm.map(m => (
                            <div key={m.id} className="match-row">
                              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, justifyContent: 'flex-end' }}>
                                <span style={{ fontSize: 12, color: TEXT, fontWeight: 500, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.home_team}</span>
                                <img src={m.home_flag} alt="" className="flag" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                              </div>
                              <div style={{ padding: '0 10px', textAlign: 'center', flexShrink: 0, minWidth: 90 }}>
                                {['FT', 'AET', 'PEN'].includes(m.status) ? (
                                  <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{m.home_score} - {m.away_score}</span>
                                ) : (
                                  <span style={{ fontSize: 10, color: MUTED }}>{fmtDate(m.kickoff)}</span>
                                )}
                              </div>
                              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                <img src={m.away_flag} alt="" className="flag" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                                <span style={{ fontSize: 12, color: TEXT, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.away_team}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </div>

                  {['r32', 'r16', 'qf', 'sf', '3rd', 'final'].map(stage => {
                    const sm = matches.filter(m => m.stage === stage).sort((a, b) => a.sort_order - b.sort_order)
                    if (!sm.length) return null
                    return (
                      <div key={stage} style={{ background: CARD_BG, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '14px 16px', marginTop: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: NAVY, letterSpacing: 1, marginBottom: 10 }}>{STAGE_LABEL[stage]?.toUpperCase()}</div>
                        {sm.map(m => (
                          <div key={m.id} className="match-row">
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                              <span style={{ fontSize: 13, color: TEXT, fontWeight: 500, textAlign: 'right' }}>{m.home_team}</span>
                              <img src={m.home_flag} alt="" className="flag" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                            </div>
                            <div style={{ padding: '0 12px', textAlign: 'center', flexShrink: 0, minWidth: 90 }}>
                              {['FT', 'AET', 'PEN'].includes(m.status) ? (
                                <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{m.home_score} - {m.away_score}</span>
                              ) : (
                                <span style={{ fontSize: 11, color: MUTED }}>{fmtDate(m.kickoff)}</span>
                              )}
                            </div>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <img src={m.away_flag} alt="" className="flag" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                              <span style={{ fontSize: 13, color: TEXT, fontWeight: 500 }}>{m.away_team}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          )}

          {/* ── TABLA ── */}
          {tab === 'tabla' && (
            <div>
              <div style={{ background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '10px 18px', background: TEXT, color: '#fff' }}>
                  <div style={{ width: 32, fontSize: 11, fontWeight: 700 }}>#</div>
                  <div style={{ flex: 1, fontSize: 11, fontWeight: 700 }}>JUGADOR</div>
                  <div style={{ width: 72, textAlign: 'center', fontSize: 11, fontWeight: 700 }}>PICKS</div>
                  <div style={{ width: 56, textAlign: 'center', fontSize: 11, fontWeight: 700, color: isDeadlinePast ? GOLD : '#999' }}>PTS</div>
                </div>
                {leaderboard.length === 0 ? (
                  <div style={{ padding: '24px 18px', textAlign: 'center', color: MUTED, fontSize: 13 }}>Nadie se unió todavía.</div>
                ) : leaderboard.map((p, i) => (
                  <div key={p.user_id} className="lb-row" style={{ padding: '12px 18px' }}>
                    <div style={{ width: 32, fontSize: 14, fontWeight: 700, color: i === 0 ? GOLD : i < 3 ? MUTED : '#ccc' }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </div>
                    <div style={{ flex: 1, fontSize: 14, fontWeight: p.user_id === user?.id ? 700 : 400, color: p.user_id === user?.id ? RED : TEXT }}>
                      {p.name}{p.user_id === user?.id ? ' (vos)' : ''}{p.user_id === tournament.admin_id ? ' 👑' : ''}
                    </div>
                    <div style={{ width: 72, textAlign: 'center', fontSize: 13, color: MUTED }}>
                      {p.pick_count}/{groupMatches.length || '?'}
                    </div>
                    <div style={{ width: 56, textAlign: 'center', fontSize: 15, fontWeight: 700, color: isDeadlinePast ? TEXT : MUTED }}>
                      {isDeadlinePast ? (p.pts ?? 0) : '—'}
                    </div>
                  </div>
                ))}
              </div>
              {!isDeadlinePast && (
                <div style={{ fontSize: 12, color: MUTED, textAlign: 'center', marginTop: 14 }}>Los puntos se calculan después del cierre de predicciones el 11 de junio.</div>
              )}
            </div>
          )}

          {/* ── INFO ── */}
          {tab === 'info' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
              <div>
                <div className="section-title">Información del torneo</div>
                <div style={{ background: CARD_BG, border: `1.5px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
                  {[
                    ['Nombre', tournament.name],
                    ['Código', tournament.code],
                    ['Participantes', String(participants.length)],
                    ['Cierre fase grupos', new Date('2026-06-11T19:00:00Z').toLocaleString('es-AR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })],
                  ].map(([label, value]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderBottom: `1px solid ${BORDER}` }}>
                      <span style={{ fontSize: 13, color: MUTED }}>{label}</span>
                      <span style={{ fontSize: 13, color: TEXT, fontWeight: 700 }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="section-title">Participantes ({participants.length})</div>
                <div style={{ background: CARD_BG, border: `1.5px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
                  {participants.map(p => (
                    <div key={p.user_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: `1px solid ${BORDER}` }}>
                      <span style={{ fontSize: 13, fontWeight: p.user_id === user?.id ? 700 : 400, color: p.user_id === user?.id ? RED : TEXT }}>
                        {p.profiles?.nombre ? `${p.profiles.nombre} ${p.profiles.apellido ?? ''}`.trim() : p.profiles?.username ?? 'Jugador'}
                        {p.user_id === user?.id ? ' (vos)' : ''}
                        {p.user_id === tournament.admin_id ? ' 👑' : ''}
                      </span>
                      <span style={{ fontSize: 11, color: p.paid ? '#10b981' : MUTED, fontWeight: 600 }}>
                        {p.paid ? '✓ Pagó' : 'Sin pagar'}
                      </span>
                    </div>
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
