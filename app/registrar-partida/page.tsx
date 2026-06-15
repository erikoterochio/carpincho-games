'use client'

import { useState, useEffect, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import PlayerPicker, { PickedPlayer } from '@/components/PlayerPicker'

const FONT = "'Ubuntu', sans-serif"
const C = {
  bg: '#01050F', card: '#0d0d1a', border: '#1e1736',
  primary: '#055074', text: '#c1c1c6', muted: '#706c7e',
} as const

const GAMES = [
  { id: 'truco',     label: 'Truco',       emoji: '🃏' },
  { id: 'berenjena', label: 'Berenjena',   emoji: '🍆' },
  { id: 'generala',  label: 'Generala',    emoji: '🎲' },
  { id: 'tabu',      label: 'Tabú',        emoji: '🤫' },
  { id: 'mimica',    label: 'Mímica',      emoji: '🎭' },
  { id: 'impostor',  label: 'El Impostor', emoji: '🕵️' },
  { id: 'wordle',    label: 'Wordle',      emoji: '📝' },
] as const

type GameId = typeof GAMES[number]['id']
type Ranchada = { id: string; name: string | null; date: string }

const AVATAR_COLORS = ['#04447b', '#065c6c', '#7c3aed', '#b45309', '#0369a1', '#be123c', '#15803d']
function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name?.substring(0, 2).toUpperCase() || '?'
  const color = AVATAR_COLORS[name?.charCodeAt(0) % AVATAR_COLORS.length] || '#04447b'
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.36, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
      {initials}
    </div>
  )
}

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function RegistrarForm() {
  const supabase = createClient()
  const router = useRouter()
  const params = useSearchParams()

  const preGame = params.get('game') as GameId | null
  const preRanchada = params.get('ranchada')

  const initialStep = preGame && preRanchada ? 3 : preGame ? 2 : 1

  const [myId, setMyId]       = useState('')
  const [myName, setMyName]   = useState('Vos')
  const [step, setStep]       = useState(initialStep)
  const [gameType, setGameType]   = useState<GameId | null>(preGame)
  const [ranchadaId, setRanchadaId] = useState<string | null>(preRanchada)
  const [ranchadas, setRanchadas] = useState<Ranchada[]>([])
  const [players, setPlayers]   = useState<PickedPlayer[]>([])
  const [winners, setWinners]   = useState<Set<number>>(new Set())
  const [saving, setSaving]     = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setMyId(user.id)
      const meta = user.user_metadata ?? {}
      setMyName(
        meta.nombre
          ? `${meta.nombre} ${meta.apellido || ''}`.trim()
          : meta.username || user.email?.split('@')[0] || 'Vos'
      )
    })
    supabase
      .from('ranchadas')
      .select('id, name, date')
      .order('date', { ascending: false })
      .limit(10)
      .then(({ data }) => setRanchadas(data || []))
  }, [])

  const game = GAMES.find(g => g.id === gameType)
  const totalSteps = preGame ? 3 : 4
  const stepDisplay = preGame ? step - 1 : step

  const allPlayers = [
    { display_name: myName, user_id: myId, guest_name: undefined as string | undefined, player_type: 'owner' as const },
    ...players,
  ]

  const toggleWinner = (idx: number) =>
    setWinners(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n })

  const goBack = () => step > initialStep ? setStep(step - 1) : router.back()

  const handleSave = async (useWinners = true) => {
    if (!gameType || !myId || saving) return
    setSaving(true)

    let targetRanchadaId: string | null =
      ranchadaId && ranchadaId !== 'nueva' && ranchadaId !== 'none' ? ranchadaId : null

    if (ranchadaId === 'nueva') {
      const { data: newR } = await supabase
        .from('ranchadas')
        .insert({ date: new Date().toISOString().split('T')[0], created_by: myId })
        .select('id')
        .single()
      if (newR) {
        targetRanchadaId = newR.id
        await supabase.from('ranchada_participants').insert([
          { ranchada_id: targetRanchadaId, user_id: myId, player_type: 'owner' },
          ...players.map(p => ({
            ranchada_id: targetRanchadaId,
            user_id: p.user_id || null,
            guest_name: p.guest_name || null,
            player_type: p.player_type,
          })),
        ])
      }
    }

    const { data: session } = await supabase
      .from('game_sessions')
      .insert({ game_type: gameType, ranchada_id: targetRanchadaId, played_at: new Date().toISOString(), created_by: myId })
      .select('id')
      .single()

    if (session) {
      const winnersSet = useWinners ? winners : new Set<number>()
      await supabase.from('game_session_players').insert(
        allPlayers.map((p, i) => ({
          session_id: session.id,
          user_id: p.user_id || null,
          guest_name: p.guest_name || null,
          player_type: p.player_type,
          is_winner: winnersSet.has(i),
        }))
      )
    }

    setSaving(false)
    router.push(targetRanchadaId ? `/ranchadas/${targetRanchadaId}` : '/ranchadas')
  }

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: FONT }}>

      {/* Nav */}
      <nav style={{ background: C.bg, borderBottom: `1px solid ${C.border}`, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={goBack} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 5l-7 7 7 7" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Registrar partida</div>
          {game && <div style={{ fontSize: 11, color: C.muted }}>{game.emoji} {game.label}</div>}
        </div>
      </nav>

      {/* Progress */}
      <div style={{ height: 3, background: C.border }}>
        <div style={{ height: '100%', background: C.primary, width: `${(stepDisplay / totalSteps) * 100}%`, transition: 'width 0.25s' }} />
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 18px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 }}>
          Paso {stepDisplay} de {totalSteps}
        </div>

        {/* STEP 1: Game type */}
        {step === 1 && (
          <>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 20 }}>¿Qué jugaron?</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {GAMES.map(g => (
                <button
                  key={g.id}
                  onClick={() => { setGameType(g.id); setStep(2) }}
                  style={{ background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: '16px 14px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, fontFamily: FONT }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = C.primary)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
                >
                  <span style={{ fontSize: 26 }}>{g.emoji}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{g.label}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* STEP 2: Ranchada */}
        {step === 2 && (
          <>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 6 }}>¿En qué ranchada?</div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>Elegí una existente o creá una nueva</div>

            <RanchadaOption
              id="nueva" selected={ranchadaId}
              icon="＋" iconBg="#0d2a1e" iconBorder="#166534"
              label="Nueva ranchada" labelColor="#4ade80" sub="Crear una nueva para hoy"
              onClick={() => { setRanchadaId('nueva'); setStep(3) }}
            />
            <RanchadaOption
              id="none" selected={ranchadaId}
              icon="—" iconBg="#1e1736" iconBorder={C.border}
              label="Sin ranchada" labelColor={C.text} sub="Registrar solo la partida"
              onClick={() => { setRanchadaId('none'); setStep(3) }}
            />

            {ranchadas.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', margin: '16px 0 8px' }}>Recientes</div>
                {ranchadas.map(r => (
                  <RanchadaOption
                    key={r.id}
                    id={r.id} selected={ranchadaId}
                    icon="🏠" iconBg="#1e1736" iconBorder={C.border}
                    label={r.name || 'Ranchada'} labelColor={C.text} sub={formatDate(r.date)}
                    onClick={() => { setRanchadaId(r.id); setStep(3) }}
                  />
                ))}
              </>
            )}
          </>
        )}

        {/* STEP 3: Players */}
        {step === 3 && myId && (
          <>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 6 }}>¿Quiénes jugaron?</div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>Además de vos, agregá a todos los participantes</div>
            <PlayerPicker myId={myId} selected={players} onChange={setPlayers} />
            <button
              onClick={() => setStep(4)}
              style={{ marginTop: 20, width: '100%', padding: '13px', background: C.primary, color: C.text, border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}
            >
              Continuar →
            </button>
          </>
        )}

        {/* STEP 4: Result */}
        {step === 4 && (
          <>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 6 }}>¿Quién ganó?</div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>Podés seleccionar más de uno (empate) o ninguno</div>

            {allPlayers.map((p, i) => {
              const won = winners.has(i)
              return (
                <div
                  key={i}
                  onClick={() => toggleWinner(i)}
                  style={{ background: won ? '#0d2a1e' : C.card, border: `1.5px solid ${won ? '#22c55e' : C.border}`, borderRadius: 12, padding: '13px 16px', marginBottom: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
                >
                  <Avatar name={p.display_name} size={38} />
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: C.text }}>
                    {p.display_name}
                    {i === 0 && <span style={{ color: C.muted, fontWeight: 400, fontSize: 12 }}> · vos</span>}
                  </span>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${won ? '#22c55e' : C.border}`, background: won ? '#22c55e' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {won && <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#0d2a1e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                </div>
              )
            })}

            <button
              onClick={() => handleSave(true)}
              disabled={saving}
              style={{ marginTop: 20, width: '100%', padding: '14px', background: saving ? C.border : C.primary, color: C.text, border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: saving ? 'default' : 'pointer', fontFamily: FONT, opacity: saving ? 0.7 : 1 }}
            >
              {saving ? 'Guardando...' : 'Guardar partida'}
            </button>
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              style={{ marginTop: 8, width: '100%', padding: '12px', background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 13, cursor: saving ? 'default' : 'pointer', fontFamily: FONT }}
            >
              Guardar sin resultado
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function RanchadaOption({ id, selected, icon, iconBg, iconBorder, label, labelColor, sub, onClick }: {
  id: string; selected: string | null
  icon: string; iconBg: string; iconBorder: string
  label: string; labelColor: string; sub: string
  onClick: () => void
}) {
  const active = selected === id
  return (
    <div
      onClick={onClick}
      style={{ background: active ? '#0a1f35' : C.card, border: `1.5px solid ${active ? C.primary : C.border}`, borderRadius: 12, padding: '14px 16px', marginBottom: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
    >
      <div style={{ width: 38, height: 38, borderRadius: 10, background: iconBg, border: `1px solid ${iconBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: labelColor }}>{label}</div>
        <div style={{ fontSize: 11, color: C.muted }}>{sub}</div>
      </div>
      {active && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      )}
    </div>
  )
}

export default function RegistrarPartidaPage() {
  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
      <Suspense fallback={<div style={{ background: '#01050F', minHeight: '100vh' }} />}>
        <RegistrarForm />
      </Suspense>
    </>
  )
}
