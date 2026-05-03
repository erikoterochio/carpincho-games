'use client'

import { useState, useEffect, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'

const FONT = "'Ubuntu', sans-serif"
const C = {
  bg: '#01050F', card: '#0d0d1a', border: '#1e1736',
  primary: '#055074', text: '#c1c1c6', muted: '#706c7e',
  a: '#2563eb', b: '#dc2626',
} as const
const MAX = 30

type Player = { key: string; name: string; userId?: string }
type Ranchada = { id: string; name: string | null; date: string }
type Profile = { id: string; nombre: string; apellido: string; username: string }

const AVATAR_COLORS = ['#04447b', '#065c6c', '#7c3aed', '#b45309', '#0369a1', '#be123c', '#15803d']

function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const color = AVATAR_COLORS[(name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length]
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.36, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
      {name?.substring(0, 2).toUpperCase() || '?'}
    </div>
  )
}

function pName(p: Profile) {
  return p.nombre ? `${p.nombre} ${p.apellido || ''}`.trim() : p.username
}

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

// ── Shared nav back button ────────────────────────────────────────────────────
function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 5l-7 7 7 7" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </button>
  )
}

// ── Player chip ───────────────────────────────────────────────────────────────
function PlayerChip({ player, onRemove }: { player: Player; onRemove: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#1a1a2e', border: `1px solid ${C.border}`, borderRadius: 20, padding: '4px 8px 4px 5px' }}>
      <Avatar name={player.name} size={20} />
      <span style={{ fontSize: 12, color: C.text, fontFamily: FONT }}>{player.name}</span>
      <button onClick={onRemove} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '0 0 0 2px' }}>×</button>
    </div>
  )
}

