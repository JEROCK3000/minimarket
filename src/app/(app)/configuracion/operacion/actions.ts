'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { revalidatePath } from 'next/cache'
import { CLAVE_USAR_CAJA } from '@/lib/config/negocio'
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
