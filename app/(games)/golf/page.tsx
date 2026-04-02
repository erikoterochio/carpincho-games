'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

// ─────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────

type CourseInfo = { name: string; city: string | null }
type FormatInfo = { format_type: string; display_name: string | null }
type PlayerInfo = { id: string }

type Tournament = {
  id: string
  name: string
  status: 'setup' | 'active' | 'finished'
  holes_config: '18' | 'front9' | 'back9'
  num_rounds: number
  invite_code: string
  created_at: string
  golf_courses: CourseInfo | null
  golf_formats: FormatInfo[]
  golf_players: PlayerInfo[]
}

// ─────────────────────────────────────────────
// Constantes de diseño (inline styles — ver SKILL)
// ─────────────────────────────────────────────

const FONT = "'Ubuntu', sans-serif"

const S = {
  page: {
    background: '#01050F',
    minHeight: '100vh',
    fontFamily: FONT,
    color: '#c1c1c6',
  } as React.CSSProperties,

  wrap: {
    maxWidth: 480,
    margin: '0 auto',
    padding: '0 0 32px',
  } as React.CSSProperties,

  // Navbar
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 18px',
    borderBottom: '1px solid #1e1736',
  } as React.CSSProperties,

  navBack: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 6px 4px 0',
    color: '#706c7e',
    display: 'flex',
    alignItems: 'center',
  } as React.CSSProperties,

  navTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: '#c1c1c6',
    fontFamily: FONT,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  } as React.CSSProperties,

  // Hero CTAs
  ctaSection: {
    padding: '20px 18px 0',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
  } as React.CSSProperties,

  btnPrimary: {
    width: '100%',
    padding: '14px 18px',
    background: '#055074',
    color: '#c1c1c6',
    border: 'none',
    borderRadius: 12,
    fontFamily: FONT,
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    textDecoration: 'none',
  } as React.CSSProperties,

  btnRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
  } as React.CSSProperties,

  btnSecondary: {
    padding: '12px 14px',
    background: '#0d0d1a',
    color: '#c1c1c6',
    border: '1px solid #1e1736',
    borderRadius: 12,
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    textDecoration: 'none',
    textAlign: 'center' as const,
  } as React.CSSProperties,

  // Invite input
  inviteBox: {
    background: '#0d0d1a',
    border: '1px solid #1e1736',
    borderRadius: 12,
    padding: '12px 14px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  } as React.CSSProperties,

  inviteInput: {
    flex: 1,
    background: 'none',
    border: 'none',
    outline: 'none',
    fontFamily: FONT,
    fontSize: 15,
    fontWeight: 700,
    color: '#c1c1c6',
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
  } as React.CSSProperties,

  inviteBtn: {
    padding: '8px 14px',
    background: '#055074',
    color: '#c1c1c6',
    border: 'none',
    borderRadius: 8,
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  } as React.CSSProperties,

  // Divisor de sección
  sep: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '20px 18px 12px',
  } as React.CSSProperties,

  sepLine: {
    flex: 1,
    height: 1,
    background: '#1e1736',
  } as React.CSSProperties,

  sepText: {
    fontSize: 10,
    fontWeight: 700,
    color: '#706c7e',
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    fontFamily: FONT,
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,

  // Tabs
  tabs: {
    display: 'flex',
    padding: '0 18px',
    borderBottom: '1px solid #1e1736',
    marginBottom: 4,
  } as React.CSSProperties,

  tab: (active: boolean): React.CSSProperties => ({
    padding: '12px 16px 10px',
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: active ? 700 : 500,
    color: active ? '#c1c1c6' : '#706c7e',
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid #055074' : '2px solid transparent',
    cursor: 'pointer',
    marginBottom: -1,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  }),

  badge: (n: number): React.CSSProperties => ({
    display: n > 0 ? 'flex' : 'none',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#055074',
    color: '#c1c1c6',
    fontSize: 10,
    fontWeight: 700,
    width: 17,
    height: 17,
    borderRadius: 10,
  }),

  // Tarjeta de torneo
  card: (active: boolean): React.CSSProperties => ({
    margin: '0 18px 10px',
    background: '#0d0d1a',
    border: `1px solid ${active ? '#055074' : '#1e1736'}`,
    borderRadius: 14,
    padding: '14px 16px',
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'block',
  }),

  cardHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 6,
  } as React.CSSProperties,

  cardName: {
    fontSize: 16,
    fontWeight: 700,
    color: '#c1c1c6',
    fontFamily: FONT,
    lineHeight: 1.3,
    flex: 1,
    marginRight: 10,
  } as React.CSSProperties,

  cardCourse: {
    fontSize: 12,
    color: '#706c7e',
    fontFamily: FONT,
    marginBottom: 10,
  } as React.CSSProperties,

  cardMeta: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    gap: 6,
    marginTop: 10,
  } as React.CSSProperties,

  metaPill: (color: string): React.CSSProperties => ({
    fontSize: 11,
    fontWeight: 600,
    color,
    background: color + '18',
    border: `1px solid ${color}40`,
    borderRadius: 6,
    padding: '3px 8px',
    fontFamily: FONT,
  }),

  metaGrey: {
    fontSize: 11,
    color: '#706c7e',
    fontFamily: FONT,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  } as React.CSSProperties,

  // Estado del torneo
  statusBadge: (status: string): React.CSSProperties => {
    const cfg = STATUS_MAP[status as keyof typeof STATUS_MAP] ?? STATUS_MAP.setup
    return {
      fontSize: 10,
      fontWeight: 700,
      color: cfg.color,
      background: cfg.bg,
      borderRadius: 6,
      padding: '3px 8px',
      fontFamily: FONT,
      whiteSpace: 'nowrap' as const,
      flexShrink: 0,
    }
  },

  // Empty state
  empty: {
    textAlign: 'center' as const,
    padding: '40px 24px',
    color: '#706c7e',
    fontFamily: FONT,
  } as React.CSSProperties,
}

