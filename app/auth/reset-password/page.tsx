'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const FONT = "'Ubuntu', sans-serif"
const RED = '#D4001A'
const BORDER = '#E5E7EB'
const TEXT = '#111111'
const MUTED = '#6B7280'

type Status = 'loading' | 'ready' | 'invalid' | 'success'

export default function ResetPasswordPage() {
  const supabase = createClient()
  const router = useRouter()
  const [status, setStatus] = useState<Status>('loading')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Supabase redirige aquí con tokens en el hash (#access_token=...&type=recovery)
    // El cliente de Supabase los detecta automáticamente y emite PASSWORD_RECOVERY
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setStatus('ready')
      }
    })

    // Si ya hay sesión activa (ej: abrieron el link en el mismo navegador donde ya estaban logueados)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setStatus('ready')
    })

    // Si después de 4s no llega nada, el link es inválido o expiró
    const timeout = setTimeout(() => {
      setStatus(prev => prev === 'loading' ? 'invalid' : prev)
    }, 4000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!password || !confirm) {
      setError('Completá ambos campos.')
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }

    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError('No se pudo actualizar la contraseña. Pedí un nuevo link.')
      setSaving(false)
      return
    }

    await supabase.auth.signOut()
    setStatus('success')
    setTimeout(() => router.push('/login'), 2500)
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .inp {
          display: block; width: 100%; padding: 12px 16px;
          background: #f7f8fa; color: ${TEXT}; border: 1.5px solid ${BORDER};
          border-radius: 10px; font-family: ${FONT}; font-size: 14px; outline: none;
          margin-bottom: 14px; transition: border-color 0.15s;
        }
        .inp:focus { border-color: ${RED}; background: #fff; }
        .btn {
          display: block; width: 100%; padding: 13px;
          background: ${RED}; color: #fff; border: none; border-radius: 10px;
          font-family: ${FONT}; font-size: 15px; font-weight: 700; cursor: pointer;
        }
        .btn:disabled { opacity: 0.5; cursor: default; }
      `}</style>

      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f4f5', padding: '32px 16px', fontFamily: FONT }}>
        <div style={{ width: '100%', maxWidth: 400 }}>

          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ width: 52, height: 52, background: '#000', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', fontSize: 26 }}>🎮</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: TEXT }}>Ranchadapp</div>
          </div>

          <div style={{ background: '#fff', border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '32px 28px' }}>

            {/* Loading */}
            {status === 'loading' && (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <div style={{ fontSize: 14, color: MUTED }}>Verificando el link...</div>
              </div>
            )}

            {/* Invalid */}
            {status === 'invalid' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 8 }}>Link inválido o expirado</div>
                <div style={{ fontSize: 13, color: MUTED, marginBottom: 20, lineHeight: 1.6 }}>
                  El link de recuperación es de un solo uso y expira en 24 horas.<br/>Pedí un nuevo link.
                </div>
                <Link href="/login" style={{ display: 'inline-block', padding: '11px 24px', background: RED, color: '#fff', fontFamily: FONT, fontSize: 14, fontWeight: 700, borderRadius: 10, textDecoration: 'none' }}>
                  Volver al inicio
                </Link>
              </div>
            )}

            {/* Form */}
            {status === 'ready' && (
              <form onSubmit={handleSubmit}>
                <div style={{ fontSize: 18, fontWeight: 700, color: TEXT, marginBottom: 6 }}>Nueva contraseña</div>
                <div style={{ fontSize: 13, color: MUTED, marginBottom: 22, lineHeight: 1.5 }}>Elegí una contraseña nueva para tu cuenta.</div>

                {error && (
                  <div style={{ background: '#fff0f1', color: RED, fontSize: 13, padding: '10px 14px', borderRadius: 8, marginBottom: 14, border: '1px solid #ffc0c5' }}>
                    {error}
                  </div>
                )}

                <input
                  className="inp"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Nueva contraseña"
                  autoFocus
                  autoComplete="new-password"
                />
                <input
                  className="inp"
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Confirmar contraseña"
                  autoComplete="new-password"
                />
                <button className="btn" type="submit" disabled={saving}>
                  {saving ? 'Guardando...' : 'Guardar contraseña'}
                </button>
              </form>
            )}

            {/* Success */}
            {status === 'success' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 8 }}>¡Contraseña actualizada!</div>
                <div style={{ fontSize: 13, color: MUTED }}>Redirigiendo al inicio de sesión...</div>
              </div>
            )}

          </div>

          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Link href="/login" style={{ fontSize: 12, color: MUTED, textDecoration: 'none' }}>← Volver al inicio</Link>
          </div>

        </div>
      </main>
    </>
  )
}
