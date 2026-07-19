import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

// Primera barrera de autenticación. NO es la única: cada server action y route
// handler debe además llamar requerirSesion() (ver AGENTS.md §14.1).
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET no está configurada o es demasiado corta (mínimo 32 caracteres). Defínela en .env')
}
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET)
const COOKIE_SESION = 'sol_session'

const RUTAS_PUBLICAS = ['/login', '/recuperar', '/restablecer', '/api/auth']
const RUTA_LOGIN = '/login'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (RUTAS_PUBLICAS.some((r) => pathname.startsWith(r))) {
    return NextResponse.next()
  }

  const token = request.cookies.get(COOKIE_SESION)?.value
  if (!token) {
    return NextResponse.redirect(new URL(RUTA_LOGIN, request.url))
  }

  try {
    await jwtVerify(token, JWT_SECRET)
    return NextResponse.next()
  } catch {
    const res = NextResponse.redirect(new URL(RUTA_LOGIN, request.url))
    res.cookies.delete(COOKIE_SESION)
    return res
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
