'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const BTN_PRIMARY: React.CSSProperties = {
  width: '100%', padding: '12px', background: '#04447b', color: '#ffffff',
  border: 'none', borderRadius: '9px', fontSize: '14px', fontWeight: 700,
  fontFamily: "'Ubuntu', sans-serif", cursor: 'pointer', display: 'block',
  marginBottom: '8px', transition: 'background 0.15s',
}
const BTN_SECONDARY: React.CSSProperties = {
  width: '100%', padding: '12px', background: '#ffffff', color: '#04447b',
  border: '2px solid #04447b', borderRadius: '9px', fontSize: '14px', fontWeight: 700,
  fontFamily: "'Ubuntu', sans-serif", cursor: 'pointer', display: 'block',
  marginBottom: '8px',
}
const BTN_DANGER: React.CSSProperties = {
  width: '100%', padding: '12px', background: '#fef2f2', color: '#dc2626',
  border: '2px solid #fca5a5', borderRadius: '9px', fontSize: '14px', fontWeight: 700,
  fontFamily: "'Ubuntu', sans-serif", cursor: 'pointer', display: 'block',
  marginBottom: '8px',
}
const BTN_DANGER_OUTLINE: React.CSSProperties = {
  width: '100%', padding: '12px', background: 'transparent', color: '#dc2626',
  border: '1px solid #fca5a5', borderRadius: '9px', fontSize: '14px', fontWeight: 700,
  fontFamily: "'Ubuntu', sans-serif", cursor: 'pointer', display: 'block',
}
const SECTION: React.CSSProperties = {
  background: '#ffffff', border: '2px solid #04447b', borderRadius: '14px',
  marginBottom: '14px', overflow: 'hidden',
}
const SECTION_HEADER: React.CSSProperties = {
  padding: '13px 18px', borderBottom: '1px solid #e6f0fb', background: '#f0f7ff',
}
const SECTION_TITLE: React.CSSProperties = { fontSize: '13px', fontWeight: 700, color: '#0b2659' }
const SECTION_BODY: React.CSSProperties = { padding: '18px' }
const LABEL: React.CSSProperties = {
  fontSize: '10px', fontWeight: 700, color: '#04447b', letterSpacing: '0.6px',
  textTransform: 'uppercase', marginBottom: '6px', display: 'block',
}
const INP: React.CSSProperties = {
  width: '100%', padding: '10px 13px', background: '#f3f6fa', color: '#01050F',
  border: '1.5px solid #c8d8ec', borderRadius: '8px', fontSize: '14px',
  fontFamily: "'Ubuntu', sans-serif", marginBottom: '12px', outline: 'none',
  boxSizing: 'border-box',
}
const NAV_BTN: React.CSSProperties = {
  fontSize: '12px', color: '#c1c1c6', border: '1px solid rgba(255,255,255,0.25)',
  borderRadius: '8px', padding: '6px 12px', background: 'transparent',
  cursor: 'pointer', fontFamily: "'Ubuntu', sans-serif",
}

