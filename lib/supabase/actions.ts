'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { sendPasswordReset, sendEmailConfirmation } from '@/lib/email'

type Result = { error?: string; success?: string }

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function login(formData: FormData): Promise<Result | never> {
  const supabase = await createClient()
  const identifier = (formData.get('identifier') as string).trim()
  const password = formData.get('password') as string

  let email = identifier

  if (!identifier.includes('@')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .ilike('username', identifier)
      .maybeSingle()

    if (!profile?.email) return { error: 'Usuario o contraseña incorrectos.' }
    email = profile.email
  }

  const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: 'Usuario o contraseña incorrectos.' }

  // Asegurar que existe el perfil (por si el usuario existía antes del trigger)
  if (authData.user) {
    const u = authData.user
    await supabase.from('profiles').upsert({
      id: u.id,
      email: u.email,
      username: u.user_metadata?.username ?? u.user_metadata?.full_name ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id', ignoreDuplicates: true })
  }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function register(formData: FormData): Promise<Result> {
  const supabase = await createClient()
  const admin = adminClient()

  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string
  const email = (formData.get('email') as string).trim().toLowerCase()
  const username = (formData.get('username') as string).trim()

  if (password !== confirmPassword) return { error: 'Las contraseñas no coinciden.' }
  if (password.length < 6) return { error: 'La contraseña debe tener al menos 6 caracteres.' }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return { error: 'El usuario debe tener entre 3 y 20 caracteres (letras, números o _).' }
  }

  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle()
  if (existingProfile) return { error: 'Ese nombre de usuario ya está en uso. Elegí otro.' }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'signup',
    email,
    password,
    options: { data: { username, full_name: username } },
  })

  if (linkError) {
    if (linkError.message.toLowerCase().includes('already registered')) {
      return { error: 'Ya existe una cuenta con ese mail.' }
    }
    return { error: `No se pudo crear la cuenta: ${linkError.message}` }
  }

  const confirmLink = linkData.properties?.action_link
  if (!confirmLink) return { error: 'No se pudo generar el link de confirmación.' }

  if (linkData.user) {
    await supabase.from('profiles').upsert({ id: linkData.user.id, username, email })
  }

  const { error: emailError } = await sendEmailConfirmation(email, confirmLink)
  if (emailError) {
    return { error: 'No se pudo enviar el mail de confirmación. Intentá de nuevo.' }
  }

  return { success: 'Revisá tu mail para confirmar tu cuenta.' }
}

export async function forgotPassword(formData: FormData): Promise<Result> {
  const admin = adminClient()
  const email = (formData.get('email') as string).trim().toLowerCase()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${siteUrl}/auth/reset-password` },
  })

  // Respuesta genérica para no revelar si el mail existe
  if (error || !data?.properties?.action_link) {
    return { success: 'Si el mail existe, te enviamos el link de recuperación.' }
  }

  await sendPasswordReset(email, data.properties.action_link)
  return { success: 'Si el mail existe, te enviamos el link de recuperación.' }
}
