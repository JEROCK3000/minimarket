import { prisma } from '@/lib/db/prisma'
import { normalizarConfigBalanza, type ConfigBalanza } from '@/lib/pos/balanza'

/**
 * Preferencias de operación del negocio (tabla `config`, por tenant). Solo
 * servidor: recibe tenantId, no es server action.
 */
export const CLAVE_USAR_CAJA = 'usar_control_caja'

/**
 * ¿El negocio usa control de caja (apertura con fondo + cierre con arqueo)?
 * Por defecto SÍ: si no hay valor guardado, se exige caja abierta para vender.
 */
export async function usaControlCaja(tenantId: string): Promise<boolean> {
  const conf = await prisma.config.findFirst({ where: { tenantId, clave: CLAVE_USAR_CAJA }, select: { valor: true } })
  return conf?.valor !== 'false'
}

export const CLAVE_BALANZA = 'balanza'

/** Configuración de etiquetas de balanza del negocio (JSON en `config`). */
export async function leerConfigBalanza(tenantId: string): Promise<ConfigBalanza> {
  const conf = await prisma.config.findFirst({ where: { tenantId, clave: CLAVE_BALANZA }, select: { valor: true } })
  try { return normalizarConfigBalanza(conf ? JSON.parse(conf.valor) : null) } catch { return normalizarConfigBalanza(null) }
}
