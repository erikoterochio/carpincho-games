'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const FONT = "'Ubuntu', sans-serif"
const GOLD = '#D4AF37'
const BG = '#01050F'
const BORDER = '#1e1736'
const TEXT = '#c1c1c6'
const MUTED = '#706c7e'
const ACCENT = '#055074'
const CARD = '#0a0a16'

const DEADLINE = new Date('2026-06-11T19:00:00Z')

type Tournament = {
  id: string
  name: string
  code: string
  stage1_deadline: string
  admin_id: string
}

function countdown() {
  const now = new Date()
  const ms = DEADLINE.getTime() - now.getTime()
  if (ms <= 0) return null
  const days = Math.floor(ms / 86400000)
  const hours = Math.floor((ms % 86400000) / 3600000)
  const mins = Math.floor((ms % 3600000) / 60000)
  return { days, hours, mins }
}

export default function ProdePage() {
  const supabase = createClient()
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [code, setCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [timer, setTimer] = useState(countdown())

  useEffect(() => {
    const id = setInterval(() => setTimer(countdown()), 60000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      if (user) {
        const { data } = await supabase
          .from('prode_participants')
          .select('prode_tournaments(id, name, code, stage1_deadline, admin_id)')
          .eq('user_id', user.id)
        if (data) {
          const ts = data
            .map((d: any) => d.prode_tournaments)
            .filter(Boolean) as Tournament[]
          setTournaments(ts)
        }
      }
      setLoading(false)
    }
    load()
  }, [])

  const handleJoin = async () => {
    if (!user) { router.push('/login'); return }
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) return
    setJoining(true)
    setError(null)

    const { data: t } = await supabase
      .from('prode_tournaments')
      .select('id, name')
      .eq('code', trimmed)
      .maybeSingle()

    if (!t) {
      setError('Código no encontrado. Verificá que sea correcto.')
      setJoining(false)
      return
    }

    const { data: existing } = await supabase
      .from('prode_participants')
      .select('id')
      .eq('tournament_id', t.id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!existing) {
      const { error: joinErr } = await supabase
        .from('prode_participants')
        .insert({ tournament_id: t.id, user_id: user.id })
      if (joinErr) {
        setError('No se pudo unirse al torneo.')
        setJoining(false)
        return
      }
    }

    router.push(`/prode/${t.id}`)
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .inp { display: block; width: 100%; padding: 12px 16px; background: #0e0e1a; color: ${TEXT}; border: 1px solid ${BORDER}; border-radius: 10px; font-family: ${FONT}; font-size: 14px; font-weight: 500; outline: none; }
        .inp:focus { border-color: ${ACCENT}; }
        .inp::placeholder { color: ${MUTED}; }
        .btn-gold { display: block; width: 100%; padding: 13px; background: ${GOLD}; color: #01050F; border: none; border-radius: 10px; font-family: ${FONT}; font-size: 15px; font-weight: 700; cursor: pointer; }
        .btn-gold:hover { opacity: 0.9; }
        .btn-gold:disabled { opacity: 0.5; cursor: default; }
        .btn-outline { display: block; width: 100%; padding: 12px; background: transparent; color: ${MUTED}; border: 1px solid ${BORDER}; border-radius: 10px; font-family: ${FONT}; font-size: 14px; cursor: pointer; }
        .btn-outline:hover { border-color: ${MUTED}; color: ${TEXT}; }
        .t-card { background: ${CARD}; border: 1px solid ${BORDER}; border-radius: 14px; padding: 16px 18px; display: flex; align-items: center; justify-content: space-between; text-decoration: none; transition: border-color 0.15s; cursor: pointer; }
        .t-card:hover { border-color: ${GOLD}; }
      `}</style>

      <div style={{ background: BG, minHeight: '100vh', fontFamily: FONT }}>

        {/* Navbar */}
        <nav style={{ background: BG, borderBottom: `1px solid ${BORDER}`, padding: '12px 0' }}>
          <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href="/" style={{ color: MUTED, textDecoration: 'none', fontSize: 20, lineHeight: 1 }}>←</Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>⚽</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>Prode Mundial 2026</span>
            </div>
          </div>
        </nav>

        <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 18px' }}>

          {/* Deadline banner */}
          {timer ? (
            <div style={{ background: 'linear-gradient(135deg, #0b1f3a 0%, #1a2a10 100%)', border: `1px solid ${GOLD}40`, borderRadius: 14, padding: '16px 18px', marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Cierre de predicciones — Fase de grupos</div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: TEXT, lineHeight: 1 }}>{timer.days}</div>
                  <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>días</div>
                </div>
                <div style={{ fontSize: 22, color: MUTED, lineHeight: 1 }}>:</div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: TEXT, lineHeight: 1 }}>{String(timer.hours).padStart(2, '0')}</div>
                  <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>horas</div>
                </div>
                <div style={{ fontSize: 22, color: MUTED, lineHeight: 1 }}>:</div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: TEXT, lineHeight: 1 }}>{String(timer.mins).padStart(2, '0')}</div>
                  <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>min</div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>Predecí antes del 11 jun · 16:00 (Argentina)</div>
            </div>
          ) : (
            <div style={{ background: '#1a0808', border: '1px solid #4a1010', borderRadius: 14, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#f87171' }}>
              Las predicciones de fase de grupos están cerradas.
            </div>
          )}

          {/* Mis torneos */}
          {!loading && user && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>Mis torneos</div>

              {tournaments.length === 0 ? (
                <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '20px 18px', textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: MUTED }}>No estás en ningún torneo todavía.</div>
                  <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>Ingresá un código para unirte.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {tournaments.map(t => (
                    <Link key={t.id} href={`/prode/${t.id}`} className="t-card">
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, marginBottom: 3 }}>{t.name}</div>
                        <div style={{ fontSize: 11, color: MUTED }}>Código: <span style={{ color: GOLD, fontWeight: 700 }}>{t.code}</span></div>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke={MUTED} strokeWidth="2" strokeLinecap="round"/></svg>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Join by code */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
              {user ? 'Unirse a un torneo' : 'Iniciá sesión para participar'}
            </div>
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '18px' }}>
              {user ? (
                <>
                  <div style={{ fontSize: 13, color: MUTED, marginBottom: 12 }}>Ingresá el código que te dio el organizador del torneo.</div>
                  {error && (
                    <div style={{ background: '#2a0a0a', color: '#f87171', fontSize: 12, padding: '10px 14px', borderRadius: 8, marginBottom: 12 }}>{error}</div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="inp"
                      value={code}
                      onChange={e => setCode(e.target.value.toUpperCase())}
                      onKeyDown={e => e.key === 'Enter' && handleJoin()}
                      placeholder="Código del torneo"
                      maxLength={10}
                      style={{ flex: 1, textTransform: 'uppercase', letterSpacing: 2, fontWeight: 700, fontSize: 15 }}
                    />
                    <button
                      className="btn-gold"
                      onClick={handleJoin}
                      disabled={joining || !code.trim()}
                      style={{ width: 'auto', padding: '12px 20px' }}
                    >
                      {joining ? '...' : 'Entrar'}
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: MUTED, marginBottom: 14 }}>Necesitás una cuenta para participar en el prode.</div>
                  <Link href="/login" style={{ display: 'inline-block', padding: '11px 28px', background: ACCENT, color: TEXT, fontFamily: FONT, fontSize: 14, fontWeight: 700, borderRadius: 10, textDecoration: 'none' }}>
                    Iniciar sesión
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Cómo funciona */}
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '18px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 12 }}>¿Cómo funciona?</div>
            {[
              ['⚽', 'Predecí todos los partidos de la fase de grupos antes del 11 de junio'],
              ['🏆', 'Completá los especiales: campeón, goleador, revelación y más'],
              ['📊', 'Seguí el fixture y la tabla de posiciones en tiempo real'],
              ['🎯', 'Acumulá puntos: resultado exacto vale más que solo acertar el ganador'],
            ].map(([icon, text], i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: i < 3 ? 10 : 0 }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
                <span style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>{text}</span>
              </div>
            ))}
          </div>

        </div>
      </div>
    </>
  )
}
