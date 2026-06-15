'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const FONT = "'Ubuntu', sans-serif"
const C = {
  bg: '#01050F', card: '#0d0d1a', border: '#1e1736',
  primary: '#055074', text: '#c1c1c6', muted: '#706c7e',
  accent: '#1e3a5f',
} as const

const AVATAR_COLORS = ['#04447b','#065c6c','#7c3aed','#b45309','#0369a1','#be123c','#15803d']

function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name?.substring(0, 2).toUpperCase() || '?'
  const color = AVATAR_COLORS[name?.charCodeAt(0) % AVATAR_COLORS.length] || '#04447b'
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.38, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
      {initials}
    </div>
  )
}

const GAME_ICONS: Record<string, string> = {
  golf: '⛳', berenjena: '🍆', truco: '🃏', generala: '🎲',
  wordle: '🔤', tabu: '🚫', mimica: '🎭', impostor: '🕵️',
}
const GAME_LABELS: Record<string, string> = {
  golf: 'Golf', berenjena: 'Berenjena', truco: 'Truco', generala: 'Generala',
  wordle: 'Wordle', tabu: 'Tabú', mimica: 'Mímica', impostor: 'El Impostor',
}

type Participant = { id: string; user_id: string | null; guest_name: string | null; player_type: string; profile?: { nombre: string; apellido: string; username: string } }
type GameSession = { id: string; game_type: string; played_at: string }
type Ranchada = {
  id: string; name: string | null; date: string; notes: string | null; created_at: string
  participants: Participant[]
  game_sessions: GameSession[]
}

function formatDate(d: string) {
  const date = new Date(d + 'T12:00:00')
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function participantName(p: Participant) {
  if (p.profile?.nombre) return `${p.profile.nombre} ${p.profile.apellido || ''}`.trim()
  if (p.profile?.username) return p.profile.username
  return p.guest_name || '?'
}

export default function RanchadasPage() {
  const supabase = createClient()
  const router = useRouter()
  const [ranchadas, setRanchadas] = useState<Ranchada[]>([])
  const [loading, setLoading] = useState(true)
  const [myId, setMyId] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setMyId(user.id)
      load(user.id)
    })
  }, [])

  const load = async (userId: string) => {
    setLoading(true)
    const { data } = await supabase
      .from('ranchadas')
      .select(`
        id, name, date, notes, created_at,
        participants:ranchada_participants(
          id, user_id, guest_name, player_type,
          profile:profiles!ranchada_participants_user_id_fkey(nombre, apellido, username)
        ),
        game_sessions(id, game_type, played_at)
      `)
      .order('date', { ascending: false })

    setRanchadas((data as any) || [])
    setLoading(false)
  }

  const grouped = ranchadas.reduce<Record<string, Ranchada[]>>((acc, r) => {
    const year = r.date.substring(0, 4)
    if (!acc[year]) acc[year] = []
    acc[year].push(r)
    return acc
  }, {})

  const years = Object.keys(grouped).sort((a, b) => Number(b) - Number(a))

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
      <div style={{ background: C.bg, minHeight: '100vh', fontFamily: FONT }}>

        {/* Nav */}
        <nav style={{ background: C.bg, borderBottom: `1px solid ${C.border}`, padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 480, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 30, height: 30, background: C.primary, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="#c1c1c6" strokeWidth="2"/><circle cx="9" cy="7" r="4" stroke="#c1c1c6" strokeWidth="2"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="#c1c1c6" strokeWidth="2"/></svg>
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Ranchadas</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => router.push('/')} style={{ padding: '6px 12px', background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: FONT }}>← Inicio</button>
            <button onClick={() => router.push('/ranchadas/nueva')} style={{ padding: '6px 14px', background: C.primary, color: C.text, border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>+ Nueva</button>
          </div>
        </nav>

        <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 18px' }}>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted, fontSize: 13 }}>Cargando...</div>
          ) : ranchadas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🏠</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 8 }}>Todavía no ranachaste</div>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 24 }}>Registrá tu primera juntada y empezá a llevar el historial</div>
              <button onClick={() => router.push('/ranchadas/nueva')} style={{ padding: '12px 28px', background: C.primary, color: C.text, border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>Crear ranchada</button>
            </div>
          ) : (
            years.map(year => (
              <div key={year} style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 10 }}>{year}</div>
                {grouped[year].map(r => {
                  const others = r.participants.filter(p => p.user_id !== myId)
                  const gameTypes = [...new Set(r.game_sessions.map(g => g.game_type))]
                  return (
                    <Link key={r.id} href={`/ranchadas/${r.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', marginBottom: 8, cursor: 'pointer', transition: 'border-color 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = C.primary)}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                              {r.name || 'Ranchada'}
                            </div>
                            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{formatDate(r.date)}</div>
                          </div>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            {gameTypes.map(t => (
                              <span key={t} style={{ fontSize: 16 }} title={GAME_LABELS[t]}>{GAME_ICONS[t] || '🎮'}</span>
                            ))}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', gap: -6 }}>
                            {others.slice(0, 5).map((p, i) => (
                              <div key={p.id} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: 5 - i }}>
                                <Avatar name={participantName(p)} size={26} />
                              </div>
                            ))}
                            {others.length > 5 && (
                              <div style={{ marginLeft: -8, width: 26, height: 26, borderRadius: '50%', background: C.border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: C.muted }}>
                                +{others.length - 5}
                              </div>
                            )}
                            {others.length === 0 && (
                              <span style={{ fontSize: 11, color: C.muted }}>Solo vos</span>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: C.muted }}>
                            <span>{r.participants.length} jugador{r.participants.length !== 1 ? 'es' : ''}</span>
                            <span>{r.game_sessions.length} partida{r.game_sessions.length !== 1 ? 's' : ''}</span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}