export default function CuentaPage() {
  const supabase = createClient()
  const router = useRouter()

  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [username, setUsername] = useState('')
  const [originalUsername, setOriginalUsername] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [initials, setInitials] = useState('?')
  const [userId, setUserId] = useState('')

  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [saveMsgType, setSaveMsgType] = useState<'success'|'error'>('success')
  const [passMsg, setPassMsg] = useState<string | null>(null)
  const [passSent, setPassSent] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)
  const [usernameStatus, setUsernameStatus] = useState<'idle'|'checking'|'available'|'taken'|'invalid'>('idle')
  const usernameTimer = useRef<NodeJS.Timeout | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setEmail(user.email ?? '')
      setUserId(user.id)
      setInitials((user.email ?? 'U').substring(0, 2).toUpperCase())
      const meta = user.user_metadata ?? {}
      setNombre(meta.nombre ?? '')
      setApellido(meta.apellido ?? '')
      setUsername(meta.username ?? '')
      setOriginalUsername(meta.username ?? '')
      setAvatarUrl(meta.avatar_url ?? null)
    })
  }, [])

  const handleUsernameChange = (val: string) => {
    setUsername(val)
    if (usernameTimer.current) clearTimeout(usernameTimer.current)
    if (!val || val === originalUsername) { setUsernameStatus('idle'); return }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(val)) { setUsernameStatus('invalid'); return }
    setUsernameStatus('checking')
    usernameTimer.current = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('username').eq('username', val).single()
      setUsernameStatus(data ? 'taken' : 'available')
    }, 600)
  }

  const handleSave = async () => {
    if (usernameStatus === 'taken' || usernameStatus === 'invalid') return
    setSaving(true); setSaveMsg(null)
    const { error } = await supabase.auth.updateUser({ data: { nombre, apellido, username } })
    if (!error) {
      await supabase.from('profiles').upsert({
        id: userId,
        username,
        nombre,
        apellido,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      })
    }
    setSaving(false)
    if (error) { setSaveMsgType('error'); setSaveMsg('Error al guardar. Intentá de nuevo.') }
    else { setSaveMsgType('success'); setSaveMsg('✓ Cambios guardados correctamente.'); setOriginalUsername(username); setUsernameStatus('idle') }
    setTimeout(() => setSaveMsg(null), 4000)
  }

  const handlePasswordReset = async () => {
    setPassSent(false); setPassMsg(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    if (error) setPassMsg('Error al enviar el mail. Intentá de nuevo.')
    else { setPassSent(true); setPassMsg(`✓ Te enviamos el link a ${email}. Revisá tu bandeja de entrada.`) }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setUploadMsg('La imagen no puede superar los 2MB.'); return }
    setUploadMsg('Subiendo...')
    const ext = file.name.split('.').pop()
    const path = `avatars/${userId}.${ext}`
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (uploadError) { setUploadMsg('Error al subir la imagen.'); return }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    await supabase.auth.updateUser({ data: { avatar_url: publicUrl } })
    await supabase.from('profiles').upsert({ id: userId, avatar_url: publicUrl, updated_at: new Date().toISOString() })
    setAvatarUrl(publicUrl)
    setUploadMsg('✓ Foto actualizada.')
    setTimeout(() => setUploadMsg(null), 3000)
  }

  const handleDelete = async () => {
    setDeleting(true)
    const res = await fetch('/api/delete-account', { method: 'POST' })
    if (res.ok) { await supabase.auth.signOut(); router.push('/') }
    else { setDeleting(false); alert('Error al eliminar la cuenta. Contactá soporte.') }
  }

  const usernameHint = () => {
    if (usernameStatus === 'checking') return { msg: 'Verificando...', color: '#5a7898' }
    if (usernameStatus === 'available') return { msg: '✓ Disponible', color: '#16a34a' }
    if (usernameStatus === 'taken') return { msg: '✗ Ya está en uso', color: '#dc2626' }
    if (usernameStatus === 'invalid') return { msg: 'Solo letras, números y _ (3-20 caracteres)', color: '#d97706' }
    return null
  }
  const hint = usernameHint()

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input.cuenta-inp { background: #f3f6fa !important; color: #01050F !important; -webkit-text-fill-color: #01050F !important; border: 1.5px solid #c8d8ec !important; }
        input.cuenta-inp:focus { border-color: #04447b !important; outline: 2px solid #04447b; outline-offset: 1px; }
        input.cuenta-inp::placeholder { color: #8aaccb !important; -webkit-text-fill-color: #8aaccb !important; }
        input.cuenta-inp:-webkit-autofill { -webkit-box-shadow: 0 0 0 1000px #f3f6fa inset !important; -webkit-text-fill-color: #01050F !important; }
      `}</style>

      <div style={{ background: '#0b2659', minHeight: '100vh', fontFamily: "'Ubuntu', sans-serif", paddingBottom: '40px' }}>

        {/* Navbar */}
        <nav style={{ background: '#04447b', padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
            <div style={{ width: '28px', height: '28px', background: '#055074', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 32 32" fill="none"><rect x="4" y="10" width="24" height="16" rx="3" stroke="#c1c1c6" strokeWidth="2.2"/><path d="M4 15h24" stroke="#c1c1c6" strokeWidth="2.2"/><circle cx="10" cy="22" r="2" fill="#c1c1c6"/><circle cx="16" cy="22" r="2" fill="#c1c1c6"/><circle cx="22" cy="22" r="2" fill="#c1c1c6"/><path d="M11 10V8a5 5 0 0 1 10 0v2" stroke="#c1c1c6" strokeWidth="2.2" strokeLinecap="round"/></svg>
            </div>
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#c1c1c6' }}>Mi cuenta</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={NAV_BTN} onClick={() => router.push('/amigos')}>Amigos</button>
            <button style={NAV_BTN} onClick={() => router.push('/')}>← Inicio</button>
          </div>
        </nav>

        <div style={{ maxWidth: '480px', margin: '0 auto', padding: '20px 18px' }}>

          {/* Foto de perfil */}
          <div style={SECTION}>
            <div style={SECTION_HEADER}><span style={SECTION_TITLE}>Foto de perfil</span></div>
            <div style={SECTION_BODY}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '18px' }}>
                <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: '#055074', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: 700, color: '#fff', flexShrink: 0, overflow: 'hidden', border: '3px solid #04447b' }}>
                  {avatarUrl ? <img src={avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span>{initials}</span>}
                </div>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#0b2659', marginBottom: '3px' }}>{username || email}</div>
                  <div style={{ fontSize: '12px', color: '#5a7898' }}>{email}</div>
                </div>
              </div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={handleAvatarUpload} />
              <button style={BTN_PRIMARY} onClick={() => fileRef.current?.click()}>Subir foto</button>
              {uploadMsg && (
                <div style={{ marginTop: '8px', padding: '9px 12px', borderRadius: '8px', fontSize: '12px', background: uploadMsg.startsWith('✓') ? '#f0fdf4' : '#fef2f2', color: uploadMsg.startsWith('✓') ? '#16a34a' : '#dc2626', border: `1px solid ${uploadMsg.startsWith('✓') ? '#86efac' : '#fca5a5'}` }}>{uploadMsg}</div>
              )}
              <div style={{ fontSize: '11px', color: '#5a7898', textAlign: 'center', marginTop: '8px' }}>JPG o PNG · máx 2MB</div>
            </div>
          </div>

          {/* Datos personales */}
          <div style={SECTION}>
            <div style={SECTION_HEADER}><span style={SECTION_TITLE}>Datos personales</span></div>
            <div style={SECTION_BODY}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={LABEL}>Nombre</label>
                  <input className="cuenta-inp" style={INP} type="text" placeholder="Erik" value={nombre} onChange={e => setNombre(e.target.value)} />
                </div>
                <div>
                  <label style={LABEL}>Apellido</label>
                  <input className="cuenta-inp" style={INP} type="text" placeholder="Oterochio" value={apellido} onChange={e => setApellido(e.target.value)} />
                </div>
              </div>
              <label style={LABEL}>Nombre de usuario</label>
              <input
                className="cuenta-inp"
                style={{ ...INP, marginBottom: hint ? '4px' : '12px', borderColor: usernameStatus === 'taken' ? '#fca5a5' : usernameStatus === 'available' ? '#86efac' : undefined }}
                type="text"
                placeholder="carpincho42"
                value={username}
                onChange={e => handleUsernameChange(e.target.value)}
              />
              {hint && <div style={{ fontSize: '11px', color: hint.color, marginBottom: '12px' }}>{hint.msg}</div>}
              <button
                style={{ ...BTN_PRIMARY, opacity: saving || usernameStatus === 'taken' || usernameStatus === 'invalid' || usernameStatus === 'checking' ? 0.5 : 1 }}
                onClick={handleSave}
                disabled={saving || usernameStatus === 'taken' || usernameStatus === 'invalid' || usernameStatus === 'checking'}
              >
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
              {saveMsg && (
                <div style={{ marginTop: '8px', padding: '9px 12px', borderRadius: '8px', fontSize: '12px', background: saveMsgType === 'success' ? '#f0fdf4' : '#fef2f2', color: saveMsgType === 'success' ? '#16a34a' : '#dc2626', border: `1px solid ${saveMsgType === 'success' ? '#86efac' : '#fca5a5'}` }}>{saveMsg}</div>
              )}
            </div>
          </div>

          {/* Contraseña */}
          <div style={SECTION}>
            <div style={SECTION_HEADER}><span style={SECTION_TITLE}>Contraseña</span></div>
            <div style={SECTION_BODY}>
              <p style={{ fontSize: '13px', color: '#5a7898', lineHeight: 1.6, marginBottom: '16px' }}>
                Te vamos a enviar un link a tu mail para que puedas crear una nueva contraseña de forma segura.
              </p>
              <button style={{ ...BTN_SECONDARY, opacity: passSent ? 0.5 : 1 }} onClick={handlePasswordReset} disabled={passSent}>
                Cambiar contraseña
              </button>
              {passMsg && (
                <div style={{ marginTop: '8px', padding: '9px 12px', borderRadius: '8px', fontSize: '12px', background: passSent ? '#f0fdf4' : '#fef2f2', color: passSent ? '#16a34a' : '#dc2626', border: `1px solid ${passSent ? '#86efac' : '#fca5a5'}` }}>{passMsg}</div>
              )}
            </div>
          </div>

          {/* Eliminar cuenta */}
          <div style={{ background: '#ffffff', border: '2px solid #fca5a5', borderRadius: '14px', marginBottom: '14px', overflow: 'hidden' }}>
            <div style={{ padding: '13px 18px', borderBottom: '1px solid #fde8e8', background: '#fff5f5' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#dc2626' }}>Eliminar cuenta</span>
            </div>
            <div style={SECTION_BODY}>
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '10px 13px', marginBottom: '14px', fontSize: '12px', color: '#dc2626', lineHeight: 1.5 }}>
                ⚠️ Esta acción es permanente e irreversible. Se eliminarán todos tus datos, ranchadas e historial.
              </div>
              {!showDeleteConfirm ? (
                <button style={BTN_DANGER} onClick={() => setShowDeleteConfirm(true)}>
                  Quiero eliminar mi cuenta
                </button>
              ) : (
                <div>
                  <p style={{ fontSize: '13px', color: '#5a7898', marginBottom: '12px', lineHeight: 1.6 }}>
                    Para confirmar escribí <strong style={{ color: '#dc2626' }}>soy ortiva</strong> en el campo de abajo.
                  </p>
                  <input
                    className="cuenta-inp"
                    style={INP}
                    type="text"
                    placeholder="soy ortiva"
                    value={deleteInput}
                    onChange={e => setDeleteInput(e.target.value)}
                  />
                  <button
                    style={{ ...BTN_DANGER, opacity: deleteInput.toLowerCase() !== 'soy ortiva' || deleting ? 0.4 : 1, marginBottom: '8px' }}
                    disabled={deleteInput.toLowerCase() !== 'soy ortiva' || deleting}
                    onClick={handleDelete}
                  >
                    {deleting ? 'Eliminando...' : 'Confirmar eliminación definitiva'}
                  </button>
                  <button style={BTN_DANGER_OUTLINE} onClick={() => { setShowDeleteConfirm(false); setDeleteInput('') }}>
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  )
}