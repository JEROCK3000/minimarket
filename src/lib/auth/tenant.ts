import { requerirSesion } from '@/lib/auth/session'
import type { JWTPayload } from '@/lib/auth/jwt'
import { prisma } from '@/lib/db/prisma'

/**
 * Devuelve la sesión garantizando un tenantId no nulo.
 * Úsalo en módulos de negocio: todo recurso pertenece a un minimarket (tenant).
 * El SUPERADMIN global (tenantId null) no opera datos de negocio directamente.
 */
export async function requerirTenant(
  rolMinimo?: 'USER' | 'ADMIN'
): Promise<JWTPayload & { tenantId: string }> {
  const sesion = await requerirSesion(rolMinimo)
  if (!sesion.tenantId) {
    throw new Error('Esta operación requiere un minimarket asignado. El superadministrador no opera datos de negocio directamente.')
  }
  // Un minimarket cancelado o desactivado por el superadmin no opera (ni consulta).
  const tenant = await prisma.tenant.findUnique({ where: { id: sesion.tenantId }, select: { estado: true, activo: true } })
  if (!tenant || !tenant.activo || tenant.estado === 'CANCELADO') {
    throw new Error('La cuenta de este negocio no está activa. Contacta a Solinteec.')
  }
  return sesion as JWTPayload & { tenantId: string }
}
