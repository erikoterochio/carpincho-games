import { NextResponse, type NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  // Buscar cookie de sesión de Supabase
  const hasSession = request.cookies.getAll().some(
    (cookie) => cookie.name.includes('auth-token')
  )

  if (!hasSession && request.nextUrl.pathname.startsWith('/dashboard')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return NextResponse.next({ request })
}

export const config = {
  matcher: ['/dashboard/:path*'],
}