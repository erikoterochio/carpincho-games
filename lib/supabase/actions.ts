'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function login(formData: FormData) {
  const supabase = await createClient()
  const identifier = (formData.get('identifier') as string).trim()
  const password = formData.get('password') as string

  let email = identifier

  // Si no tiene @, es un username → buscar el email en profiles
  if (!identifier.includes('@')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('username', identifier)
      .single()

    if (!profile?.email) {
      return { error: 'Usuario o contraseña incorrectos.' }
    }

    email = profile.email
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: 'Usuario o contraseña incorrectos.' }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function register(formData: FormData) {
  const supabase = await createClient()

  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string
  const email = (formData.get('email') as string).trim().toLowerCase()
  const username = (formData.get('username') as string).trim()

  if (password !== confirmPassword) {
    return { error: 'Las contraseñas no coinciden.' }
  }

  if (password.length < 6) {
    return { error: 'La contraseña debe tener al menos 6 caracteres.' }
  }

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return { error: 'El nombre de usuario debe tener entre 3 y 20 caracteres (letras, números o _).' }
  }

  // Verificar si el username ya está en uso
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle()

  if (existingProfile) {
    return { error: 'Ese nombre de usuario ya está en uso. Elegí otro.' }
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username, full_name: username },
    },
  })

  if (error) {
    if (error.message.toLowerCase().includes('already registered') || error.message.toLowerCase().includes('already been registered')) {
      return { error: 'Ya existe una cuenta con ese mail.' }
    }
    return { error: `No se pudo crear la cuenta: ${error.message}` }
  }

  // Supabase devuelve identities vacío cuando el mail ya existe (con confirmación habilitada)
  if (data.user && data.user.identities?.length === 0) {
    return { error: 'Ya existe una cuenta con ese mail.' }
  }

  if (data.user) {
    await supabase.from('profiles').upsert({
      id: data.user.id,
      username,
      email,
    })
  }

  return { success: 'Revisá tu mail para confirmar tu cuenta.' }
}

export async function forgotPassword(formData: FormData) {
  const supabase = await createClient()

  const { error } = await supabase.auth.resetPasswordForEmail(
    formData.get('email') as string,
    {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/reset-password`,
    }
  )

  if (error) return { error: 'No se pudo enviar el mail. Intentá de nuevo.' }

  return { success: 'Si el mail existe, te enviamos el link de recuperación.' }
}