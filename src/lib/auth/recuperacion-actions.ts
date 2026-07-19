'use server'

import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { registrarLog } from '@/lib/logs/logger'
import { enviarCorreoRecuperacion } from '@/lib/utils/email'

// Flujo público de "olvidé mi contraseña": genera un token de un solo uso
// (solo se persiste su hash SHA-256), lo envía por correo y permite definir
// una nueva contraseña. La respuesta es siempre genérica para no revelar si
// un email existe (AGENTS.md §14.6).

const VALIDEZ_MINUTOS = 30
const LONGITUD_MINIMA = 10

// Anti abuso: máx. 3 solicitudes por email cada 15 min (misma estrategia en
// memoria que el login; para varias instancias, mover a BD o Redis).
const MAX_SOLICITUDES = 3
const VENTANA_MS = 15 * 60 * 1000
const solicitudes = new Map<string, { count: number; desde: number }>()

function excedeLimite(email: string): boolean {
  const r = solicitudes.get(email)
  const ahora = Date.now()
  if (!r || ahora - r.desde > VENTANA_MS) {
    solicitudes.set(email, { count: 1, desde: ahora })
    return false
  }
  r.count += 1
  return r.count > MAX_SOLICITUDES
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

const MENSAJE_GENERICO = 'Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña. Revisa tu bandeja de entrada y spam.'

export async function solicitarRecuperacionAction(
  _prev: { error?: string; success?: string },
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const parsed = z.string().email().max(180).safeParse(formData.get('email'))
  if (!parsed.success) return { error: 'Ingresa un correo válido' }
  const email = parsed.data.toLowerCase().trim()

  if (excedeLimite(email)) {
    await registrarLog('SECURITY', 'AUTH', `Recuperación bloqueada por exceso de solicitudes: ${email}`)
    return { success: MENSAJE_GENERICO }
  }

  try {
    const usuario = await prisma.usuario.findFirst({ where: { email, activo: true } })

    if (usuario) {
      const token = crypto.randomBytes(32).toString('base64url')

      await prisma.tokenRecuperacion.deleteMany({ where: { usuarioId: usuario.id } })
      await prisma.tokenRecuperacion.create({
        data: {
          usuarioId: usuario.id,
          tokenHash: hashToken(token),
          expiraEn: new Date(Date.now() + VALIDEZ_MINUTOS * 60 * 1000),
        },
      })

      const base = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
      if (!base) throw new Error('NEXT_PUBLIC_APP_URL no está configurada')
      const enlace = `${base}/restablecer/${token}`

      await enviarCorreoRecuperacion(usuario.tenantId, usuario.email, usuario.nombre, enlace, VALIDEZ_MINUTOS)
      await registrarLog('AUDIT', 'AUTH', `Solicitud de recuperación de contraseña para ${email}`, undefined, usuario.tenantId ?? undefined)
    } else {
      await registrarLog('WARN', 'AUTH', `Recuperación solicitada para email no registrado: ${email}`)
    }
  } catch (error: any) {
    // No revelar el fallo al visitante: el detalle queda solo en logs.
    await registrarLog('ERROR', 'AUTH', `Error en solicitud de recuperación: ${error.message || error}`)
  }

  return { success: MENSAJE_GENERICO }
}

export async function restablecerPasswordAction(
  _prev: { error?: string; success?: boolean },
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const parsed = z
    .object({
      token: z.string().min(20).max(100),
      password: z.string().min(LONGITUD_MINIMA).max(200),
      confirmacion: z.string().min(1).max(200),
    })
    .safeParse({
      token: formData.get('token'),
      password: formData.get('password'),
      confirmacion: formData.get('confirmacion'),
    })

  if (!parsed.success) {
    return { error: `La contraseña debe tener al menos ${LONGITUD_MINIMA} caracteres` }
  }
  if (parsed.data.password !== parsed.data.confirmacion) {
    return { error: 'La confirmación no coincide con la nueva contraseña' }
  }

  try {
    const registro = await prisma.tokenRecuperacion.findUnique({
      where: { tokenHash: hashToken(parsed.data.token) },
      include: { usuario: { select: { id: true, email: true, activo: true, tenantId: true } } },
    })

    if (!registro || registro.usadoEn || registro.expiraEn < new Date() || !registro.usuario.activo) {
      await registrarLog('SECURITY', 'AUTH', 'Intento de restablecimiento con token inválido, usado o expirado')
      return { error: 'El enlace no es válido o ya expiró. Solicita uno nuevo desde el login.' }
    }

    await prisma.$transaction([
      prisma.usuario.update({
        where: { id: registro.usuario.id },
        data: { password: await bcrypt.hash(parsed.data.password, 12) },
      }),
      prisma.tokenRecuperacion.update({
        where: { id: registro.id },
        data: { usadoEn: new Date() },
      }),
    ])

    await registrarLog('AUDIT', 'AUTH', `Contraseña restablecida vía correo para ${registro.usuario.email}`, undefined, registro.usuario.tenantId ?? undefined)
    return { success: true }
  } catch (error: any) {
    await registrarLog('ERROR', 'AUTH', `Error restableciendo contraseña: ${error.message || error}`)
    return { error: 'No se pudo restablecer la contraseña. Intenta nuevamente.' }
  }
}
