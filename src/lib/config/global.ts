import { prisma } from '@/lib/db/prisma'

/**
 * Configuración GLOBAL del sistema (tabla `config` con tenantId = NULL): datos
 * que no pertenecen a ningún minimarket, administrados solo por el SUPERADMIN.
 * Solo servidor (no es server action).
 *
 * Nota: el índice único (tenantId, clave) no impide duplicados con NULL en
 * MySQL, por eso se lee/escribe con findFirst en vez de upsert.
 */
export const CLAVE_RUC_PROVEEDOR = 'ruc_proveedor_software'

export async function leerConfigGlobal(clave: string): Promise<string | null> {
  const fila = await prisma.config.findFirst({ where: { tenantId: null, clave }, orderBy: { updatedAt: 'desc' }, select: { valor: true } })
  return fila?.valor ?? null
}

export async function guardarConfigGlobal(clave: string, valor: string | null) {
  const actual = await prisma.config.findFirst({ where: { tenantId: null, clave }, select: { id: true } })
  if (valor === null || valor === '') {
    await prisma.config.deleteMany({ where: { tenantId: null, clave } })
  } else if (actual) {
    await prisma.config.update({ where: { id: actual.id }, data: { valor } })
  } else {
    await prisma.config.create({ data: { tenantId: null, clave, valor } })
  }
}