// ─────────────────────────────────────────────
// Datos de modalidades y estados
// ─────────────────────────────────────────────

const FORMAT_MAP: Record<string, { label: string; color: string; desc: string }> = {
  stroke: {
    label: 'Medal',
    color: '#5b9bd5',
    desc: 'Stroke play. Suma golpes totales, resta tu playing handicap. Gana el menor nett.',
  },
  stableford: {
    label: 'Stableford',
    color: '#4caf84',
    desc: 'Puntos por hoyo vs par. Birdie=3pts, Par=2pts, Bogey=1pt. El handicap ajusta el par por hoyo. Gana el mayor.',
  },
  match: {
    label: 'Match',
    color: '#e07b4f',
    desc: 'Hoyo a hoyo. El jugador de mayor handicap recibe golpes en los hoyos más difíciles. Gana quien gane más hoyos.',
  },
  fourball_classic: {
    label: 'Fourball',
    color: '#9b72cf',
    desc: 'Clásico. 2v2. Se cuenta el mejor score (nett) de la pareja por hoyo. Se juega como match entre las dos parejas.',
  },
  fourball_american: {
    label: 'Americano',
    color: '#cf9e3a',
    desc: 'Americano. Cada jugador acumula puntos Stableford. Hay resultado individual Y de pareja simultáneamente.',
  },
  best_line: {
    label: 'Laguneada',
    color: '#c15b8a',
    desc: 'El mejor score neto de la línea (grupo de 4) en cada hoyo. Compiten las líneas entre sí.',
  },
}

const STATUS_MAP = {
  setup:    { label: 'Configurando', color: '#706c7e', bg: '#1a1a2e' },
  active:   { label: 'En curso',     color: '#4ade80', bg: '#0a2a1a' },
  finished: { label: 'Finalizado',   color: '#706c7e', bg: '#111111' },
}

const HOLES_LABEL: Record<string, string> = {
  '18':    '18 hoyos',
  front9:  'Primeros 9',
  back9:   'Segundos 9',
}

// ─────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────

