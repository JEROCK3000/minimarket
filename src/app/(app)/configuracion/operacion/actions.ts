'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { revalidatePath } from 'next/cache'
import { CLAVE_USAR_CAJA, CLAVE_BALANZA } from '@/lib/config/negocio'
import { CLAVE_RESUMEN, leerConfigResumen, enviarResumenTenant } from '@/lib/reportes/resumen-diario'
import { hoyLocalISO } from '@/lib/utils/fechas'
import { z } from 'zod'
import { cajaAbierta } from '@/lib/caja/estado'

/** Activa o desactiva el control de caja del negocio (solo ADMIN). */
export async function guardarControlCajaAction(usar: boolean) {
  const sesion = await requerirTenant('ADMIN')
  const activar = usar === true
  // Desactivar con una caja abierta dejaría una apertura colgada: al reactivar,
  // el siguiente arqueo arrancaría desde esa fecha vieja.
  if (!activar && (await cajaAbierta(sesion.tenantId))) {
    return { error: 'Hay una caja abierta. Ciérrala (con su arqueo) antes de desactivar el control de caja.' }
  }
  await prisma.config.upsert({
    where: { tenantId_clave: { tenantId: sesion.tenantId, clave: CLAVE_USAR_CAJA } },
    update: { valor: String(activar) },
    create: { tenantId: sesion.tenantId, clave: CLAVE_USAR_CAJA, valor: String(activar) },
  })
  await registrarLog('AUDIT', 'CONFIG', `Control de caja ${activar ? 'ACTIVADO' : 'DESACTIVADO'} por ${sesion.email}`, undefined, sesion.tenantId)
  revalidatePath('/', 'layout')
  return { success: true }
}

const balanzaSchema = z.object({
  activo: z.boolean(),
  prefijos: z.array(z.string().regex(/^2\d?$/, 'Los prefijos de balanza empiezan con 2 (ej. 20, 21)')).min(1, 'Indica al menos un prefijo').max(10),
  digitosCodigo: z.number().int().min(4).max(6),
  modo: z.enum(['PESO', 'PRECIO']),
})

/** Guarda el formato de las etiquetas de balanza (solo ADMIN). */
export async function guardarBalanzaAction(data: z.infer<typeof balanzaSchema>) {
  const sesion = await requerirTenant('ADMIN')
  const parsed = balanzaSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  const d = parsed.data
  if (d.prefijos.some((p) => 12 - p.length - d.digitosCodigo < 4)) return { error: 'Con ese prefijo y largo de código no queda espacio para el peso/precio' }
  const valor = JSON.stringify(d)
  await prisma.config.upsert({
    where: { tenantId_clave: { tenantId: sesion.tenantId, clave: CLAVE_BALANZA } },
    update: { valor }, create: { tenantId: sesion.tenantId, clave: CLAVE_BALANZA, valor },
  })
  await registrarLog('AUDIT', 'CONFIG', `Balanza ${d.activo ? 'ACTIVADA' : 'desactivada'} (${d.modo}, prefijos ${d.prefijos.join('/')}, PLU ${d.digitosCodigo} dígitos) por ${sesion.email}`, undefined, sesion.tenantId)
  revalidatePath('/pos'); revalidatePath('/configuracion/operacion')
  return { success: true }
}

const resumenSchema = z.object({
  activo: z.boolean(),
  emails: z.array(z.string().trim().toLowerCase().email('Correo inválido').max(150)).max(3, 'Máximo 3 correos'),
  hora: z.number().int().min(0).max(23),
})

/** Configura el resumen diario por correo (solo ADMIN). */
export async function guardarResumenDiarioAction(data: z.infer<typeof resumenSchema>) {
  const sesion = await requerirTenant('ADMIN')
  const parsed = resumenSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  const d = parsed.data
  if (d.activo && d.emails.length === 0) return { error: 'Indica al menos un correo' }
  const valor = JSON.stringify(d)
  await prisma.config.upsert({
    where: { tenantId_clave: { tenantId: sesion.tenantId, clave: CLAVE_RESUMEN } },
    update: { valor }, create: { tenantId: sesion.tenantId, clave: CLAVE_RESUMEN, valor },
  })
  await registrarLog('AUDIT', 'CONFIG', `Resumen diario ${d.activo ? `ACTIVADO a las ${d.hora}:00` : 'desactivado'} por ${sesion.email}`, undefined, sesion.tenantId)
  revalidatePath('/configuracion/operacion')
  return { success: true }
}

const ultimoEnvioPrueba = new Map<string, number>()
/** Envía ahora el resumen (de hoy) a los correos guardados, para probar. Máx. 1 por minuto. */
export async function enviarResumenAhoraAction() {
  const sesion = await requerirTenant('ADMIN')
  const previo = ultimoEnvioPrueba.get(sesion.tenantId) ?? 0
  if (Date.now() - previo < 60000) return { error: 'Espera un minuto antes de volver a enviarlo' }
  ultimoEnvioPrueba.set(sesion.tenantId, Date.now())
  const conf = await leerConfigResumen(sesion.tenantId)
  if (conf.emails.length === 0) return { error: 'Guarda primero al menos un correo' }
  try {
    await enviarResumenTenant(sesion.tenantId, hoyLocalISO(), conf.emails)
    await registrarLog('INFO', 'CONFIG', `Resumen diario de prueba enviado por ${sesion.email}`, undefined, sesion.tenantId)
    return { success: true, emails: conf.emails }
  } catch (error: any) {
    await registrarLog('ERROR', 'CONFIG', `Error enviando resumen de prueba: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo enviar. Revisa la configuración de correo (Configuración → Correo).' }
  }
}
