'use client';

/**
 * SessionBridge.tsx
 * Componente invisible que sincroniza la sesión de Supabase SSR (cookies)
 * a localStorage para que los juegos en public/*.html puedan leerla.
 *
 * Incluir en app/page.tsx: <SessionBridge />
 */

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function SessionBridge() {
  useEffect(() => {
    const supabase = createClient();

    const writeSession = (session: { access_token: string; refresh_token: string; user: { id: string } } | null) => {
      if (session) {
        localStorage.setItem(
          'ranchadapp_session',
          JSON.stringify({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            user_id: session.user.id,
            supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL,
            anon_key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          })
        );
      } else {
        localStorage.removeItem('ranchadapp_session');
      }
    };

    // Sincronizar al montar
    supabase.auth.getSession().then(({ data: { session } }) => {
      writeSession(session);
    });

    // Mantener sincronizado si el usuario hace login/logout mientras está en la página
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      writeSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
}
