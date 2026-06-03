'use client'

import { useState, useEffect } from 'react'
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

type Tournament = {
  id: string; name: string; code: string; stage1_deadline: string; admin_id: string
}

type Participant = {
  user_id: string
  paid: boolean
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

function score(pick: UserPick, match: Match) {
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
  const [myPicks, setMyPicks] = useState<UserPick[]>([])
  const [allPicks, setAllPicks] = useState<UserPick[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [isParticipant, setIsParticipant] = useState(false)
  const [myPickCount, setMyPickCount] = useState(0)

  useEffect(() => {
    if (!id) return
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      const [
        { data: t },
        { data: ps },
        { data: ms },
      ] = await Promise.all([
        supabase.from('prode_tournaments').select('*').eq('id', id).maybeSingle(),
        supabase.from('prode_participants')
          .select('user_id, paid, profiles(username, nombre, apellido)')
          .eq('tournament_id', id),
        supabase.from('prode_matches').select('*').order('sort_order'),
      ])

      setTournament(t)
      setMatches((ms ?? []) as Match[])

      if (user && ps) {
        const part = (ps as any[]).find(p => p.user_id === user.id)
        setIsParticipant(!!part)
      }

      if (user) {
        const { data: picks } = await supabase
          .from('prode_stage1_picks')
          .select('match_id, home_score, away_score, user_id')
          .eq('tournament_id', id)

        const allP = (picks ?? []) as UserPick[]
        setAllPicks(allP)
        const mine = allP.filter(p => p.user_id === user.id)
        setMyPicks(mine)
        setMyPickCount(mine.length)

        // Enrich participants with pick count
        if (ps) {
          const enriched = (ps as any[]).map(p => ({
            ...p,
            pick_count: allP.filter(pk => pk.user_id === p.user_id).length,
          }))
          setParticipants(enriched)
        }
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
      alert(`Sincronizados ${json.synced} partidos.`)
      router.refresh()
    } else {
      alert(`Error: ${json.error}`)
    }
    setSyncing(false)
  }

  const handleJoin = async () => {
    if (!user) { router.push('/login'); return }
    const { error } = await supabase
      .from('prode_participants')
      .insert({ tournament_id: id, user_id: user.id })
    if (!error) {
      setIsParticipant(true)
      window.location.reload()
    }
  }

  const isDeadlinePast = new Date() >= STAGE1_DEADLINE

  const groupMatches = matches.filter(m => m.stage === 'group')
  const totalGroupMatches = groupMatches.length
  const progress = totalGroupMatches > 0 ? Math.round((myPickCount / totalGroupMatches) * 100) : 0

  // Leaderboard
  const leaderboard = participants.map(p => {
    const name = p.profiles?.nombre
      ? `${p.profiles.nombre} ${p.profiles.apellido ?? ''}`.trim()
      : p.profiles?.username ?? 'Jugador'
    const userPicks = allPicks.filter(pk => pk.user_id === p.user_id)
    const pts = isDeadlinePast
      ? userPicks.reduce((acc, pk) => {
          const m = matches.find(m => m.id === pk.match_id)
          if (!m) return acc
          const s = score(pk, m)
          return acc + (s ?? 0)
        }, 0)
      : null
    return { user_id: p.user_id, name, pick_count: p.pick_count ?? 0, pts, paid: p.paid }
  }).sort((a, b) => {
    if (a.pts !== null && b.pts !== null) return b.pts - a.pts
    return (b.pick_count ?? 0) - (a.pick_count ?? 0)
  })

  const TAB_BTN = (t: typeof tab, label: string) => (
    <button
      onClick={() => setTab(t)}
      style={{
        flex: 1, padding: '10px 0', background: tab === t ? GOLD : 'transparent',
        color: tab === t ? '#01050F' : MUTED, border: 'none', borderRadius: 8,
        fontFamily: FONT, fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  )

  if (loading) {
    return (
      <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: FONT, color: MUTED, fontSize: 13 }}>Cargando...</div>
      </div>
    )
  }

  if (!tournament) {
    return (
      <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: TEXT, fontSize: 15, marginBottom: 12 }}>Torneo no encontrado.</div>
          <Link href="/prode" style={{ color: MUTED, fontSize: 13 }}>← Volver</Link>
        </div>
      </div>
    )
  }

  const isAdmin = user?.id === tournament.admin_id

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .prog-bar { height: 6px; background: #1e1736; border-radius: 3px; overflow: hidden; }
        .prog-fill { height: 100%; background: ${GOLD}; border-radius: 3px; transition: width 0.4s; }
        .match-row { display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid #111827; }
        .match-row:last-child { border-bottom: none; }
        .flag { width: 22px; height: 22px; border-radius: 50%; object-fit: cover; background: #1e1736; flex-shrink: 0; }
        .lb-row { display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid #111827; }
        .lb-row:last-child { border-bottom: none; }
      `}</style>

      <div style={{ background: BG, minHeight: '100vh', fontFamily: FONT }}>

        {/* Header */}
        <nav style={{ background: BG, borderBottom: `1px solid ${BORDER}`, padding: '12px 0' }}>
          <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/prode" style={{ color: MUTED, textDecoration: 'none', fontSize: 20, lineHeight: 1 }}>←</Link>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>{tournament.name}</div>
              <div style={{ fontSize: 11, color: MUTED }}>Código: <span style={{ color: GOLD, fontWeight: 700 }}>{tournament.code}</span> · {participants.length} participantes</div>
            </div>
            {isAdmin && (
              <button
                onClick={handleSync}
                disabled={syncing}
                style={{ padding: '6px 12px', background: '#1e1736', color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 8, fontFamily: FONT, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                {syncing ? '...' : 'Sync'}
              </button>
            )}
          </div>
        </nav>

        {/* Tab bar */}
        <div style={{ background: BG, borderBottom: `1px solid ${BORDER}`, padding: '8px 18px' }}>
          <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', gap: 4, background: '#0a0a14', borderRadius: 10, padding: 4 }}>
            {TAB_BTN('predecir', 'Predecir')}
            {TAB_BTN('fixture', 'Fixture')}
            {TAB_BTN('tabla', 'Tabla')}
            {TAB_BTN('info', 'Info')}
          </div>
        </div>

        <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 18px' }}>

          {/* ── PREDECIR ── */}
          {tab === 'predecir' && (
            <div>
              {!user ? (
                <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 24, textAlign: 'center' }}>
                  <div style={{ fontSize: 15, color: TEXT, marginBottom: 8 }}>Iniciá sesión para predecir</div>
                  <Link href="/login" style={{ display: 'inline-block', padding: '10px 24px', background: ACCENT, color: TEXT, fontFamily: FONT, fontSize: 13, fontWeight: 700, borderRadius: 10, textDecoration: 'none', marginTop: 4 }}>
                    Iniciar sesión
                  </Link>
                </div>
              ) : !isParticipant ? (
                <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 24, textAlign: 'center' }}>
                  <div style={{ fontSize: 15, color: TEXT, marginBottom: 6 }}>¿Querés participar?</div>
                  <div style={{ fontSize: 12, color: MUTED, marginBottom: 16 }}>Uníte para hacer tus predicciones.</div>
                  <button onClick={handleJoin} style={{ padding: '11px 28px', background: GOLD, color: '#01050F', border: 'none', borderRadius: 10, fontFamily: FONT, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                    Unirme al torneo
                  </button>
                </div>
              ) : (
                <>
                  {/* Progress */}
                  <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '18px', marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Predicciones — Fase de grupos</div>
                      <div style={{ fontSize: 12, color: GOLD, fontWeight: 700 }}>{myPickCount}/{totalGroupMatches}</div>
                    </div>
                    <div className="prog-bar" style={{ marginBottom: 6 }}>
                      <div className="prog-fill" style={{ width: `${progress}%` }} />
                    </div>
                    <div style={{ fontSize: 11, color: MUTED }}>{progress}% completado</div>
                  </div>

                  {isDeadlinePast ? (
                    <div style={{ background: '#1a0808', border: '1px solid #4a1010', borderRadius: 14, padding: '14px 18px', marginBottom: 14, fontSize: 13, color: '#f87171' }}>
                      Las predicciones de fase de grupos están cerradas.
                    </div>
                  ) : (
                    <Link href={`/prode/${id}/predecir`} style={{ display: 'block', padding: '15px 18px', background: GOLD, color: '#01050F', borderRadius: 14, textDecoration: 'none', textAlign: 'center', fontWeight: 700, fontSize: 15, marginBottom: 14 }}>
                      {myPickCount === 0 ? '⚽ Comenzar a predecir' : '✏️ Continuar predicciones'}
                    </Link>
                  )}

                  <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '16px 18px' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 10 }}>Sistema de puntos</div>
                    {[
                      ['3 pts', 'Resultado exacto (ej: 2-1)'],
                      ['1 pt', 'Resultado correcto (ganador o empate)'],
                      ['0 pts', 'Resultado incorrecto'],
                    ].map(([pts, desc]) => (
                      <div key={pts} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, width: 40, flexShrink: 0 }}>{pts}</div>
                        <div style={{ fontSize: 12, color: MUTED }}>{desc}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── FIXTURE ── */}
          {tab === 'fixture' && (
            <div>
              {matches.length === 0 ? (
                <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 24, textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: MUTED }}>No hay partidos cargados todavía.</div>
                  {isAdmin && <div style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>Usá el botón "Sync" para cargar los partidos desde la API.</div>}
                </div>
              ) : (
                <>
                  {GROUPS.map(g => {
                    const gm = matches.filter(m => m.group_name === g).sort((a, b) => a.sort_order - b.sort_order)
                    if (gm.length === 0) return null
                    return (
                      <div key={g} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px 16px', marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: 1, marginBottom: 10 }}>GRUPO {g}</div>
                        {gm.map(m => (
                          <div key={m.id} className="match-row">
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                              <img src={m.home_flag} alt="" className="flag" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                              <span style={{ fontSize: 13, color: TEXT, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.home_team}</span>
                            </div>
                            <div style={{ padding: '0 10px', textAlign: 'center', flexShrink: 0 }}>
                              {m.status === 'FT' || m.status === 'AET' || m.status === 'PEN' ? (
                                <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{m.home_score} - {m.away_score}</span>
                              ) : (
                                <span style={{ fontSize: 11, color: MUTED }}>{fmtDate(m.kickoff)}</span>
                              )}
                            </div>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', minWidth: 0 }}>
                              <span style={{ fontSize: 13, color: TEXT, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{m.away_team}</span>
                              <img src={m.away_flag} alt="" className="flag" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })}

                  {/* Knockout stages */}
                  {['r32', 'r16', 'qf', 'sf', '3rd', 'final'].map(stage => {
                    const sm = matches.filter(m => m.stage === stage).sort((a, b) => a.sort_order - b.sort_order)
                    if (sm.length === 0) return null
                    return (
                      <div key={stage} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px 16px', marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: 1, marginBottom: 10 }}>{STAGE_LABEL[stage]?.toUpperCase()}</div>
                        {sm.map(m => (
                          <div key={m.id} className="match-row">
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <img src={m.home_flag} alt="" className="flag" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                              <span style={{ fontSize: 13, color: TEXT, fontWeight: 500 }}>{m.home_team}</span>
                            </div>
                            <div style={{ padding: '0 10px', textAlign: 'center' }}>
                              {m.status === 'FT' || m.status === 'AET' || m.status === 'PEN' ? (
                                <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{m.home_score} - {m.away_score}</span>
                              ) : (
                                <span style={{ fontSize: 11, color: MUTED }}>{fmtDate(m.kickoff)}</span>
                              )}
                            </div>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                              <span style={{ fontSize: 13, color: TEXT, fontWeight: 500, textAlign: 'right' }}>{m.away_team}</span>
                              <img src={m.away_flag} alt="" className="flag" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
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
              <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 8, marginBottom: 4, borderBottom: `1px solid ${BORDER}` }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, width: 24 }}>#</div>
                  <div style={{ flex: 1, fontSize: 10, fontWeight: 700, color: MUTED }}>JUGADOR</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, width: 60, textAlign: 'center' }}>PICKS</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: isDeadlinePast ? GOLD : MUTED, width: 50, textAlign: 'center' }}>
                    {isDeadlinePast ? 'PTS' : 'PTS'}
                  </div>
                </div>
                {leaderboard.length === 0 ? (
                  <div style={{ fontSize: 12, color: MUTED, textAlign: 'center', paddingTop: 16 }}>Nadie se unió todavía.</div>
                ) : leaderboard.map((p, i) => (
                  <div key={p.user_id} className="lb-row">
                    <div style={{ fontSize: 13, fontWeight: 700, color: i < 3 ? GOLD : MUTED, width: 24 }}>{i + 1}</div>
                    <div style={{ flex: 1, fontSize: 13, color: p.user_id === user?.id ? GOLD : TEXT, fontWeight: p.user_id === user?.id ? 700 : 400 }}>
                      {p.name}{p.user_id === user?.id ? ' (vos)' : ''}
                    </div>
                    <div style={{ fontSize: 12, color: MUTED, width: 60, textAlign: 'center' }}>{p.pick_count}/{totalGroupMatches > 0 ? totalGroupMatches : '?'}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: isDeadlinePast ? TEXT : MUTED, width: 50, textAlign: 'center' }}>
                      {isDeadlinePast ? (p.pts ?? 0) : '—'}
                    </div>
                  </div>
                ))}
              </div>
              {!isDeadlinePast && (
                <div style={{ fontSize: 11, color: MUTED, textAlign: 'center', marginTop: 12 }}>Los puntos se calcularán una vez cierre el plazo de predicciones.</div>
              )}
            </div>
          )}

          {/* ── INFO ── */}
          {tab === 'info' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '16px 18px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 12 }}>Información del torneo</div>
                {[
                  ['Nombre', tournament.name],
                  ['Código', tournament.code],
                  ['Participantes', String(participants.length)],
                  ['Cierre fase grupos', new Date('2026-06-11T19:00:00Z').toLocaleString('es-AR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${BORDER}` }}>
                    <span style={{ fontSize: 12, color: MUTED }}>{label}</span>
                    <span style={{ fontSize: 13, color: TEXT, fontWeight: 600 }}>{value}</span>
                  </div>
                ))}
              </div>

              {participants.length > 0 && (
                <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '16px 18px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 12 }}>Participantes</div>
                  {participants.map(p => (
                    <div key={p.user_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                      <span style={{ fontSize: 13, color: p.user_id === user?.id ? GOLD : TEXT }}>
                        {p.profiles?.nombre ? `${p.profiles.nombre} ${p.profiles.apellido ?? ''}`.trim() : p.profiles?.username ?? 'Jugador'}
                        {p.user_id === user?.id ? ' (vos)' : ''}
                        {p.user_id === tournament.admin_id ? ' 👑' : ''}
                      </span>
                      <span style={{ fontSize: 11, color: p.paid ? '#4ade80' : MUTED }}>{p.paid ? '✓ Pagó' : 'Sin pagar'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </>
  )
}
