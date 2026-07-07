'use server'

import { prisma } from '@/lib/db/prisma'
import { crearToken, COOKIE_SESION } from '@/lib/auth/jwt'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import bcrypt from 'bcryptjs'
import { registrarLog } from '@/lib/logs/logger'
import { z } from 'zod'

// ─── Anti fuerza bruta (5 intentos → bloqueo 15 min por email) ───────────────
// En memoria: suficiente para una sola instancia. Para varias instancias, mover
// a una tabla o a Redis compartido.
const MAX_INTENTOS = 5
const VENTANA_MS = 15 * 60 * 1000
const intentos = new Map<string, { count: number; hasta: number }>()

function minutosBloqueo(email: string): number {
  const r = intentos.get(email)
  return r && r.hasta > Date.now() ? Math.ceil((r.hasta - Date.now()) / 60000) : 0
}
function registrarFallo(email: string) {
  const r = intentos.get(email) ?? { count: 0, hasta: 0 }
  r.count += 1
  if (r.count >= MAX_INTENTOS) {
    r.hasta = Date.now() + VENTANA_MS
    r.count = 0
  }
  intentos.set(email, r)
}

const loginSchema = z.object({
  email: z.string().email().max(180),
  password: z.string().min(1).max(200),
})

export async function loginAction(_prev: { error: string }, formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: 'Email y contraseña son requeridos' }
  }

  const email = parsed.data.email.toLowerCase().trim()
  const password = parsed.data.password

  const min = minutosBloqueo(email)
  if (min > 0) {
    await registrarLog('SECURITY', 'AUTH', `Login bloqueado por exceso de intentos: ${email}`)
    return { error: `Demasiados intentos fallidos. Intenta nuevamente en ${min} minuto(s).` }
  }

  try {
    // Nota: si tu login es por tenant, filtra también por tenantId aquí.
    const usuario = await prisma.usuario.findFirst({ where: { email } })

    if (!usuario || !usuario.activo) {
      registrarFallo(email)
      await registrarLog('WARN', 'AUTH', `Intento de login fallido: ${email}`)
      return { error: 'Credenciales incorrectas' }
    }

    const ok = await bcrypt.compare(password, usuario.password)
    if (!ok) {
      registrarFallo(email)
      await registrarLog('SECURITY', 'AUTH', `Password incorrecto para: ${email}`)
      return { error: 'Credenciales incorrectas' }
    }

    intentos.delete(email)

    const token = await crearToken({
      sub: usuario.id,
      tenantId: usuario.tenantId,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
    })

    const cookieStore = await cookies()
    cookieStore.set(COOKIE_SESION, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    })

    await registrarLog('AUDIT', 'AUTH', `Login exitoso: ${email}`, undefined, usuario.tenantId)
  } catch (error) {
    await registrarLog('ERROR', 'AUTH', `Error en login: ${error}`)
    return { error: 'Error interno del servidor' }
  }

  redirect('/dashboard')
}

export async function logoutAction() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_SESION)
  redirect('/login')
}
