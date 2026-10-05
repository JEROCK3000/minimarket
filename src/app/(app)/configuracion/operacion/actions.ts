'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { revalidatePath } from 'next/cache'
import { CLAVE_USAR_CAJA, CLAVE_BALANZA } from '@/lib/config/negocio'
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
