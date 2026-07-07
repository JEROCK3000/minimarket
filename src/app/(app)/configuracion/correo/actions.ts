'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { cifrarSecreto, descifrarSecreto, SECRETO_MASCARA } from '@/lib/security/crypto'
import { enviarCorreoPrueba } from '@/lib/utils/email'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const schema = z.object({
  smtp_host: z.string().trim().min(1).max(200),
  smtp_port: z.string().trim().max(6),
  smtp_user: z.string().trim().min(1).max(200),
  smtp_pass: z.string().max(300),
  smtp_secure: z.boolean(),
  smtp_from_name: z.string().trim().max(120),
  smtp_from_email: z.string().trim().max(200),
})
export interface CorreoFormValues {
  smtp_host: string; smtp_port: string; smtp_user: string; smtp_pass: string
  smtp_secure: boolean; smtp_from_name: string; smtp_from_email: string
}

async function guardarConfig(tenantId: string, clave: string, valor: string) {
  const existe = await prisma.config.findFirst({ where: { tenantId, clave } })
  if (existe) await prisma.config.update({ where: { id: existe.id }, data: { valor } })
  else await prisma.config.create({ data: { tenantId, clave, valor } })
}

export async function guardarCorreoConfigAction(data: CorreoFormValues) {
  const sesion = await requerirTenant('ADMIN')
  const parsed = schema.safeParse(data)
  if (!parsed.success) return { error: 'Revisa los datos SMTP' }
  const d = parsed.data

  await guardarConfig(sesion.tenantId, 'smtp_host', d.smtp_host)
  await guardarConfig(sesion.tenantId, 'smtp_port', d.smtp_port)
  await guardarConfig(sesion.tenantId, 'smtp_user', d.smtp_user)
  await guardarConfig(sesion.tenantId, 'smtp_secure', String(d.smtp_secure))
  await guardarConfig(sesion.tenantId, 'smtp_from_name', d.smtp_from_name)
  await guardarConfig(sesion.tenantId, 'smtp_from_email', d.smtp_from_email)

  // Contraseña: solo actualizar si escribieron una nueva (el centinela conserva la existente)
  if (d.smtp_pass && d.smtp_pass !== SECRETO_MASCARA) {
    await guardarConfig(sesion.tenantId, 'smtp_pass', cifrarSecreto(d.smtp_pass))
  }

  await registrarLog('AUDIT', 'CONFIG', `Configuración SMTP actualizada por ${sesion.email}`, undefined, sesion.tenantId)
  revalidatePath('/configuracion/correo')
  return { success: true }
}

export async function probarCorreoAction(data: CorreoFormValues & { destinatario: string }) {
  const sesion = await requerirTenant('ADMIN')
  const dest = data.destinatario?.trim() || sesion.email
  try {
    // Guardar primero para que enviarCorreoPrueba lea la config vigente
    await guardarCorreoConfigAction(data)
    await enviarCorreoPrueba(sesion.tenantId, dest)
    return { success: true }
  } catch (error: any) {
    await registrarLog('ERROR', 'CONFIG', `Prueba SMTP falló: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: error.message || 'La prueba de conexión SMTP falló. Verifica tus credenciales.' }
  }
}
