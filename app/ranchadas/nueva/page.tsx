'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import PlayerPicker, { type PickedPlayer } from '@/components/PlayerPicker'

const FONT = "'Ubuntu', sans-serif"
const C = {
  bg: '#01050F', card: '#0d0d1a', border: '#1e1736',
  primary: '#055074', text: '#c1c1c6', muted: '#706c7e',
} as const

const inp: React.CSSProperties = {
  width: '100%', padding: '11px 13px', background: '#080812',
  border: `1px solid ${C.border}`, borderRadius: 9, color: C.text,
  fontSize: 14, fontFamily: FONT, outline: 'none', boxSizing: 'border-box',
}

export default function NuevaRanchadaPage() {
  const supabase = createClient()
  const router = useRouter()

  const [myId, setMyId] = useState('')
  const [name, setName] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [players, setPlayers] = useState<PickedPlayer[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setMyId(user.id)
    })
  }, [])

  const handleSubmit = async () => {
    if (!myId) return
    setSaving(true)
    setError('')

    // 1. Crear ranchada
    const { data: ranchada, error: rErr } = await supabase
      .from('ranchadas')
      .insert({ name: name.trim() || null, date, notes: notes.trim() || null, created_by: myId })
      .select('id')
      .single()

    if (rErr || !ranchada) {
      setError('No se pudo crear la ranchada. Intentá de nuevo.')
      setSaving(false)
      return
    }

    // 2. Insertar participantes (owner + los seleccionados)
    const participants = [
      { ranchada_id: ranchada.id, user_id: myId, guest_name: null, player_type: 'owner' },
      ...players.map(p => ({
        ranchada_id: ranchada.id,
        user_id: p.user_id || null,
        guest_name: p.guest_name || null,
        player_type: p.player_type,
      })),
    ]

    const { error: pErr } = await supabase.from('ranchada_participants').insert(participants)

    if (pErr) {
      setError('Ranchada creada pero hubo un error al agregar los participantes.')
      setSaving(false)
      router.push(`/ranchadas/${ranchada.id}`)
      return
    }

    router.push(`/ranchadas/${ranchada.id}`)
  }

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; } input[type=date]::-webkit-calendar-picker-indicator { filter: invert(0.7); }`}</style>
      <div style={{ background: C.bg, minHeight: '100vh', fontFamily: FONT }}>

        {/* Nav */}
        <nav style={{ background: C.bg, borderBottom: `1px solid ${C.border}`, padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 480, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 30, height: 30, background: C.primary, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 16 }}>🏠</span>
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Nueva ranchada</span>
          </div>
          <button onClick={() => router.back()} style={{ padding: '6px 12px', background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: FONT }}>← Volver</button>
        </nav>

        <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 18px' }}>

          {/* Datos de la juntada */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px', marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 14 }}>Sobre la juntada</div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: C.muted, marginBottom: 6, fontWeight: 600 }}>Nombre (opcional)</label>
              <input
                style={inp}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ej: Asado del sábado, Finde en la quinta..."
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: C.muted, marginBottom: 6, fontWeight: 600 }}>Fecha</label>
              <input
                style={inp}
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: C.muted, marginBottom: 6, fontWeight: 600 }}>Notas (opcional)</label>
              <textarea
                style={{ ...inp, resize: 'none', minHeight: 72 }}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Dónde fue, qué se jugó, alguna anécdota..."
              />
            </div>
          </div>

          {/* Jugadores */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px', marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 4 }}>Quién vino</div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 14 }}>
              Vos estás incluido automáticamente. Agregá a los demás.
            </div>
            {myId && (
              <PlayerPicker
                myId={myId}
                selected={players}
                onChange={setPlayers}
              />
            )}
          </div>

          {error && (
            <div style={{ background: '#2d0a0a', border: '1px solid #7f1d1d', borderRadius: 10, padding: '12px 14px', marginBottom: 12, fontSize: 13, color: '#fca5a5', fontFamily: FONT }}>
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={saving || !myId}
            style={{ width: '100%', padding: '14px', background: saving ? C.border : C.primary, color: saving ? C.muted : C.text, border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: saving ? 'default' : 'pointer', fontFamily: FONT, transition: 'background 0.2s' }}
          >
            {saving ? 'Creando...' : '🏠 Crear ranchada'}
          </button>

        </div>
      </div>
    </>
  )
}
