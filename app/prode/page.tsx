'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const RED = '#D4001A'
const NAVY = '#002B7F'
const TEXT = '#111111'
const MUTED = '#6B7280'
const BORDER = '#E5E7EB'
const DEADLINE = new Date('2026-06-11T19:00:00Z')

type Tournament = { id: string; name: string; code: string; admin_id: string }
type View = 'join' | 'create'

function countdown() {
  const ms = DEADLINE.getTime() - Date.now()
  if (ms <= 0) return null
  return {
    days: Math.floor(ms / 86400000),
    hours: Math.floor((ms % 86400000) / 3600000),
    mins: Math.floor((ms % 3600000) / 60000),
  }
}

function genCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

export default function ProdePage() {
  const supabase = createClient()
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [view, setView] = useState<View>('join')
  const [code, setCode] = useState('')
  const [newName, setNewName] = useState('')
  const [working, setWorking] = useState(false)
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
          .select('prode_tournaments(id, name, code, admin_id)')
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
    setWorking(true); setError(null)
    const { data: t } = await supabase.from('prode_tournaments').select('id,name').eq('code', trimmed).maybeSingle()
    if (!t) { setError('Código no encontrado.'); setWorking(false); return }
    const { data: ex } = await supabase.from('prode_participants').select('id').eq('tournament_id', t.id).eq('user_id', user.id).maybeSingle()
    if (!ex) {
      const { error: e } = await supabase.from('prode_participants').insert({ tournament_id: t.id, user_id: user.id })
      if (e) { setError('No se pudo unirse.'); setWorking(false); return }
    }
    router.push(`/prode/${t.id}`)
  }

  const handleCreate = async () => {
    if (!user) { router.push('/login'); return }
    if (!newName.trim()) { setError('Ingresá un nombre.'); return }
    setWorking(true); setError(null)
    const code = genCode()
    const { data: t, error: e } = await supabase.from('prode_tournaments')
      .insert({ name: newName.trim(), code, admin_id: user.id, stage1_deadline: '2026-06-11T19:00:00Z' })
      .select().single()
    if (e || !t) { setError('No se pudo crear el torneo.'); setWorking(false); return }
    await supabase.from('prode_participants').insert({ tournament_id: t.id, user_id: user.id, paid: true })
    router.push(`/prode/${t.id}`)
  }

  const FONT_NORMAL = "'FWC2026', 'Ubuntu', sans-serif"
  const FONT_BLACK = "'FWC2026Black', 'Ubuntu', sans-serif"
  const FONT_COND = "'FWC2026UltraCond', 'Ubuntu', sans-serif"

  return (
    <>
      <style>{`
        @font-face { font-family: 'FWC2026'; src: url('/fonts/FWC2026-NormalRegular.77c3c249.ttf') format('truetype'); font-weight: 400; }
        @font-face { font-family: 'FWC2026'; src: url('/fonts/FWC2026-NormalBlack.2bd896c8.ttf') format('truetype'); font-weight: 900; }
        @font-face { font-family: 'FWC2026UltraCond'; src: url('/fonts/FWC2026-UltraCondensedBlack.8e6ba053.ttf') format('truetype'); font-weight: 900; }
        @font-face { font-family: 'FWC2026UltraCond'; src: url('/fonts/FWC2026-UltraCondensedMedium.4da29b9d.ttf') format('truetype'); font-weight: 500; }
        @font-face { font-family: 'FWC2026Cond'; src: url('/fonts/FWC2026-CondensedLight.c11e508e.ttf') format('truetype'); font-weight: 300; }
        @font-face { font-family: 'FWC2026Black'; src: url('/fonts/FWC2026-NormalBlack.2bd896c8.ttf') format('truetype'); font-weight: 900; }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .prode-page {
          min-height: 100vh; font-family: ${FONT_NORMAL};
          background-image: url('/images/fifa-26-background-light.png');
          background-repeat: repeat; background-size: 400px;
        }
        .wrap { max-width: 1100px; margin: 0 auto; padding: 24px 20px; }

        .inp {
          display: block; width: 100%; padding: 12px 16px; background: #fff;
          color: ${TEXT}; border: 1.5px solid ${BORDER}; border-radius: 10px;
          font-family: ${FONT_NORMAL}; font-size: 15px; outline: none; transition: border-color 0.15s;
        }
        .inp:focus { border-color: ${RED}; }
        .inp::placeholder { color: #bbb; }

        .btn-red {
          padding: 12px 22px; background: ${RED}; color: #fff; border: none;
          border-radius: 10px; font-family: ${FONT_NORMAL}; font-size: 14px; font-weight: 900;
          cursor: pointer; white-space: nowrap; letter-spacing: 0.3px;
        }
        .btn-red:disabled { opacity: 0.5; cursor: default; }
        .btn-red:hover:not(:disabled) { background: #b5001a; }

        .btn-navy {
          padding: 12px 22px; background: ${NAVY}; color: #fff; border: none;
          border-radius: 10px; font-family: ${FONT_NORMAL}; font-size: 14px; font-weight: 900;
          cursor: pointer; white-space: nowrap;
        }
        .btn-navy:hover { opacity: 0.9; }

        .card {
          background: rgba(255,255,255,0.92); border: 1.5px solid ${BORDER};
          border-radius: 16px; padding: 20px; backdrop-filter: blur(4px);
        }
        .t-card {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 18px; background: rgba(255,255,255,0.92); border: 1.5px solid ${BORDER};
          border-radius: 14px; text-decoration: none; transition: all 0.15s; cursor: pointer;
        }
        .t-card:hover { border-color: ${RED}; box-shadow: 0 2px 12px rgba(212,0,26,0.1); }

        .view-toggle { display: flex; background: #f0f0f0; border-radius: 10px; padding: 3px; gap: 3px; margin-bottom: 16px; }
        .view-btn { flex: 1; padding: 9px; border: none; border-radius: 8px; font-family: ${FONT_NORMAL}; font-size: 13px; font-weight: 900; cursor: pointer; transition: all 0.15s; background: transparent; color: ${MUTED}; }
        .view-btn.active { background: #fff; color: ${TEXT}; box-shadow: 0 1px 4px rgba(0,0,0,0.1); }

        .grid-2 { display: grid; grid-template-columns: 1fr; gap: 20px; }
        @media (min-width: 768px) { .grid-2 { grid-template-columns: 1fr 1fr; } .full { grid-column: 1 / -1; } }
      `}</style>

      <div className="prode-page">

        {/* Header */}
        <nav style={{ background: '#fff', borderBottom: `1px solid ${BORDER}`, boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 20px', height: 60, display: 'flex', alignItems: 'center', gap: 14 }}>
            <Link href="/" style={{ color: MUTED, textDecoration: 'none', fontSize: 20, lineHeight: 1, flexShrink: 0 }}>←</Link>
            <img src="/images/fifa-26-emblem.png" alt="FIFA 26" style={{ height: 36, width: 'auto', objectFit: 'contain' }} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 900, color: TEXT, fontFamily: FONT_BLACK, lineHeight: 1.2 }}>Prode Mundial 2026</div>
              <div style={{ fontSize: 11, color: MUTED, fontFamily: FONT_NORMAL }}>USA · Canadá · México</div>
            </div>
          </div>
        </nav>

        {/* Countdown */}
        <div style={{ position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: "url('/images/fifa-26-fondo-colores-corto.png')", backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.35 }} />
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} />
          <div style={{ position: 'relative', zIndex: 1, maxWidth: 1100, margin: '0 auto', padding: '28px 20px' }}>
            {timer ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 900, color: '#ffcc00', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12, fontFamily: FONT_NORMAL }}>
                    ⏱ Cierre de predicciones — Fase de grupos
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                    {[['DÍAS', timer.days], ['HORAS', timer.hours], ['MIN', timer.mins]].map(([label, val]) => (
                      <div key={label as string} style={{ textAlign: 'center' }}>
                        <div style={{ fontFamily: FONT_COND, fontSize: 56, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{String(val).padStart(2, '0')}</div>
                        <div style={{ fontSize: 9, color: '#aac', letterSpacing: 2, fontFamily: FONT_NORMAL, marginTop: 2 }}>{label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: '#aac', marginTop: 10, fontFamily: FONT_NORMAL }}>11 jun · 16:00 hora Argentina</div>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 16, color: '#f87171', fontWeight: 900, fontFamily: FONT_BLACK }}>Las predicciones de fase de grupos están cerradas.</div>
            )}
          </div>
        </div>

        <div className="wrap">
          <div className="grid-2">

            {/* Mis torneos */}
            {!loading && user && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 900, color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12, fontFamily: FONT_BLACK }}>Mis torneos</div>
                {tournaments.length === 0 ? (
                  <div className="card" style={{ textAlign: 'center', padding: '28px 20px' }}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>🏆</div>
                    <div style={{ fontSize: 14, color: TEXT, fontWeight: 900, fontFamily: FONT_BLACK, marginBottom: 4 }}>No estás en ningún torneo</div>
                    <div style={{ fontSize: 12, color: MUTED }}>Uníte o creá uno abajo.</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {tournaments.map(t => (
                      <Link key={t.id} href={`/prode/${t.id}`} className="t-card">
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 900, color: TEXT, fontFamily: FONT_BLACK, marginBottom: 3 }}>{t.name}</div>
                          <div style={{ fontSize: 11, color: MUTED }}>Código: <span style={{ color: RED, fontWeight: 700 }}>{t.code}</span></div>
                        </div>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke={MUTED} strokeWidth="2" strokeLinecap="round"/></svg>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Join / Create */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12, fontFamily: FONT_BLACK }}>
                {user ? 'Unirse o crear torneo' : 'Iniciá sesión para participar'}
              </div>
              <div className="card">
                {!user ? (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>⚽</div>
                    <div style={{ fontSize: 14, color: TEXT, fontWeight: 900, fontFamily: FONT_BLACK, marginBottom: 6 }}>Predecí con tus amigos</div>
                    <div style={{ fontSize: 13, color: MUTED, marginBottom: 18 }}>Necesitás una cuenta para participar.</div>
                    <Link href="/login" style={{ display: 'inline-block', padding: '12px 32px', background: RED, color: '#fff', fontFamily: FONT_BLACK, fontSize: 14, fontWeight: 900, borderRadius: 10, textDecoration: 'none' }}>
                      Iniciar sesión
                    </Link>
                  </div>
                ) : (
                  <>
                    <div className="view-toggle">
                      <button className={`view-btn${view === 'join' ? ' active' : ''}`} onClick={() => { setView('join'); setError(null) }}>Unirme</button>
                      <button className={`view-btn${view === 'create' ? ' active' : ''}`} onClick={() => { setView('create'); setError(null) }}>Crear torneo</button>
                    </div>

                    {error && (
                      <div style={{ background: '#fff0f1', color: RED, fontSize: 12, padding: '10px 14px', borderRadius: 8, marginBottom: 12, border: '1px solid #ffc0c5' }}>{error}</div>
                    )}

                    {view === 'join' && (
                      <>
                        <div style={{ fontSize: 13, color: MUTED, marginBottom: 12 }}>Ingresá el código del organizador.</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input className="inp" value={code} onChange={e => { setCode(e.target.value.toUpperCase()); setError(null) }} onKeyDown={e => e.key === 'Enter' && handleJoin()} placeholder="Código del torneo" maxLength={12} style={{ textTransform: 'uppercase', letterSpacing: 2, fontWeight: 700 }} />
                          <button className="btn-red" onClick={handleJoin} disabled={working || !code.trim()}>{working ? '...' : 'Entrar'}</button>
                        </div>
                      </>
                    )}

                    {view === 'create' && (
                      <>
                        <div style={{ fontSize: 13, color: MUTED, marginBottom: 12 }}>Creá tu propio torneo y compartí el código con tus amigos.</div>
                        <input className="inp" value={newName} onChange={e => { setNewName(e.target.value); setError(null) }} onKeyDown={e => e.key === 'Enter' && handleCreate()} placeholder="Nombre del torneo" style={{ marginBottom: 10 }} />
                        <button className="btn-navy" onClick={handleCreate} disabled={working || !newName.trim()} style={{ width: '100%' }}>
                          {working ? 'Creando...' : 'Crear torneo'}
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Cómo funciona */}
            <div className="full">
              <div style={{ fontSize: 11, fontWeight: 900, color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12, fontFamily: FONT_BLACK }}>¿Cómo funciona?</div>
              <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 0 }}>
                {[
                  { icon: '⚽', title: 'Predecí resultados', desc: 'Todos los partidos de la fase de grupos antes del 11 de junio' },
                  { icon: '🏆', title: 'Especiales', desc: 'Campeón, goleador, revelación, balón de oro y más' },
                  { icon: '📊', title: 'Seguí el ranking', desc: 'Tabla de posiciones con puntos en tiempo real' },
                  { icon: '🎯', title: 'Sistema de puntos', desc: 'Exacto: 12pts · Resultado: 7pts · Parcial: 5pts · Goleador: 2pts' },
                ].map(({ icon, title, desc }, i) => (
                  <div key={i} style={{ padding: '14px 16px', borderRight: i < 3 ? `1px solid ${BORDER}` : 'none', borderBottom: 'none' }}>
                    <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: TEXT, fontFamily: FONT_BLACK, marginBottom: 4 }}>{title}</div>
                    <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        <div style={{ padding: 16, textAlign: 'center', borderTop: `1px solid ${BORDER}` }}>
          <p style={{ fontSize: 11, color: MUTED, fontFamily: FONT_NORMAL }}>An app by CarpinchoGames ®</p>
        </div>
      </div>
    </>
  )
}