// ── Add-player bottom sheet ───────────────────────────────────────────────────
function AddPlayerSheet({
  teamLabel, friends, taken,
  onAddFriend, onAddGuest, onClose,
}: {
  teamLabel: string
  friends: Profile[]
  taken: Set<string>
  onAddFriend: (p: Profile) => void
  onAddGuest: (name: string) => void
  onClose: () => void
}) {
  const [guest, setGuest] = useState('')
  const available = friends.filter(f => !taken.has(f.id))

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)' }} />
      <div
        style={{ position: 'relative', background: '#0d0d1a', borderRadius: '20px 20px 0 0', padding: '20px 20px 36px', width: '100%', maxWidth: 480, margin: '0 auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14 }}>
          Agregar a {teamLabel}
        </div>

        {/* Guest input */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            autoFocus
            value={guest}
            onChange={e => setGuest(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && guest.trim()) { onAddGuest(guest.trim()); setGuest('') } }}
            placeholder="Nombre del invitado..."
            style={{ flex: 1, padding: '9px 12px', background: '#080812', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, fontFamily: FONT, outline: 'none' }}
          />
          <button
            onClick={() => { if (guest.trim()) { onAddGuest(guest.trim()); setGuest('') } }}
            disabled={!guest.trim()}
            style={{ padding: '9px 14px', background: guest.trim() ? '#4c1d95' : C.border, color: guest.trim() ? '#fff' : C.muted, border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: guest.trim() ? 'pointer' : 'default', fontFamily: FONT }}
          >
            Agregar
          </button>
        </div>

        {available.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Amigos</div>
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              {available.map(f => (
                <div
                  key={f.id}
                  onClick={() => onAddFriend(f)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}
                >
                  <Avatar name={pName(f)} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{pName(f)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Score column ─────────────────────────────────────────────────────────────
function ScoreCol({
  team, name, score, color,
  onScore, onFalta,
}: {
  team: 'A' | 'B'; name: string; score: number; color: string
  onScore: (pts: number) => void
  onFalta: () => void
}) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center' }}>{name}</div>
      <div style={{ fontSize: 80, fontWeight: 700, color: C.text, lineHeight: 1 }}>{score}</div>
      <div style={{ width: '80%', height: 5, background: '#1e1736', borderRadius: 3 }}>
        <div style={{ height: '100%', background: color, borderRadius: 3, width: `${Math.min(1, score / MAX) * 100}%`, transition: 'width 0.2s' }} />
      </div>
      <div style={{ fontSize: 11, color: C.muted }}>{score}/{MAX}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, width: '100%', marginTop: 6 }}>
        {[1, 2, 3, 4].map(pts => (
          <button
            key={pts}
            onClick={() => onScore(pts)}
            style={{ padding: '12px 0', background: '#1e1736', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 17, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}
          >
            +{pts}
          </button>
        ))}
      </div>
      <button
        onClick={onFalta}
        style={{ width: '100%', padding: '9px 0', background: 'transparent', color, border: `1px solid ${color}`, borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, opacity: 0.8 }}
      >
        Falta
      </button>
    </div>
  )
}

// ── Save dialog (bottom sheet) ───────────────────────────────────────────────
function SaveSheet({
  ranchadas, selected, saving,
  onChange, onSave, onClose,
}: {
  ranchadas: Ranchada[]
  selected: string | null
  saving: boolean
  onChange: (id: string) => void
  onSave: () => void
  onClose: () => void
}) {
  const options = [
    { id: 'nueva', label: 'Nueva ranchada', sub: 'Crear una nueva para hoy', labelColor: '#22c55e' },
    { id: 'none',  label: 'Sin ranchada',   sub: 'Solo guardar la partida',  labelColor: C.text },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)' }} />
      <div
        style={{ position: 'relative', background: '#0d0d1a', borderRadius: '20px 20px 0 0', padding: '20px 20px 36px', width: '100%', maxWidth: 480, margin: '0 auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>Guardar partida</div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>¿En qué ranchada querés guardar el resultado?</div>

        {options.map(opt => (
          <RanchadaRow key={opt.id} id={opt.id} label={opt.label} sub={opt.sub} labelColor={opt.labelColor} selected={selected} onClick={() => onChange(opt.id)} />
        ))}

        {ranchadas.length > 0 && (
          <div style={{ maxHeight: 180, overflowY: 'auto', marginTop: 4 }}>
            {ranchadas.map(r => (
              <RanchadaRow key={r.id} id={r.id} label={r.name || 'Ranchada'} sub={fmtDate(r.date)} labelColor={C.text} selected={selected} onClick={() => onChange(r.id)} />
            ))}
          </div>
        )}

        <button
          onClick={onSave}
          disabled={!selected || saving}
          style={{ marginTop: 14, width: '100%', padding: '13px', background: selected && !saving ? '#4c1d95' : C.border, color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: selected && !saving ? 'pointer' : 'default', fontFamily: FONT }}
        >
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

function RanchadaRow({ id, label, sub, labelColor, selected, onClick }: {
  id: string; label: string; sub: string; labelColor: string; selected: string | null; onClick: () => void
}) {
  const active = selected === id
  return (
    <div
      onClick={onClick}
      style={{ background: active ? '#0a1f35' : '#080812', border: `1.5px solid ${active ? C.primary : C.border}`, borderRadius: 10, padding: '11px 14px', marginBottom: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: labelColor }}>{label}</div>
        <div style={{ fontSize: 11, color: C.muted }}>{sub}</div>
      </div>
      {active && <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
function TrucoJugar() {
  const supabase = createClient()
  const router = useRouter()
  const params = useSearchParams()
  const preRanchada = params.get('ranchada')

  const [myId, setMyId]   = useState('')
  const [friends, setFriends] = useState<Profile[]>([])

  // Setup
  const [teamAName, setTeamAName] = useState('Nosotros')
  const [teamBName, setTeamBName] = useState('Ellos')
  const [teamA, setTeamA] = useState<Player[]>([])
  const [teamB, setTeamB] = useState<Player[]>([])
  const [addingTo, setAddingTo] = useState<'A' | 'B' | null>(null)

  // Game
  const [step, setStep] = useState<'setup' | 'game' | 'ended'>('setup')
  const [scoreA, setScoreA] = useState(0)
  const [scoreB, setScoreB] = useState(0)
  const [history, setHistory] = useState<Array<{ team: 'A' | 'B'; pts: number }>>([])
  const [winner, setWinner] = useState<'A' | 'B' | null>(null)
  const [showExit, setShowExit] = useState(false)

  // Save
  const [showSave, setShowSave] = useState(false)
  const [ranchadas, setRanchadas] = useState<Ranchada[]>([])
  const [selectedRanchada, setSelectedRanchada] = useState<string | null>(preRanchada)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setMyId(user.id)
      const meta = user.user_metadata ?? {}
      const name = meta.nombre ? `${meta.nombre} ${meta.apellido || ''}`.trim() : meta.username || 'Vos'
      setTeamA([{ key: user.id, name, userId: user.id }])

      supabase
        .from('friendships')
        .select(`requester_id, addressee_id,
          requester:profiles!friendships_requester_id_fkey(id, nombre, apellido, username),
          addressee:profiles!friendships_addressee_id_fkey(id, nombre, apellido, username)`)
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .eq('status', 'accepted')
        .then(({ data }) => {
          if (!data) return
          setFriends(data.map((f: any) => f.requester_id === user.id ? f.addressee : f.requester).filter(Boolean))
        })
    })
    supabase.from('ranchadas').select('id, name, date').order('date', { ascending: false }).limit(10)
      .then(({ data }) => setRanchadas(data || []))
  }, [])

  const takenIds = new Set([...teamA, ...teamB].map(p => p.userId).filter(Boolean) as string[])

  const removeFrom = (team: 'A' | 'B', key: string) => {
    if (team === 'A') setTeamA(prev => prev.filter(p => p.key !== key))
    else setTeamB(prev => prev.filter(p => p.key !== key))
  }

  const addFriend = (f: Profile) => {
    const p: Player = { key: f.id, name: pName(f), userId: f.id }
    if (addingTo === 'A') setTeamA(prev => [...prev, p])
    else if (addingTo === 'B') setTeamB(prev => [...prev, p])
    setAddingTo(null)
  }

  const addGuest = (name: string) => {
    const p: Player = { key: `g-${Date.now()}`, name }
    if (addingTo === 'A') setTeamA(prev => [...prev, p])
    else if (addingTo === 'B') setTeamB(prev => [...prev, p])
    setAddingTo(null)
  }

  const addPoint = (team: 'A' | 'B', pts: number) => {
    if (step !== 'game') return
    const newA = team === 'A' ? Math.min(MAX, scoreA + pts) : scoreA
    const newB = team === 'B' ? Math.min(MAX, scoreB + pts) : scoreB
    setHistory(h => [...h, { team, pts }])
    setScoreA(newA)
    setScoreB(newB)
    if (newA >= MAX) { setWinner('A'); setStep('ended') }
    else if (newB >= MAX) { setWinner('B'); setStep('ended') }
  }

  const undo = () => {
    if (!history.length) return
    const last = history[history.length - 1]
    setHistory(h => h.slice(0, -1))
    if (last.team === 'A') setScoreA(s => Math.max(0, s - last.pts))
    else setScoreB(s => Math.max(0, s - last.pts))
  }

  const handleSave = async () => {
    if (saving || !myId) return
    setSaving(true)

    let ranchadaId: string | null =
      selectedRanchada && selectedRanchada !== 'none' && selectedRanchada !== 'nueva'
        ? selectedRanchada : null

    if (selectedRanchada === 'nueva') {
      const { data: newR } = await supabase.from('ranchadas')
        .insert({ date: new Date().toISOString().split('T')[0], created_by: myId })
        .select('id').single()
      if (newR) {
        ranchadaId = newR.id
        await supabase.from('ranchada_participants').insert([
          { ranchada_id: ranchadaId, user_id: myId, player_type: 'owner' },
          ...[...teamA, ...teamB].filter(p => p.userId && p.userId !== myId).map(p => ({
            ranchada_id: ranchadaId, user_id: p.userId, player_type: 'friend',
          })),
          ...[...teamA, ...teamB].filter(p => !p.userId).map(p => ({
            ranchada_id: ranchadaId, guest_name: p.name, player_type: 'guest',
          })),
        ])
      }
    }

    const { data: session } = await supabase.from('game_sessions')
      .insert({ game_type: 'truco', ranchada_id: ranchadaId, played_at: new Date().toISOString(), created_by: myId })
      .select('id').single()

    if (session) {
      await supabase.from('game_session_players').insert([
        ...teamA.map(p => ({
          session_id: session.id,
          user_id: p.userId || null,
          guest_name: p.userId ? null : p.name,
          player_type: p.userId === myId ? 'owner' : (p.userId ? 'friend' : 'guest'),
          is_winner: winner === 'A',
          team: 'A',
          stats: {},
        })),
        ...teamB.map(p => ({
          session_id: session.id,
          user_id: p.userId || null,
          guest_name: p.userId ? null : p.name,
          player_type: p.userId ? 'friend' : 'guest',
          is_winner: winner === 'B',
          team: 'B',
          stats: {},
        })),
      ])
    }

    setSaving(false)
    if (ranchadaId) router.push(`/ranchadas/${ranchadaId}`)
    else router.push('/truco')
  }

  const resetGame = () => {
    setStep('setup')
    setScoreA(0); setScoreB(0)
    setHistory([]); setWinner(null)
    setShowSave(false); setShowExit(false)
  }

  // ── SETUP ─────────────────────────────────────────────────────────────────
  if (step === 'setup') {
    const canStart = teamA.length > 0 && teamB.length > 0

    const TeamSection = ({ team }: { team: 'A' | 'B' }) => {
      const players = team === 'A' ? teamA : teamB
      const name = team === 'A' ? teamAName : teamBName
      const setName = team === 'A' ? setTeamAName : setTeamBName
      const color = team === 'A' ? C.a : C.b

      return (
        <div style={{ background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 15, fontWeight: 700, color: C.text, fontFamily: FONT }}
            />
          </div>
          {players.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {players.map(p => (
                <PlayerChip key={p.key} player={p} onRemove={() => removeFrom(team, p.key)} />
              ))}
            </div>
          )}
          <button
            onClick={() => setAddingTo(team)}
            style={{ width: '100%', padding: '9px', background: 'transparent', color: C.muted, border: `1px dashed ${C.border}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}
          >
            + Agregar jugador
          </button>
        </div>
      )
    }

    return (
      <div style={{ background: C.bg, minHeight: '100vh', fontFamily: FONT }}>
        <nav style={{ background: C.bg, borderBottom: `1px solid ${C.border}`, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <BackBtn onClick={() => router.back()} />
          <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>🃏 Truco — Nuevo partido</span>
        </nav>
        <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TeamSection team="A" />
          <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: C.muted }}>VS</div>
          <TeamSection team="B" />
          <button
            onClick={() => canStart && setStep('game')}
            disabled={!canStart}
            style={{ marginTop: 8, padding: '14px', background: canStart ? '#4c1d95' : C.border, color: canStart ? '#fff' : C.muted, border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: canStart ? 'pointer' : 'default', fontFamily: FONT, transition: 'background 0.15s' }}
          >
            Comenzar partido
          </button>
          {!canStart && <div style={{ textAlign: 'center', fontSize: 12, color: C.muted }}>Necesitás al menos un jugador en cada equipo</div>}
        </div>

        {addingTo && (
          <AddPlayerSheet
            teamLabel={addingTo === 'A' ? teamAName : teamBName}
            friends={friends}
            taken={takenIds}
            onAddFriend={addFriend}
            onAddGuest={addGuest}
            onClose={() => setAddingTo(null)}
          />
        )}
      </div>
    )
  }

  // ── GAME ──────────────────────────────────────────────────────────────────
  if (step === 'game') {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', fontFamily: FONT }}>
        <nav style={{ background: C.bg, borderBottom: `1px solid ${C.border}`, padding: '10px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => setShowExit(true)} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, cursor: 'pointer', fontSize: 12, fontFamily: FONT, padding: '5px 10px' }}>
            ✕ Salir
          </button>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>🃏 Truco</span>
          <button
            onClick={undo}
            disabled={!history.length}
            style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, color: history.length ? C.text : C.muted, cursor: history.length ? 'pointer' : 'default', fontSize: 12, fontFamily: FONT, padding: '5px 10px' }}
          >
            ↩ Deshacer
          </button>
        </nav>

        {/* Player labels */}
        <div style={{ display: 'flex', maxWidth: 480, margin: '0 auto', padding: '8px 18px 0' }}>
          <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {teamA.map(p => <span key={p.key} style={{ fontSize: 11, color: C.a, background: '#1e2a4a', padding: '2px 8px', borderRadius: 20 }}>{p.name.split(' ')[0]}</span>)}
          </div>
          <div style={{ fontSize: 11, color: C.muted, padding: '0 8px' }}>vs</div>
          <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end' }}>
            {teamB.map(p => <span key={p.key} style={{ fontSize: 11, color: C.b, background: '#2a1e1e', padding: '2px 8px', borderRadius: 20 }}>{p.name.split(' ')[0]}</span>)}
          </div>
        </div>

        <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 18px' }}>
          <div style={{ display: 'flex', gap: 16 }}>
            <ScoreCol team="A" name={teamAName} score={scoreA} color={C.a} onScore={pts => addPoint('A', pts)} onFalta={() => addPoint('A', MAX - scoreA)} />
            <div style={{ width: 1, background: C.border, alignSelf: 'stretch' }} />
            <ScoreCol team="B" name={teamBName} score={scoreB} color={C.b} onScore={pts => addPoint('B', pts)} onFalta={() => addPoint('B', MAX - scoreB)} />
          </div>
        </div>

        {/* Exit confirmation */}
        {showExit && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)' }} onClick={() => setShowExit(false)} />
            <div style={{ position: 'relative', background: '#0d0d1a', borderRadius: 16, padding: '24px 20px', width: '100%', maxWidth: 340, textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 8 }}>¿Abandonar el partido?</div>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>El progreso se perderá</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setShowExit(false)} style={{ flex: 1, padding: '11px', background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                  Seguir jugando
                </button>
                <button onClick={() => router.push('/truco')} style={{ flex: 1, padding: '11px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
                  Salir
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── ENDED ─────────────────────────────────────────────────────────────────
  const winTeam = winner === 'A' ? teamA : teamB
  const winName = winner === 'A' ? teamAName : teamBName

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: FONT, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 18px' }}>
      <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 60, marginBottom: 12 }}>🏆</div>
        <div style={{ fontSize: 26, fontWeight: 700, color: C.text, marginBottom: 4 }}>¡Ganó {winName}!</div>
        <div style={{ fontSize: 14, color: C.muted, marginBottom: 20 }}>
          {winTeam.map(p => p.name.split(' ')[0]).join(' · ')}
        </div>

        {/* Final scores */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 28 }}>
          {([['A', teamAName, scoreA, C.a], ['B', teamBName, scoreB, C.b]] as const).map(([team, name, sc, col]) => (
            <div key={team} style={{ background: C.card, border: `1.5px solid ${winner === team ? col : C.border}`, borderRadius: 12, padding: '12px 24px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: col as string, marginBottom: 4 }}>{name as string}</div>
              <div style={{ fontSize: 34, fontWeight: 700, color: C.text }}>{sc as number}</div>
            </div>
          ))}
        </div>

        <button onClick={() => setShowSave(true)} style={{ width: '100%', padding: '14px', background: '#4c1d95', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, marginBottom: 8 }}>
          Guardar partida
        </button>
        <button onClick={resetGame} style={{ width: '100%', padding: '12px', background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 13, cursor: 'pointer', fontFamily: FONT, marginBottom: 8 }}>
          Nuevo partido
        </button>
        <button onClick={() => router.push('/truco')} style={{ width: '100%', padding: '10px', background: 'transparent', color: C.muted, border: 'none', fontSize: 12, cursor: 'pointer', fontFamily: FONT }}>
          Volver al inicio
        </button>
      </div>

      {showSave && (
        <SaveSheet
          ranchadas={ranchadas}
          selected={selectedRanchada}
          saving={saving}
          onChange={setSelectedRanchada}
          onSave={handleSave}
          onClose={() => setShowSave(false)}
        />
      )}
    </div>
  )
}

export default function TrucoJugarPage() {
  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
      <Suspense fallback={<div style={{ background: '#01050F', minHeight: '100vh' }} />}>
        <TrucoJugar />
      </Suspense>
    </>
  )
}
