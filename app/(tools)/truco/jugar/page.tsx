'use client'

import { useState, useEffect, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'

const FONT = "'Ubuntu', sans-serif"
const MAX = 30

type Player = { key: string; name: string; userId?: string }
type Ranchada = { id: string; name: string | null; date: string }
type Profile = { id: string; nombre: string; apellido: string; username: string }

const AVATAR_COLORS = ['#04447b', '#065c6c', '#7c3aed', '#b45309', '#0369a1', '#be123c', '#15803d']

function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  const color = AVATAR_COLORS[(name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length]
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.38, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
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

// ── Add-player bottom sheet ───────────────────────────────────────────────────
function AddSheet({
  label, friends, taken,
  onFriend, onGuest, onClose,
}: {
  label: string; friends: Profile[]; taken: Set<string>
  onFriend: (p: Profile) => void; onGuest: (n: string) => void; onClose: () => void
}) {
  const [guest, setGuest] = useState('')
  const avail = friends.filter(f => !taken.has(f.id))
  const submit = () => { if (guest.trim()) { onGuest(guest.trim()); setGuest('') } }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)' }} />
      <div style={{ position: 'relative', background: '#141414', borderRadius: '20px 20px 0 0', padding: '20px 20px 36px', width: '100%', maxWidth: 480, margin: '0 auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 14, fontFamily: FONT }}>Agregar a {label}</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            autoFocus value={guest} onChange={e => setGuest(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="Nombre del invitado..."
            style={{ flex: 1, padding: '10px 13px', background: '#0a0a0a', border: '1px solid #2a2a2a', borderRadius: 9, color: '#fff', fontSize: 14, fontFamily: FONT, outline: 'none' }}
          />
          <button onClick={submit} disabled={!guest.trim()} style={{ padding: '10px 16px', background: guest.trim() ? '#fff' : '#2a2a2a', color: guest.trim() ? '#000' : '#555', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: guest.trim() ? 'pointer' : 'default', fontFamily: FONT }}>
            Agregar
          </button>
        </div>
        {avail.length > 0 && <>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#555', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, fontFamily: FONT }}>Amigos</div>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {avail.map(f => (
              <div key={f.id} onClick={() => onFriend(f)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 4px', borderBottom: '1px solid #1a1a1a', cursor: 'pointer' }}>
                <Avatar name={pName(f)} size={32} />
                <span style={{ fontSize: 14, fontWeight: 600, color: '#fff', fontFamily: FONT }}>{pName(f)}</span>
              </div>
            ))}
          </div>
        </>}
      </div>
    </div>
  )
}

