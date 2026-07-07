import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

// Sin fallback: la app NO arranca sin un JWT_SECRET fuerte (ver AGENTS.md §14.2)
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET no está configurada o es demasiado corta (mínimo 32 caracteres). Defínela en .env')
}

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET)
export const COOKIE_SESION = 'sol_session'

export interface JWTPayload {
  sub: string          // id de usuario
  tenantId: string | null
  nombre: string
  email: string
  rol: string
  iat?: number
  exp?: number
}

export async function crearToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET)
}

export async function verificarToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as unknown as JWTPayload
  } catch {
    return null
  }
}

export async function obtenerSesion(): Promise<JWTPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_SESION)?.value
  if (!token) return null
  return verificarToken(token)
}

export async function estaAutenticado(): Promise<boolean> {
  return (await obtenerSesion()) !== null
}
