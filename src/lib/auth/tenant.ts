import { requerirSesion } from '@/lib/auth/session'
import type { JWTPayload } from '@/lib/auth/jwt'

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
  return sesion as JWTPayload & { tenantId: string }
}