// ── Ranchada row ─────────────────────────────────────────────────────────────
function RRow({ id, label, sub, labelColor, selected, onClick }: {
  id: string; label: string; sub: string; labelColor: string; selected: string | null; onClick: () => void
}) {
  const on = selected === id
  return (
    <div onClick={onClick} style={{ background: on ? '#0a1f35' : '#0a0a0a', border: `1.5px solid ${on ? '#055074' : '#2a2a2a'}`, borderRadius: 10, padding: '11px 14px', marginBottom: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: labelColor, fontFamily: FONT }}>{label}</div>
        <div style={{ fontSize: 11, color: '#555', fontFamily: FONT }}>{sub}</div>
      </div>
      {on && <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
    </div>
  )
}

// ── Save bottom sheet ─────────────────────────────────────────────────────────
function SaveSheet({ ranchadas, selected, saving, onChange, onSave, onClose }: {
  ranchadas: Ranchada[]; selected: string | null; saving: boolean
  onChange: (id: string) => void; onSave: () => void; onClose: () => void
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)' }} />
      <div style={{ position: 'relative', background: '#141414', borderRadius: '20px 20px 0 0', padding: '20px 20px 36px', width: '100%', maxWidth: 480, margin: '0 auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 4, fontFamily: FONT }}>Guardar partida</div>
        <div style={{ fontSize: 13, color: '#555', marginBottom: 14, fontFamily: FONT }}>¿En qué ranchada guardamos el resultado?</div>
        <RRow id="nueva" label="Nueva ranchada" sub="Crear una nueva para hoy" labelColor="#22c55e" selected={selected} onClick={() => onChange('nueva')} />
        <RRow id="none"  label="Sin ranchada"   sub="Solo guardar la partida" labelColor="#fff"    selected={selected} onClick={() => onChange('none')} />
        {ranchadas.length > 0 && (
          <div style={{ maxHeight: 180, overflowY: 'auto', marginTop: 4 }}>
            {ranchadas.map(r => <RRow key={r.id} id={r.id} label={r.name || 'Ranchada'} sub={fmtDate(r.date)} labelColor="#fff" selected={selected} onClick={() => onChange(r.id)} />)}
          </div>
        )}
        <button onClick={onSave} disabled={!selected || saving} style={{ marginTop: 14, width: '100%', padding: '14px', background: selected && !saving ? '#4c1d95' : '#2a2a2a', color: selected && !saving ? '#fff' : '#555', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: selected && !saving ? 'pointer' : 'default', fontFamily: FONT }}>
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
function TrucoJugar() {
  const supabase = createClient()
  const router = useRouter()
  const params = useSearchParams()
  const preRanchada = params.get('ranchada')

  const [myId, setMyId]     = useState('')
  const [friends, setFriends] = useState<Profile[]>([])

  const [teamAName, setTeamAName] = useState('Nosotros')
  const [teamBName, setTeamBName] = useState('Ellos')
  const [teamA, setTeamA] = useState<Player[]>([])
  const [teamB, setTeamB] = useState<Player[]>([])
  const [addingTo, setAddingTo] = useState<'A' | 'B' | null>(null)

  const [scoreA, setScoreA] = useState(0)
  const [scoreB, setScoreB] = useState(0)
  const [history, setHistory] = useState<Array<{ team: 'A' | 'B'; pts: number }>>([])
  const [winner, setWinner]   = useState<'A' | 'B' | null>(null)

  const [showEnd,  setShowEnd]  = useState(false)
  const [showSave, setShowSave] = useState(false)
  const [ranchadas, setRanchadas] = useState<Ranchada[]>([])
  const [selRanchada, setSelRanchada] = useState<string | null>(preRanchada)
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

  const taken = new Set([...teamA, ...teamB].map(p => p.userId).filter(Boolean) as string[])

  const addFriend = (f: Profile) => {
    const p: Player = { key: f.id, name: pName(f), userId: f.id }
    addingTo === 'A' ? setTeamA(t => [...t, p]) : setTeamB(t => [...t, p])
    setAddingTo(null)
  }
  const addGuest = (name: string) => {
    const p: Player = { key: `g-${Date.now()}`, name }
    addingTo === 'A' ? setTeamA(t => [...t, p]) : setTeamB(t => [...t, p])
    setAddingTo(null)
  }
  const remove = (team: 'A' | 'B', key: string) => {
    team === 'A' ? setTeamA(t => t.filter(p => p.key !== key)) : setTeamB(t => t.filter(p => p.key !== key))
  }
  const canAdd = (team: 'A' | 'B') => (team === 'A' ? teamA : teamB).length < 3

  const addPoint = (team: 'A' | 'B', pts: number) => {
    if (winner) return
    const newA = team === 'A' ? Math.min(MAX, scoreA + pts) : scoreA
    const newB = team === 'B' ? Math.min(MAX, scoreB + pts) : scoreB
    setHistory(h => [...h, { team, pts }])
    setScoreA(newA); setScoreB(newB)
    if (newA >= MAX || newB >= MAX) {
      setWinner(newA >= MAX ? 'A' : 'B')
      setShowEnd(true)
    }
  }
  const undo = () => {
    if (!history.length || winner) return
    const last = history[history.length - 1]
    setHistory(h => h.slice(0, -1))
    last.team === 'A' ? setScoreA(s => Math.max(0, s - last.pts)) : setScoreB(s => Math.max(0, s - last.pts))
  }
  const resetScores = () => {
    setScoreA(0); setScoreB(0); setHistory([]); setWinner(null); setShowEnd(false); setShowSave(false)
  }
  const resetAll = () => { resetScores(); setTeamA([]); setTeamB([]) }

  const handleSave = async () => {
    if (saving || !myId) return
    setSaving(true)
    let rId: string | null = selRanchada && selRanchada !== 'none' && selRanchada !== 'nueva' ? selRanchada : null

    if (selRanchada === 'nueva') {
      const { data: newR } = await supabase.from('ranchadas')
        .insert({ date: new Date().toISOString().split('T')[0], created_by: myId })
        .select('id').single()
      if (newR) {
        rId = newR.id
        await supabase.from('ranchada_participants').insert([
          { ranchada_id: rId, user_id: myId, player_type: 'owner' },
          ...[...teamA, ...teamB].filter(p => p.userId && p.userId !== myId).map(p => ({ ranchada_id: rId, user_id: p.userId, player_type: 'friend' })),
          ...[...teamA, ...teamB].filter(p => !p.userId).map(p => ({ ranchada_id: rId, guest_name: p.name, player_type: 'guest' })),
        ])
      }
    }

    const { data: session } = await supabase.from('game_sessions')
      .insert({ game_type: 'truco', ranchada_id: rId, played_at: new Date().toISOString(), created_by: myId })
      .select('id').single()

    if (session) {
      await supabase.from('game_session_players').insert([
        ...teamA.map(p => ({ session_id: session.id, user_id: p.userId || null, guest_name: p.userId ? null : p.name, player_type: p.userId === myId ? 'owner' : (p.userId ? 'friend' : 'guest'), is_winner: winner === 'A', team: 'A', stats: {} })),
        ...teamB.map(p => ({ session_id: session.id, user_id: p.userId || null, guest_name: p.userId ? null : p.name, player_type: p.userId ? 'friend' : 'guest', is_winner: winner === 'B', team: 'B', stats: {} })),
      ])
    }
    setSaving(false)
    if (rId) router.push(`/ranchadas/${rId}`)
    else router.push('/truco')
  }

  // ── RENDER ──────────────────────────────────────────────────────────────────
  const renderTeam = (team: 'A' | 'B') => {
    const name    = team === 'A' ? teamAName : teamBName
    const setName = team === 'A' ? setTeamAName : setTeamBName
    const players = team === 'A' ? teamA : teamB
    const score   = team === 'A' ? scoreA : scoreB

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        {/* Team name */}
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          style={{ background: 'none', border: 'none', outline: 'none', fontSize: 26, fontWeight: 700, color: '#fff', fontFamily: FONT, textAlign: 'center', width: '100%' }}
        />

        {/* Score card */}
        <div style={{ background: '#fff', borderRadius: 18, padding: '20px 10px 16px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ fontSize: 72, fontWeight: 700, color: '#0a0a0a', lineHeight: 1, fontFamily: FONT }}>
            {score}
          </div>
          <div style={{ fontSize: 13, color: '#888', fontFamily: FONT }}>puntos</div>
          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <button
              onClick={() => undo()}
              style={{ width: 48, height: 48, borderRadius: '50%', background: '#e5e7eb', border: 'none', fontSize: 22, fontWeight: 700, color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              −
            </button>
            <button
              onClick={() => addPoint(team, 1)}
              disabled={!!winner}
              style={{ width: 48, height: 48, borderRadius: '50%', background: '#0a0a0a', border: 'none', fontSize: 22, fontWeight: 700, color: '#fff', cursor: winner ? 'default' : 'pointer', opacity: winner ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              +
            </button>
          </div>
        </div>

        {/* Players */}
        {players.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'center', width: '100%' }}>
            {players.map(p => (
              <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 20, padding: '3px 8px 3px 5px' }}>
                <Avatar name={p.name} size={18} />
                <span style={{ fontSize: 11, color: '#c1c1c6', fontFamily: FONT }}>{p.name.split(' ')[0]}</span>
                <button onClick={() => remove(team, p.key)} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
              </div>
            ))}
          </div>
        )}

        {/* Add player */}
        {canAdd(team) && (
          <button
            onClick={() => setAddingTo(team)}
            style={{ width: '100%', padding: '9px', background: 'transparent', color: '#c1c1c6', border: '1px solid #3a3a3a', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}
          >
            + agregar jugador
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={{ background: '#01050F', minHeight: '100vh', fontFamily: FONT }}>
      <nav style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1a1a1a' }}>
        <button onClick={() => router.push('/truco')} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', padding: 4, display: 'flex' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 5l-7 7 7 7" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>🃏 Truco</span>
        <button onClick={undo} disabled={!history.length || !!winner} style={{ background: 'none', border: '1px solid #2a2a2a', borderRadius: 8, color: history.length && !winner ? '#c1c1c6' : '#333', cursor: history.length && !winner ? 'pointer' : 'default', fontSize: 12, fontFamily: FONT, padding: '5px 10px' }}>
          ↩
        </button>
      </nav>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px' }}>
        {/* Two columns */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {renderTeam('A')}
          {renderTeam('B')}
        </div>

        {/* Reiniciar */}
        <button
          onClick={resetScores}
          style={{ marginTop: 28, width: '100%', padding: '13px', background: 'transparent', color: '#555', border: '1px solid #2a2a2a', borderRadius: 10, fontSize: 14, cursor: 'pointer', fontFamily: FONT }}
        >
          Reiniciar marcador
        </button>
      </div>

      {/* Player add sheet */}
      {addingTo && (
        <AddSheet
          label={addingTo === 'A' ? teamAName : teamBName}
          friends={friends} taken={taken}
          onFriend={addFriend} onGuest={addGuest}
          onClose={() => setAddingTo(null)}
        />
      )}

      {/* End-of-game dialog */}
      {showEnd && winner && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)' }} />
          <div style={{ position: 'relative', background: '#141414', borderRadius: 20, padding: '28px 24px', width: '100%', maxWidth: 360, textAlign: 'center' }}>
            <div style={{ fontSize: 52, marginBottom: 10 }}>🏆</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 4, fontFamily: FONT }}>
              ¡Ganó {winner === 'A' ? teamAName : teamBName}!
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '16px 0 24px' }}>
              {([['A', teamAName, scoreA], ['B', teamBName, scoreB]] as const).map(([t, n, s]) => (
                <div key={t} style={{ background: '#0a0a0a', border: `2px solid ${winner === t ? '#22c55e' : '#2a2a2a'}`, borderRadius: 12, padding: '10px 20px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: winner === t ? '#22c55e' : '#555', textTransform: 'uppercase', letterSpacing: 1, fontFamily: FONT }}>{n as string}</div>
                  <div style={{ fontSize: 30, fontWeight: 700, color: '#fff', fontFamily: FONT }}>{s as number}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => setShowSave(true)} style={{ padding: '13px', background: '#4c1d95', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
                Guardar partida
              </button>
              <button onClick={resetScores} style={{ padding: '12px', background: '#1a1a1a', color: '#c1c1c6', border: '1px solid #2a2a2a', borderRadius: 10, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
                Otra con los mismos jugadores
              </button>
              <button onClick={resetAll} style={{ padding: '12px', background: 'transparent', color: '#555', border: 'none', borderRadius: 10, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
                Cambiar jugadores
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save sheet */}
      {showSave && (
        <SaveSheet
          ranchadas={ranchadas} selected={selRanchada} saving={saving}
          onChange={setSelRanchada} onSave={handleSave} onClose={() => setShowSave(false)}
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
