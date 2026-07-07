import { obtenerSesion, JWTPayload } from '@/lib/auth/jwt'
import { prisma } from '@/lib/db/prisma'
import { registrarLog } from '@/lib/logs/logger'

/**
 * Guards de autorización en servidor. LLAMAR AL INICIO DE TODA server action y
 * route handler (el middleware es solo la primera barrera, nunca la única).
 *
 * - requerirSesion(): exige sesión válida y usuario activo en BD.
 * - requerirSesion('ADMIN'): además exige rol ADMIN o superior.
 * - requerirAdmin() / requerirSuperadmin(): atajos.
 *
 * Verifica contra la BD, así desactivar un usuario invalida sus sesiones vivas
 * aunque su JWT siga vigente. El rol devuelto es el actual de la BD, no el del token.
 */

const JERARQUIA: Record<string, number> = { USER: 1, ADMIN: 2, SUPERADMIN: 3 }

export async function requerirSesion(rolMinimo?: 'USER' | 'ADMIN' | 'SUPERADMIN'): Promise<JWTPayload> {
  const sesion = await obtenerSesion()
  if (!sesion) throw new Error('No autorizado. Inicia sesión nuevamente.')

  const usuario = await prisma.usuario.findUnique({
    where: { id: sesion.sub },
    select: { activo: true, rol: true, tenantId: true },
  })

  if (!usuario || !usuario.activo) {
    await registrarLog('SECURITY', 'AUTH', `Sesión rechazada: usuario ${sesion.email} inexistente o desactivado`)
    throw new Error('No autorizado. Tu cuenta no está activa.')
  }

  if (rolMinimo) {
    const nivel = JERARQUIA[usuario.rol] ?? 0
    if (nivel < (JERARQUIA[rolMinimo] ?? 99)) {
      await registrarLog('SECURITY', 'AUTH', `Acceso denegado por rol: ${sesion.email} (${usuario.rol}) requería ${rolMinimo}`)
      throw new Error('No tienes permisos suficientes para realizar esta acción.')
    }
  }

  // Usar rol y tenant actuales de la BD (pueden haber cambiado tras emitir el token)
  return { ...sesion, rol: usuario.rol, tenantId: usuario.tenantId }
}

export async function requerirAdmin(): Promise<JWTPayload> {
  return requerirSesion('ADMIN')
}

export async function requerirSuperadmin(): Promise<JWTPayload> {
  return requerirSesion('SUPERADMIN')
}
