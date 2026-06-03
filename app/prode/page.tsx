'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
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
const DEADLINE = new Date('2026-06-11T19:00:00Z')

type Tournament = {
  id: string; name: string; code: string; stage1_deadline: string; admin_id: string
}

function countdown() {
  const ms = DEADLINE.getTime() - Date.now()
  if (ms <= 0) return null
  return {
    days: Math.floor(ms / 86400000),
    hours: Math.floor((ms % 86400000) / 3600000),
    mins: Math.floor((ms % 3600000) / 60000),
  }
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
    const id = setInterval(() => setTimer(countdown()), 30000)
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
          setTournaments(data.map((d: any) => d.prode_tournaments).filter(Boolean) as Tournament[])
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
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${BG}; }

        .prode-wrap { max-width: 1100px; margin: 0 auto; padding: 24px 20px; }
        .prode-grid { display: grid; grid-template-columns: 1fr; gap: 20px; }
        @media (min-width: 768px) {
          .prode-grid { grid-template-columns: 1fr 1fr; gap: 28px; }
          .prode-full { grid-column: 1 / -1; }
        }

        .inp {
          display: block; width: 100%; padding: 12px 16px;
          background: ${BG}; color: ${TEXT}; border: 1.5px solid ${BORDER};
          border-radius: 10px; font-family: ${FONT}; font-size: 15px; font-weight: 700;
          outline: none; letter-spacing: 1px;
        }
        .inp:focus { border-color: ${RED}; }
        .inp::placeholder { color: #aaa; letter-spacing: 0; font-weight: 400; }

        .btn-red {
          padding: 12px 20px; background: ${RED}; color: #fff; border: none;
          border-radius: 10px; font-family: ${FONT}; font-size: 14px; font-weight: 700;
          cursor: pointer; white-space: nowrap;
        }
        .btn-red:hover { background: #b5001a; }
        .btn-red:disabled { opacity: 0.4; cursor: default; }

        .t-card {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 18px; background: ${BG}; border: 1.5px solid ${BORDER};
          border-radius: 14px; text-decoration: none; transition: border-color 0.15s, box-shadow 0.15s;
        }
        .t-card:hover { border-color: ${RED}; box-shadow: 0 2px 12px rgba(212,0,26,0.08); }

        .section-title {
          font-family: ${FONT}; font-size: 11px; font-weight: 700;
          color: ${MUTED}; letter-spacing: 1.2px; text-transform: uppercase; margin-bottom: 12px;
        }

        .how-item { display: flex; gap: 12px; align-items: flex-start; padding: 12px 0; border-bottom: 1px solid ${BORDER}; }
        .how-item:last-child { border-bottom: none; }
        .how-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
      `}</style>

      <div style={{ background: BG, minHeight: '100vh', fontFamily: FONT }}>

        {/* Header */}
        <nav style={{ background: '#000', borderBottom: `1px solid #111` }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', gap: 14 }}>
            <Link href="/" style={{ color: '#999', textDecoration: 'none', fontSize: 20, lineHeight: 1, flexShrink: 0 }}>←</Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, background: RED, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>⚽</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>Prode Mundial 2026</div>
                <div style={{ fontSize: 11, color: '#999' }}>USA · Canadá · México</div>
              </div>
            </div>
          </div>
        </nav>

        {/* Hero banner */}
        <div style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #001855 50%, #1a0010 100%)`, padding: '32px 20px' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            {timer ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '24px', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
                    ⏱ Cierre de predicciones — Fase de grupos
                  </div>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
                    {[['días', timer.days], ['horas', timer.hours], ['min', timer.mins]].map(([label, val], i) => (
                      <div key={i} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 42, fontWeight: 700, color: '#fff', lineHeight: 1 }}>{String(val).padStart(2, '0')}</div>
                        <div style={{ fontSize: 11, color: '#8899bb', marginTop: 2 }}>{label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: '#8899bb', marginTop: 10 }}>11 jun · 16:00 hora Argentina</div>
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.07)', borderRadius: 12, padding: '14px 20px' }}>
                    <div style={{ fontSize: 11, color: '#8899bb', marginBottom: 4 }}>Torneo activo</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: GOLD }}>VIOLINES</div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 16, color: '#f87171', fontWeight: 700 }}>
                Las predicciones de fase de grupos están cerradas.
              </div>
            )}
          </div>
        </div>

        <div className="prode-wrap">
          <div className="prode-grid">

            {/* Mis torneos */}
            {!loading && user && (
              <div>
                <div className="section-title">Mis torneos</div>
                {tournaments.length === 0 ? (
                  <div style={{ background: CARD_BG, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '24px 20px', textAlign: 'center' }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>🏆</div>
                    <div style={{ fontSize: 14, color: TEXT, fontWeight: 600, marginBottom: 4 }}>Todavía no estás en ningún torneo</div>
                    <div style={{ fontSize: 12, color: MUTED }}>Ingresá un código para unirte.</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {tournaments.map(t => (
                      <Link key={t.id} href={`/prode/${t.id}`} className="t-card">
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, marginBottom: 3 }}>{t.name}</div>
                          <div style={{ fontSize: 11, color: MUTED }}>Código: <span style={{ color: RED, fontWeight: 700 }}>{t.code}</span></div>
                        </div>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke={MUTED} strokeWidth="2" strokeLinecap="round"/></svg>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Join form */}
            <div>
              <div className="section-title">{user ? 'Unirse a un torneo' : 'Iniciá sesión para participar'}</div>
              <div style={{ background: CARD_BG, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: 20 }}>
                {user ? (
                  <>
                    <div style={{ fontSize: 13, color: MUTED, marginBottom: 14 }}>
                      Ingresá el código que te dio el organizador para sumarte al torneo.
                    </div>
                    {error && (
                      <div style={{ background: '#fff0f1', color: RED, fontSize: 12, padding: '10px 14px', borderRadius: 8, marginBottom: 12, border: `1px solid #ffc0c5` }}>
                        {error}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        className="inp"
                        value={code}
                        onChange={e => { setCode(e.target.value.toUpperCase()); setError(null) }}
                        onKeyDown={e => e.key === 'Enter' && handleJoin()}
                        placeholder="Código del torneo"
                        maxLength={12}
                      />
                      <button
                        className="btn-red"
                        onClick={handleJoin}
                        disabled={joining || !code.trim()}
                      >
                        {joining ? '...' : 'Entrar'}
                      </button>
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: '8px 0' }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>⚽</div>
                    <div style={{ fontSize: 14, color: TEXT, fontWeight: 600, marginBottom: 6 }}>Predecí con tus amigos</div>
                    <div style={{ fontSize: 13, color: MUTED, marginBottom: 18 }}>Necesitás una cuenta para participar en el prode.</div>
                    <Link href="/login" style={{ display: 'inline-block', padding: '12px 32px', background: RED, color: '#fff', fontFamily: FONT, fontSize: 14, fontWeight: 700, borderRadius: 10, textDecoration: 'none' }}>
                      Iniciar sesión
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {/* ¿Cómo funciona? */}
            <div className="prode-full">
              <div className="section-title">¿Cómo funciona?</div>
              <div style={{ background: CARD_BG, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '4px 20px' }}>
                {[
                  { icon: '⚽', bg: '#fff0f1', label: 'Predecí todos los partidos de la fase de grupos antes del 11 de junio' },
                  { icon: '🏆', bg: '#fffbf0', label: 'Completá los especiales: campeón, goleador, revelación y más' },
                  { icon: '📊', bg: '#f0f4ff', label: 'Seguí el fixture y la tabla de posiciones en tiempo real' },
                  { icon: '🎯', bg: '#f0fff4', label: 'Resultado exacto: 3 pts · Ganador/empate correcto: 1 pt · Incorrecto: 0 pts' },
                ].map(({ icon, bg, label }) => (
                  <div key={label} className="how-item">
                    <div className="how-icon" style={{ background: bg }}>{icon}</div>
                    <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, paddingTop: 8 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        <div style={{ borderTop: `1px solid ${BORDER}`, padding: 16, textAlign: 'center' }}>
          <p style={{ fontSize: 11, color: '#aaa', fontFamily: FONT }}>An app by CarpinchoGames ®</p>
        </div>
      </div>
    </>
  )
}
