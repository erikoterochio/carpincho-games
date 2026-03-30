'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function CuentaPage() {
  const supabase = createClient()
  const router = useRouter()

  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [username, setUsername] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [initials, setInitials] = useState('?')

  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [passMsg, setPassMsg] = useState<string | null>(null)
  const [passSent, setPassSent] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)

  // Cargar datos del usuario al montar
  useState(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setEmail(user.email ?? '')
      setInitials((user.email ?? 'U').substring(0, 2).toUpperCase())
      const meta = user.user_metadata ?? {}
      setNombre(meta.nombre ?? '')
      setApellido(meta.apellido ?? '')
      setUsername(meta.username ?? '')
      setAvatarUrl(meta.avatar_url ?? null)
    })
  })

  const handleSave = async () => {
    setSaving(true)
    setSaveMsg(null)
    const { error } = await supabase.auth.updateUser({
      data: { nombre, apellido, username }
    })
    setSaving(false)
    setSaveMsg(error ? 'Error al guardar. Intentá de nuevo.' : '✓ Cambios guardados correctamente.')
    setTimeout(() => setSaveMsg(null), 4000)
  }

  const handlePasswordReset = async () => {
    setPassSent(false)
    setPassMsg(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    if (error) {
      setPassMsg('Error al enviar el mail. Intentá de nuevo.')
    } else {
      setPassSent(true)
      setPassMsg(`✓ Te enviamos el link a ${email}. Revisá tu bandeja de entrada.`)
    }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setUploadMsg('La imagen no puede superar los 2MB.'); return }
    setUploadMsg('Subiendo...')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const ext = file.name.split('.').pop()
    const path = `avatars/${user.id}.${ext}`
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (uploadError) { setUploadMsg('Error al subir la imagen.'); return }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    await supabase.auth.updateUser({ data: { avatar_url: publicUrl } })
    setAvatarUrl(publicUrl)
    setUploadMsg('✓ Foto actualizada.')
    setTimeout(() => setUploadMsg(null), 3000)
  }

  const handleDelete = async () => {
    setDeleting(true)
    // Llamamos a una API route que elimina la cuenta con el service role
    const res = await fetch('/api/delete-account', { method: 'POST' })
    if (res.ok) {
      await supabase.auth.signOut()
      router.push('/')
    } else {
      setDeleting(false)
      alert('Error al eliminar la cuenta. Contactá soporte.')
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .inp { width: 100%; padding: 10px 13px; background: #c1c1c6 !important; color: #01050F !important; -webkit-text-fill-color: #01050F !important; border: none; border-radius: 8px; font-family: 'Ubuntu', sans-serif; font-size: 14px; font-weight: 500; margin-bottom: 12px; outline: none; }
        .inp:focus { outline: 2px solid #055074; outline-offset: 1px; }
        .inp::placeholder { color: #706c7e !important; -webkit-text-fill-color: #706c7e !important; }
        .inp:-webkit-autofill { -webkit-box-shadow: 0 0 0 1000px #c1c1c6 inset !important; -webkit-text-fill-color: #01050F !important; }
        .inp-label { font-size: 10px; font-weight: 700; color: #706c7e; letter-spacing: 0.6px; text-transform: uppercase; margin-bottom: 6px; display: block; }
        .inp-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .btn { width: 100%; padding: 12px; border-radius: 10px; font-size: 14px; font-weight: 700; font-family: 'Ubuntu', sans-serif; cursor: pointer; border: none; transition: all 0.15s; }
        .btn:active { transform: scale(0.98); }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-primary { background: #055074; color: #ffffff; }
        .btn-primary:hover:not(:disabled) { background: #04447b; }
        .btn-secondary { background: transparent; color: #c1c1c6; border: 1px solid #2a2448 !important; }
        .btn-secondary:hover { border-color: #706c7e !important; }
        .btn-danger { background: #2a0a0a; color: #f87171; border: 1px solid #f87171 !important; }
        .btn-danger:hover:not(:disabled) { background: #3a1010; }
        .section { background: #c1c1c6; border: 1px solid #2a2448; border-radius: 16px; margin-bottom: 14px; overflow: hidden; }
        .section-header { padding: 14px 18px; border-bottom: 1px solid #2a2448; }
        .section-title { font-size: 13px; font-weight: 700; color: #c1c1c6; }
        .section-body { padding: 18px; }
        .msg-success { background: #0a2a1a; border: 1px solid #4ade80; border-radius: 8px; padding: 10px 13px; margin-top: 12px; font-size: 12px; color: #4ade80; line-height: 1.5; }
        .msg-error { background: #2a0a0a; border: 1px solid #f87171; border-radius: 8px; padding: 10px 13px; margin-top: 12px; font-size: 12px; color: #f87171; line-height: 1.5; }
        .warning-box { background: #2a0a0a; border: 1px solid rgba(248,113,113,0.4); border-radius: 8px; padding: 10px 13px; margin-bottom: 14px; font-size: 12px; color: #f87171; line-height: 1.5; }
        input.inp { background: #c1c1c6 !important; color: #01050F !important; -webkit-text-fill-color: #01050F !important; border: none !important; }
        input.inp::placeholder { color: #4a4a55 !important; -webkit-text-fill-color: #4a4a55 !important; }
        input.inp:-webkit-autofill, input.inp:-webkit-autofill:hover, input.inp:-webkit-autofill:focus { -webkit-box-shadow: 0 0 0 1000px #c1c1c6 inset !important; -webkit-text-fill-color: #01050F !important; }
      `}</style>

      <div style={{ background: '#01050F', minHeight: '100vh', fontFamily: "'Ubuntu', sans-serif", paddingBottom: '40px' }}>

        {/* Navbar */}
        <nav style={{ background: '#1e1736', borderBottom: '1px solid #2a2448', padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
            <div style={{ width: '28px', height: '28px', background: '#055074', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 32 32" fill="none"><rect x="4" y="10" width="24" height="16" rx="3" stroke="#c1c1c6" strokeWidth="2.2"/><path d="M4 15h24" stroke="#c1c1c6" strokeWidth="2.2"/><circle cx="10" cy="22" r="2" fill="#c1c1c6"/><circle cx="16" cy="22" r="2" fill="#c1c1c6"/><circle cx="22" cy="22" r="2" fill="#c1c1c6"/><path d="M11 10V8a5 5 0 0 1 10 0v2" stroke="#c1c1c6" strokeWidth="2.2" strokeLinecap="round"/></svg>
            </div>
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#c1c1c6' }}>Mi cuenta</span>
          </div>
          <button onClick={() => router.push('/')} style={{ fontSize: '12px', color: '#706c7e', border: '1px solid #2a2448', borderRadius: '8px', padding: '6px 12px', background: 'transparent', cursor: 'pointer', fontFamily: "'Ubuntu', sans-serif" }}>
            ← Inicio
          </button>
        </nav>

        <div style={{ maxWidth: '480px', margin: '0 auto', padding: '20px 18px' }}>

          {/* Foto de perfil */}
          <div className="section">
            <div className="section-header"><span className="section-title">Foto de perfil</span></div>
            <div className="section-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '18px' }}>
                <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: '#055074', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: 700, color: '#ffffff', flexShrink: 0, overflow: 'hidden', position: 'relative' }}>
                  {avatarUrl
                    ? <img src={avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span>{initials}</span>
                  }
                </div>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#c1c1c6', marginBottom: '3px' }}>{username || email}</div>
                  <div style={{ fontSize: '12px', color: '#706c7e' }}>{email}</div>
                </div>
              </div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={handleAvatarUpload} />
              <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>Subir foto</button>
              {uploadMsg && <div className={uploadMsg.startsWith('✓') ? 'msg-success' : 'msg-error'} style={{ marginTop: '10px' }}>{uploadMsg}</div>}
              <div style={{ fontSize: '11px', color: '#706c7e', textAlign: 'center', marginTop: '8px' }}>JPG o PNG · máx 2MB</div>
            </div>
          </div>

          {/* Datos personales */}
          <div className="section">
            <div className="section-header"><span className="section-title">Datos personales</span></div>
            <div className="section-body">
              <div className="inp-row">
                <div>
                  <label className="inp-label">Nombre</label>
                  <input className="inp" type="text" placeholder="Erik" value={nombre} onChange={e => setNombre(e.target.value)} />
                </div>
                <div>
                  <label className="inp-label">Apellido</label>
                  <input className="inp" type="text" placeholder="Oterochio" value={apellido} onChange={e => setApellido(e.target.value)} />
                </div>
              </div>
              <label className="inp-label">Nombre de usuario</label>
              <input className="inp" type="text" placeholder="carpincho42" value={username} onChange={e => setUsername(e.target.value)} />
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
              {saveMsg && <div className={saveMsg.startsWith('✓') ? 'msg-success' : 'msg-error'}>{saveMsg}</div>}
            </div>
          </div>

          {/* Contraseña */}
          <div className="section">
            <div className="section-header"><span className="section-title">Contraseña</span></div>
            <div className="section-body">
              <p style={{ fontSize: '13px', color: '#2a2448', lineHeight: 1.6, marginBottom: '16px' }}>
                Te vamos a enviar un link a tu mail para que puedas crear una nueva contraseña de forma segura.
              </p>
              <button className="btn btn-primary" onClick={handlePasswordReset} disabled={passSent}>
                Cambiar contraseña
              </button>
              {passMsg && <div className={passSent ? 'msg-success' : 'msg-error'}>{passMsg}</div>}
            </div>
          </div>

          {/* Eliminar cuenta */}
          <div className="section" style={{ borderColor: '#2a2448' }}>
            <div className="section-header" style={{ borderColor: '#2a2448' }}>
              <span className="section-title" style={{ color: '#f87171' }}>Eliminar cuenta</span>
            </div>
            <div className="section-body">
              <div className="warning-box">
                ⚠️ Esta acción es permanente e irreversible. Se eliminarán todos tus datos, ranchadas e historial.
              </div>
              <button className="btn btn-danger" onClick={() => setShowDeleteConfirm(true)} style={{ display: showDeleteConfirm ? 'none' : 'block' }}>
                Quiero eliminar mi cuenta
              </button>

              {showDeleteConfirm && (
                <div>
                  <p style={{ fontSize: '13px', color: '#2a2448', marginBottom: '12px', lineHeight: 1.6 }}>
                    Para confirmar escribí <strong style={{ color: '#f87171' }}>soy ortiva</strong> en el campo de abajo.
                  </p>
                  <input
                    className="inp"
                    type="text"
                    placeholder="soy ortiva"
                    value={deleteInput}
                    onChange={e => setDeleteInput(e.target.value)}
                  />
                  <button
                    className="btn btn-danger"
                    disabled={deleteInput.toLowerCase() !== 'soy ortiva' || deleting}
                    onClick={handleDelete}
                  >
                    {deleting ? 'Eliminando...' : 'Confirmar eliminación definitiva'}
                  </button>
                  <button className="btn btn-secondary" style={{ marginTop: '8px' }} onClick={() => { setShowDeleteConfirm(false); setDeleteInput('') }}>
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