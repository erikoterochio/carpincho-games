'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'

const FONT = "'Ubuntu', sans-serif"
const C = {
  bg: '#01050F', card: '#0d0d1a', border: '#1e1736',
  primary: '#055074', text: '#c1c1c6', muted: '#706c7e',
  success: '#4ade80', danger: '#f87171',
} as const

const AVATAR_COLORS = ['#04447b','#065c6c','#7c3aed','#b45309','#0369a1','#be123c','#15803d']

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
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

type Profile = { nombre: string; apellido: string; username: string }
type Participant = { id: string; user_id: string | null; guest_name: string | null; player_type: string; profile?: Profile }
type SessionPlayer = { id: string; user_id: string | null; guest_name: string | null; is_winner: boolean; final_position: number | null; team: string | null; stats: Record<string, any>; profile?: Profile }
type GameSession = { id: string; game_type: string; played_at: string; notes: string | null; game_session_players: SessionPlayer[] }
type Ranchada = { id: string; name: string | null; date: string; notes: string | null; created_by: string; ranchada_participants: Participant[]; game_sessions: GameSession[] }

function formatDate(d: string) {
  const date = new Date(d + 'T12:00:00')
  return date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function participantName(p: { user_id: string | null; guest_name: string | null; profile?: Profile }) {
  if (p.profile?.nombre) return `${p.profile.nombre} ${p.profile.apellido || ''}`.trim()
  if (p.profile?.username) return p.profile.username
  return p.guest_name || '?'
}

// Render stats en lenguaje humano según tipo de juego
function renderStats(game_type: string, player: SessionPlayer) {
  const s = player.stats || {}
  const parts: string[] = []

  if (game_type === 'berenjena') {
    if (s.fium) parts.push(`💨 ${s.fium} fium${s.fium !== 1 ? 's' : ''}`)
    if (s.final_played) parts.push(`🏆 ${s.final_played} final${s.final_played !== 1 ? 'es' : ''}`)
    if (s.last_place) parts.push(`⬇️ ${s.last_place}× último`)
  } else if (game_type === 'truco') {
    if (s.durmio_afuera) parts.push(`💤 ${s.durmio_afuera}× rival durmió afuera`)
    if (s.durmio_palier) parts.push(`🚪 ${s.durmio_palier}× en el palier`)
  } else if (game_type === 'generala') {
    if (s.generala) parts.push(`🎯 ${s.generala} generala${s.generala !== 1 ? 's' : ''}`)
    if (s.escalera) parts.push(`📈 ${s.escalera} escalera${s.escalera !== 1 ? 's' : ''}`)
    if (s.max_score) parts.push(`⭐ Máx: ${s.max_score} pts`)
  }

  return parts.join('  ·  ')
}

export default function RanchadaDetailPage() {
  const supabase = createClient()
  const router = useRouter()
  const { id } = useParams<{ id: string }>()

  const [ranchada, setRanchada] = useState<Ranchada | null>(null)
  const [myId, setMyId] = useState('')
  const [loading, setLoading] = useState(true)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setMyId(user.id)
      load()
    })
  }, [id])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('ranchadas')
      .select(`
        id, name, date, notes, created_by,
        ranchada_participants(
          id, user_id, guest_name, player_type,
          profile:profiles!ranchada_participants_user_id_fkey(nombre, apellido, username)
        ),
        game_sessions(
          id, game_type, played_at, notes,
          game_session_players(
            id, user_id, guest_name, is_winner, final_position, team, stats,
            profile:profiles!game_session_players_user_id_fkey(nombre, apellido, username)
          )
        )
      `)
      .eq('id', id)
      .single()

    setRanchada(data as any)
    setLoading(false)
  }

  const handleDelete = async () => {
    if (!ranchada || ranchada.created_by !== myId) return
    setDeleting(true)
    await supabase.from('ranchadas').delete().eq('id', id)
    router.push('/ranchadas')
  }

  if (loading) {
    return (
      <>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
        <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, color: C.muted }}>Cargando...</div>
      </>
    )
  }

  if (!ranchada) {
    return (
      <>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
        <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, color: C.muted }}>Ranchada no encontrada</div>
      </>
    )
  }

  const isOwner = ranchada.created_by === myId
  const sortedSessions = [...ranchada.game_sessions].sort((a, b) => new Date(b.played_at).getTime() - new Date(a.played_at).getTime())

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
      <div style={{ background: C.bg, minHeight: '100vh', fontFamily: FONT, paddingBottom: 40 }}>

        {/* Nav */}
        <nav style={{ background: C.bg, borderBottom: `1px solid ${C.border}`, padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 480, margin: '0 auto' }}>
          <button onClick={() => router.push('/ranchadas')} style={{ padding: '6px 12px', background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: FONT }}>← Ranchadas</button>
          {isOwner && (
            <button onClick={() => setShowDeleteConfirm(true)} style={{ padding: '6px 12px', background: 'transparent', color: C.danger, border: `1px solid #7f1d1d`, borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: FONT }}>Eliminar</button>
          )}
        </nav>

        <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 18px' }}>

          {/* Header */}
          <div style={{ marginBottom: 20 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 4 }}>
              {ranchada.name || 'Ranchada'}
            </h1>
            <div style={{ fontSize: 13, color: C.muted, textTransform: 'capitalize' }}>{formatDate(ranchada.date)}</div>
            {ranchada.notes && (
              <div style={{ marginTop: 10, fontSize: 13, color: '#8aa8cc', fontStyle: 'italic', lineHeight: 1.5 }}>{ranchada.notes}</div>
            )}
          </div>

          {/* Participantes */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 12 }}>
              Participantes · {ranchada.ranchada_participants.length}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {ranchada.ranchada_participants.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Avatar name={participantName(p)} size={32} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{participantName(p)}</div>
                    {p.player_type === 'guest' && <div style={{ fontSize: 10, color: C.muted }}>invitado</div>}
                    {p.player_type === 'owner' && <div style={{ fontSize: 10, color: C.primary }}>organizador</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Resumen de juegos */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '1px', textTransform: 'uppercase' }}>
                Partidas · {ranchada.game_sessions.length}
              </div>
              <a
                href={`/registrar-partida?ranchada=${id}`}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: C.primary, color: C.text, border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, textDecoration: 'none' }}
              >
                + Agregar
              </a>
            </div>

            {sortedSessions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: C.muted, fontSize: 13 }}>
                Todavía no hay partidas registradas en esta ranchada.
              </div>
            ) : (
              sortedSessions.map((session, si) => {
                const winners = session.game_session_players.filter(p => p.is_winner)
                const sortedPlayers = [...session.game_session_players].sort((a, b) => (a.final_position || 99) - (b.final_position || 99))
                return (
                  <div key={session.id} style={{ borderBottom: si < sortedSessions.length - 1 ? `1px solid ${C.border}` : 'none', paddingBottom: si < sortedSessions.length - 1 ? 14 : 0, marginBottom: si < sortedSessions.length - 1 ? 14 : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 20 }}>{GAME_ICONS[session.game_type] || '🎮'}</span>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{GAME_LABELS[session.game_type] || session.game_type}</div>
                        {session.notes && <div style={{ fontSize: 11, color: C.muted }}>{session.notes}</div>}
                      </div>
                    </div>

                    {sortedPlayers.map((sp, pi) => {
                      const name = participantName(sp)
                      const statsStr = renderStats(session.game_type, sp)
                      return (
                        <div key={sp.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: pi < sortedPlayers.length - 1 ? `1px solid #0d1a2e` : 'none' }}>
                          <div style={{ width: 22, textAlign: 'center', fontSize: 13, color: sp.is_winner ? C.success : C.muted, fontWeight: 700 }}>
                            {sp.final_position || pi + 1}
                          </div>
                          <Avatar name={name} size={28} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: sp.is_winner ? C.success : C.text }}>{name}{sp.is_winner ? ' 🏆' : ''}</div>
                            {statsStr && <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{statsStr}</div>}
                          </div>
                          {sp.team && <div style={{ fontSize: 11, color: C.muted, background: '#0d1a2e', borderRadius: 6, padding: '2px 8px' }}>Equipo {sp.team}</div>}
                        </div>
                      )
                    })}
                  </div>
                )
              })
            )}
          </div>

          {/* Stats rápidos */}
          {ranchada.game_sessions.length > 0 && (() => {
            const winCount: Record<string, number> = {}
            ranchada.game_sessions.forEach(gs => {
              gs.game_session_players.filter(p => p.is_winner).forEach(p => {
                const name = participantName(p)
                winCount[name] = (winCount[name] || 0) + 1
              })
            })
            const topWinners = Object.entries(winCount).sort((a, b) => b[1] - a[1]).slice(0, 3)
            if (topWinners.length === 0) return null
            return (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 12 }}>Más ganador de la ranchada</div>
                {topWinners.map(([name, wins], i) => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
                    <div style={{ fontSize: 16 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</div>
                    <Avatar name={name} size={28} />
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.text }}>{name}</div>
                    <div style={{ fontSize: 13, color: C.success, fontWeight: 700 }}>{wins} victoria{wins !== 1 ? 's' : ''}</div>
                  </div>
                ))}
              </div>
            )
          })()}

        </div>

        {/* Delete confirm modal */}
        {showDeleteConfirm && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '0 20px' }}>
            <div style={{ background: '#0d0d1a', border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, maxWidth: 340, width: '100%' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 8 }}>¿Eliminar ranchada?</div>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 20, lineHeight: 1.5 }}>
                Se eliminarán también todas las partidas y resultados registrados en esta juntada. Esta acción no se puede deshacer.
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setShowDeleteConfirm(false)} style={{ flex: 1, padding: 12, background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 9, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>Cancelar</button>
                <button onClick={handleDelete} disabled={deleting} style={{ flex: 1, padding: 12, background: '#7f1d1d', color: C.danger, border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
                  {deleting ? 'Eliminando...' : 'Sí, eliminar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
