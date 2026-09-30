'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { revalidatePath } from 'next/cache'
import { CLAVE_IMPRESORA_IP, ipValida } from '@/lib/print/impresora-config'

/** Guarda (o borra, con texto vacío) la IP de la impresora térmica del minimarket. */
export async function guardarImpresoraAction(ip: string) {
  const sesion = await requerirTenant('ADMIN')
  const limpia = String(ip ?? '').trim()
  if (limpia && !ipValida(limpia)) return { error: 'IP no válida (ejemplo: 192.168.1.50)' }
  try {
    if (!limpia) {
      await prisma.config.deleteMany({ where: { tenantId: sesion.tenantId, clave: CLAVE_IMPRESORA_IP } })
    } else {
      await prisma.config.upsert({
        where: { tenantId_clave: { tenantId: sesion.tenantId, clave: CLAVE_IMPRESORA_IP } },
        update: { valor: limpia },
        create: { tenantId: sesion.tenantId, clave: CLAVE_IMPRESORA_IP, valor: limpia },
      })
    }
    await registrarLog('AUDIT', 'CONFIG', `Impresora térmica ${limpia ? `configurada en ${limpia}` : 'eliminada'}`, undefined, sesion.tenantId)
    revalidatePath('/configuracion/impresora')
    return { success: true }
  } catch (error: any) {
    await registrarLog('ERROR', 'CONFIG', `Error guardando impresora: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo guardar la configuración' }
  }
}
