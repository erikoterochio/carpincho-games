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
  const email = formData.get('email') as string
  const username = formData.get('username') as string

  if (password !== confirmPassword) {
    return { error: 'Las contraseñas no coinciden.' }
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
        full_name: username, // ← esto puebla el "Display name" en el dashboard
      },
    },
  })

  if (error) return { error: 'No se pudo crear la cuenta. Intentá de nuevo.' }

  // Guardar email + username en profiles para poder hacer login por username
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