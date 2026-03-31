'use client'

import { useState, useTransition } from 'react'
import { login, register, forgotPassword } from '@/lib/supabase/actions'

type View = 'login' | 'register' | 'forgot'

export default function LoginPage() {
  const [view, setView] = useState<View>('login')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const switchView = (v: View) => { setError(null); setSuccess(null); setView(v) }

  const handleLogin = (formData: FormData) => {
    setError(null)
    startTransition(async () => {
      const result = await login(formData)
      if (result?.error) setError(result.error)
    })
  }

  const handleRegister = (formData: FormData) => {
    setError(null)
    startTransition(async () => {
      const result = await register(formData)
      if (result?.error) setError(result.error)
      if (result?.success) setSuccess(result.success)
    })
  }

  const handleForgot = (formData: FormData) => {
    setError(null)
    startTransition(async () => {
      const result = await forgotPassword(formData)
      if (result?.error) setError(result.error)
      if (result?.success) setSuccess(result.success)
    })
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .inp {
          display: block; width: 100%; padding: 12px 16px;
          background-color: #c1c1c6 !important; color: #01050F !important;
          -webkit-text-fill-color: #01050F !important;
          border: none; border-radius: 8px;
          font-family: 'Ubuntu', sans-serif; font-size: 14px; font-weight: 500;
          outline: none; margin-bottom: 16px;
        }
        .inp::placeholder { color: #4a4a55 !important; -webkit-text-fill-color: #4a4a55 !important; }
        .inp:focus { outline: 2px solid #055074; outline-offset: 1px; }
        .inp:-webkit-autofill, .inp:-webkit-autofill:hover, .inp:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0 1000px #c1c1c6 inset !important;
          -webkit-text-fill-color: #01050F !important;
        }
        .btn-primary { display: block; width: 100%; padding: 13px; background: #055074; color: #c1c1c6; border: none; border-radius: 10px; font-family: 'Ubuntu', sans-serif; font-size: 15px; font-weight: 700; cursor: pointer; margin-bottom: 12px; }
        .btn-primary:hover { background: #04447b; }
        .btn-primary:disabled { opacity: 0.5; }
        .btn-secondary { display: block; width: 100%; padding: 13px; background: #1e1736; color: #c1c1c6; border: none; border-radius: 10px; font-family: 'Ubuntu', sans-serif; font-size: 15px; font-weight: 700; cursor: pointer; margin-bottom: 12px; }
        .btn-secondary:hover { background: #2a2448; }
        .btn-outline { display: block; width: 100%; padding: 12px; background: transparent; color: #706c7e; border: 1px solid #1e1736; border-radius: 10px; font-family: 'Ubuntu', sans-serif; font-size: 14px; cursor: pointer; margin-bottom: 8px; text-decoration: none; text-align: center; }
        .btn-outline:hover { border-color: #706c7e; color: #c1c1c6; }
        .btn-back { display: block; width: 100%; padding: 8px; background: none; border: none; color: #706c7e; font-family: 'Ubuntu', sans-serif; font-size: 13px; cursor: pointer; }
        .btn-back:hover { color: #c1c1c6; }
        .forgot-link { background: none; border: none; color: #706c7e; font-family: 'Ubuntu', sans-serif; font-size: 12px; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; float: right; margin-bottom: 20px; }
        .forgot-link:hover { color: #c1c1c6; }
        .divider { display: flex; align-items: center; gap: 12px; margin: 8px 0 16px; }
        .divider-line { flex: 1; height: 1px; background: #1e1736; }
        .divider-text { color: #706c7e; font-family: 'Ubuntu', sans-serif; font-size: 12px; }
      `}</style>

      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#01050F', padding: '32px 16px' }}>
        <div style={{ width: '100%', maxWidth: '400px' }}>

          <div style={{ backgroundColor: '#01050F', border: '1px solid #1e1736', borderRadius: '20px', padding: '40px 32px 32px' }}>

            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <div style={{ width: '56px', height: '56px', backgroundColor: '#055074', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <rect x="4" y="10" width="24" height="16" rx="3" stroke="#c1c1c6" strokeWidth="1.8"/>
                  <path d="M4 15h24" stroke="#c1c1c6" strokeWidth="1.8"/>
                  <circle cx="10" cy="22" r="2" fill="#c1c1c6"/>
                  <circle cx="16" cy="22" r="2" fill="#c1c1c6"/>
                  <circle cx="22" cy="22" r="2" fill="#c1c1c6"/>
                  <path d="M11 10V8a5 5 0 0 1 10 0v2" stroke="#c1c1c6" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </div>
              <h1 style={{ fontFamily: "'Ubuntu', sans-serif", fontSize: '26px', fontWeight: 700, color: '#c1c1c6', marginBottom: '4px' }}>Ranchadapp</h1>
              <p style={{ fontFamily: "'Ubuntu', sans-serif", fontSize: '13px', color: '#706c7e' }}>Todo para tus ranchadas</p>
            </div>

            {error && <div style={{ backgroundColor: '#2a0a0a', color: '#f87171', fontFamily: "'Ubuntu', sans-serif", fontSize: '13px', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px' }}>{error}</div>}
            {success && <div style={{ backgroundColor: '#0a2a1a', color: '#4ade80', fontFamily: "'Ubuntu', sans-serif", fontSize: '13px', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px' }}>{success}</div>}

            {view === 'login' && (
              <form action={handleLogin}>
                <input className="inp" name="identifier" type="text" placeholder="Mail o usuario" required autoComplete="username" />
                <input className="inp" name="password" type="password" placeholder="Contraseña" required style={{ marginBottom: '4px' }} />
                <div style={{ textAlign: 'right', marginBottom: '20px' }}>
                  <button type="button" className="forgot-link" onClick={() => switchView('forgot')}>¿Olvidaste tu contraseña?</button>
                </div>
                <button type="submit" className="btn-primary" disabled={isPending}>
                  {isPending ? 'Cargando...' : 'Iniciar sesión'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => switchView('register')}>Crear cuenta nueva</button>
                <div className="divider"><div className="divider-line"/><span className="divider-text">o</span><div className="divider-line"/></div>
                <a href="/" className="btn-outline">Continuar sin iniciar sesión</a>
                <p style={{ fontFamily: "'Ubuntu', sans-serif", fontSize: '11px', color: '#706c7e', textAlign: 'center', marginTop: '8px' }}>Sin cuenta no se guardan tus estadísticas ni progreso</p>
              </form>
            )}

            {view === 'register' && (
              <form action={handleRegister}>
                <p style={{ fontFamily: "'Ubuntu', sans-serif", fontSize: '19px', fontWeight: 700, color: '#c1c1c6', marginBottom: '20px' }}>Crear cuenta</p>
                <input className="inp" name="username" type="text" placeholder="Nombre de usuario" required />
                <input className="inp" name="email" type="email" placeholder="Mail" required />
                <input className="inp" name="password" type="password" placeholder="Contraseña" required />
                <input className="inp" name="confirmPassword" type="password" placeholder="Confirmar contraseña" required />
                <button type="submit" className="btn-primary" disabled={isPending}>{isPending ? 'Cargando...' : 'Registrarme'}</button>
                <button type="button" className="btn-back" onClick={() => switchView('login')}>← Volver al inicio</button>
              </form>
            )}

            {view === 'forgot' && (
              <form action={handleForgot}>
                <p style={{ fontFamily: "'Ubuntu', sans-serif", fontSize: '19px', fontWeight: 700, color: '#c1c1c6', marginBottom: '8px' }}>Recuperar contraseña</p>
                <p style={{ fontFamily: "'Ubuntu', sans-serif", fontSize: '13px', color: '#706c7e', marginBottom: '20px' }}>Te mandamos un link a tu mail para resetear tu contraseña.</p>
                <input className="inp" name="email" type="email" placeholder="Mail" required />
                <button type="submit" className="btn-primary" disabled={isPending}>{isPending ? 'Enviando...' : 'Enviar link'}</button>
                <button type="button" className="btn-back" onClick={() => switchView('login')}>← Volver al inicio</button>
              </form>
            )}

          </div>

          <p style={{ fontFamily: "'Ubuntu', sans-serif", fontSize: '11px', color: '#706c7e', textAlign: 'center', marginTop: '16px' }}>An app by CarpinchoGames ®</p>
        </div>
      </main>
    </>
  )
}