export default function GolfPage() {
  const router = useRouter()
  const supabase = createClient()

  const [user, setUser] = useState<{ id: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [tab, setTab] = useState<'active' | 'finished'>('active')
  const [showInvite, setShowInvite] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [inviteError, setInviteError] = useState('')
  const [joining, startJoining] = useTransition()

  // ── Inicialización
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user ? { id: user.id } : null)
      if (user) await fetchTournaments(user.id)
      setLoading(false)
    }
    init()
  }, [])

  // ── Fetch torneos del usuario
  const fetchTournaments = async (userId: string) => {
    // 1. Torneos creados por el usuario
    const { data: created } = await supabase
      .from('golf_tournaments')
      .select(`
        id, name, status, holes_config, num_rounds, invite_code, created_at,
        golf_courses(name, city),
        golf_formats(format_type, display_name),
        golf_players(id)
      `)
      .eq('created_by', userId)
      .order('created_at', { ascending: false })

    // 2. Torneos donde el usuario es jugador (pero no creador)
    const { data: playerRows } = await supabase
      .from('golf_players')
      .select('tournament_id')
      .eq('user_id', userId)

    const createdIds = new Set((created ?? []).map((t: any) => t.id))
    const joinedIds = (playerRows ?? [])
      .map((r: any) => r.tournament_id)
      .filter((id: string) => !createdIds.has(id))

    let joined: any[] = []
    if (joinedIds.length > 0) {
      const { data } = await supabase
        .from('golf_tournaments')
        .select(`
          id, name, status, holes_config, num_rounds, invite_code, created_at,
          golf_courses(name, city),
          golf_formats(format_type, display_name),
          golf_players(id)
        `)
        .in('id', joinedIds)
        .order('created_at', { ascending: false })
      joined = data ?? []
    }

    setTournaments([...(created ?? []), ...joined] as Tournament[])
  }

  // ── Unirse por código
  const handleJoin = () => {
    startJoining(async () => {
      const code = inviteCode.trim().toUpperCase()
      if (code.length < 4) {
        setInviteError('Ingresá el código completo')
        return
      }
      const { data, error } = await supabase
        .from('golf_tournaments')
        .select('id')
        .eq('invite_code', code)
        .single()

      if (error || !data) {
        setInviteError('Código inválido o torneo no encontrado')
        return
      }
      router.push(`/golf/${data.id}`)
    })
  }

  // ── Listas filtradas
  const active   = tournaments.filter(t => t.status !== 'finished')
  const finished = tournaments.filter(t => t.status === 'finished')
  const shown    = tab === 'active' ? active : finished

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        a { text-decoration: none; }
        input::placeholder { color: #4a4a55; }
        input:focus { outline: none; }
      `}</style>

      <div style={S.page}>
        <div style={S.wrap}>

          {/* ── Navbar */}
          <div style={S.nav}>
            <Link href="/" style={S.navBack}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M15 18l-6-6 6-6" stroke="#706c7e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
            <div style={S.navTitle}>
              {/* Ícono bandera de golf */}
              <div style={{ width: 30, height: 30, background: '#055074', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                  <line x1="6" y1="3" x2="6" y2="21" stroke="#c1c1c6" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M6 3l12 4.5L6 12" fill="#c1c1c6"/>
                  <circle cx="6" cy="21" r="1.5" fill="#706c7e"/>
                  <line x1="4" y1="21" x2="20" y2="21" stroke="#1e1736" strokeWidth="1.5"/>
                </svg>
              </div>
              Golf
            </div>
          </div>

          {/* ── CTAs */}
          <div style={S.ctaSection}>

            {/* Nueva partida — rápida, 1 ronda */}
            <Link href="/golf/nueva-partida" style={S.btnPrimary}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="#c1c1c6" strokeWidth="2"/>
                <circle cx="12" cy="12" r="3" fill="#c1c1c6"/>
                <path d="M12 3v2M12 19v2M3 12h2M19 12h2" stroke="#c1c1c6" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              Nueva partida
            </Link>

            <div style={S.btnRow}>
              {/* Nuevo torneo — múltiples rondas */}
              <Link href="/golf/nuevo-torneo" style={S.btnSecondary}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path d="M8 21V3M16 21v-8" stroke="#c1c1c6" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M4 21h16" stroke="#706c7e" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M8 3l8 5-8 5" stroke="#706c7e" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
                Nuevo torneo
              </Link>

              {/* Unirse con código */}
              <button
                style={{ ...S.btnSecondary, border: showInvite ? '1px solid #055074' : '1px solid #1e1736' }}
                onClick={() => { setShowInvite(!showInvite); setInviteCode(''); setInviteError('') }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="11" width="18" height="11" rx="2" stroke="#c1c1c6" strokeWidth="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#706c7e" strokeWidth="2" strokeLinecap="round"/>
                  <circle cx="12" cy="16" r="1.5" fill="#c1c1c6"/>
                </svg>
                Unirme
              </button>
            </div>

            {/* Input de código de invitación */}
            {showInvite && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={S.inviteBox}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                    <rect x="3" y="11" width="18" height="11" rx="2" stroke="#706c7e" strokeWidth="1.8"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#706c7e" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                  <input
                    style={S.inviteInput}
                    placeholder="CÓDIGO"
                    maxLength={8}
                    value={inviteCode}
                    onChange={e => { setInviteCode(e.target.value.toUpperCase()); setInviteError('') }}
                    onKeyDown={e => e.key === 'Enter' && handleJoin()}
                    autoFocus
                  />
                  <button style={S.inviteBtn} onClick={handleJoin} disabled={joining}>
                    {joining ? '...' : 'Entrar'}
                  </button>
                </div>
                {inviteError && (
                  <p style={{ fontFamily: FONT, fontSize: 12, color: '#f87171', margin: '0 2px' }}>
                    {inviteError}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ── Leyenda de modalidades (acordeón rápido) */}
          <FormatsInfo />

          {/* ── Lista de torneos */}
          {user ? (
            <>
              <div style={S.sep}>
                <div style={S.sepLine}/>
                <span style={S.sepText}>Mis torneos y partidas</span>
                <div style={S.sepLine}/>
              </div>

              {loading ? (
                <div style={{ ...S.empty, paddingTop: 24 }}>
                  <p style={{ fontSize: 13 }}>Cargando...</p>
                </div>
              ) : (
                <>
                  {/* Tabs */}
                  <div style={S.tabs}>
                    <button style={S.tab(tab === 'active')} onClick={() => setTab('active')}>
                      Activos
                      <span style={S.badge(active.length)}>{active.length}</span>
                    </button>
                    <button style={S.tab(tab === 'finished')} onClick={() => setTab('finished')}>
                      Finalizados
                      <span style={S.badge(finished.length)}>{finished.length}</span>
                    </button>
                  </div>

                  {/* Cards */}
                  <div style={{ marginTop: 12 }}>
                    {shown.length === 0 ? (
                      <div style={S.empty}>
                        <div style={{ fontSize: 36, marginBottom: 12 }}>⛳</div>
                        <p style={{ fontSize: 14, fontWeight: 600, color: '#c1c1c6', marginBottom: 6 }}>
                          {tab === 'active' ? 'No hay partidas activas' : 'No hay partidas finalizadas'}
                        </p>
                        <p style={{ fontSize: 12 }}>
                          {tab === 'active' ? 'Creá una nueva partida o unite con un código' : 'Acá van a aparecer tus partidas ya jugadas'}
                        </p>
                      </div>
                    ) : (
                      shown.map(t => <TournamentCard key={t.id} t={t} />)
                    )}
                  </div>
                </>
              )}
            </>
          ) : (
            // Usuario no logueado
            <div style={{ margin: '24px 18px 0', background: '#0d0d1a', border: '1px solid #1e1736', borderRadius: 14, padding: '20px 18px', textAlign: 'center' }}>
              <p style={{ fontFamily: FONT, fontSize: 14, fontWeight: 600, color: '#c1c1c6', marginBottom: 8 }}>
                Iniciá sesión para guardar tus partidas
              </p>
              <p style={{ fontFamily: FONT, fontSize: 12, color: '#706c7e', marginBottom: 16 }}>
                Sin cuenta podés jugar, pero los resultados no se guardan
              </p>
              <Link href="/login" style={{ ...S.btnPrimary, display: 'inline-flex', width: 'auto', padding: '10px 24px', fontSize: 14 }}>
                Iniciar sesión
              </Link>
            </div>
          )}

        </div>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────
// Card individual de torneo
// ─────────────────────────────────────────────

function TournamentCard({ t }: { t: Tournament }) {
  const isActive = t.status === 'active'
  const statusCfg = STATUS_MAP[t.status] ?? STATUS_MAP.setup
  const courseName = t.golf_courses?.name ?? 'Sin cancha'
  const courseCity = t.golf_courses?.city

  return (
    <Link href={`/golf/${t.id}`} style={S.card(isActive)}>
      <div style={S.cardHeader}>
        <span style={S.cardName}>{t.name}</span>
        <span style={S.statusBadge(t.status)}>{statusCfg.label}</span>
      </div>

      <div style={S.cardCourse}>
        {courseName}{courseCity ? ` · ${courseCity}` : ''}
      </div>

      {/* Modalidades activas */}
      {t.golf_formats.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
          {t.golf_formats.map((f, i) => {
            const fmt = FORMAT_MAP[f.format_type]
            if (!fmt) return null
            return (
              <span key={i} style={S.metaPill(fmt.color)}>
                {f.display_name ?? fmt.label}
              </span>
            )
          })}
        </div>
      )}

      {/* Meta */}
      <div style={S.cardMeta}>
        <span style={S.metaGrey}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="#706c7e" strokeWidth="1.8"/>
            <circle cx="12" cy="12" r="2.5" fill="#706c7e"/>
          </svg>
          {HOLES_LABEL[t.holes_config] ?? t.holes_config}
        </span>

        {t.num_rounds > 1 && (
          <span style={S.metaGrey}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M8 21V3M16 21v-8" stroke="#706c7e" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            {t.num_rounds} rondas
          </span>
        )}

        <span style={S.metaGrey}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="#706c7e" strokeWidth="1.8" strokeLinecap="round"/>
            <circle cx="9" cy="7" r="4" stroke="#706c7e" strokeWidth="1.8"/>
          </svg>
          {t.golf_players.length} jugadores
        </span>

        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#4a4a55', fontFamily: FONT }}>
          {formatDate(t.created_at)}
        </span>
      </div>
    </Link>
  )
}

// ─────────────────────────────────────────────
// Leyenda de modalidades (expandible)
// ─────────────────────────────────────────────

function FormatsInfo() {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ margin: '16px 18px 0', background: '#0d0d1a', border: '1px solid #1e1736', borderRadius: 12 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          fontFamily: FONT,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: '#c1c1c6', display: 'flex', alignItems: 'center', gap: 7 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#706c7e" strokeWidth="1.8"/>
            <path d="M12 8v5M12 16h.01" stroke="#706c7e" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          ¿Cómo se juegan las modalidades?
        </span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
        >
          <path d="M6 9l6 6 6-6" stroke="#706c7e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div style={{ padding: '0 16px 14px', borderTop: '1px solid #1e1736', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Object.entries(FORMAT_MAP).map(([key, fmt]) => (
            <div key={key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{
                fontSize: 10, fontWeight: 700, color: fmt.color, background: fmt.color + '18',
                border: `1px solid ${fmt.color}40`, borderRadius: 5, padding: '2px 7px',
                fontFamily: FONT, flexShrink: 0, marginTop: 1, whiteSpace: 'nowrap',
              }}>
                {fmt.label}
              </span>
              <p style={{ fontFamily: FONT, fontSize: 12, color: '#706c7e', margin: 0, lineHeight: 1.5 }}>
                {fmt.desc}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / 1000

  if (diff < 86400)   return 'Hoy'
  if (diff < 172800)  return 'Ayer'
  if (diff < 604800)  return `Hace ${Math.floor(diff / 86400)} días`

  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}