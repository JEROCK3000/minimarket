'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirSesion } from '@/lib/auth/session'
import { registrarLog } from '@/lib/logs/logger'
import bcrypt from 'bcryptjs'

const LONGITUD_MINIMA = 10

export async function cambiarPasswordAction(data: {
  passwordActual: string
  passwordNueva: string
  passwordConfirmacion: string
}) {
  const sesion = await requerirSesion()

  if (!data.passwordActual || !data.passwordNueva || !data.passwordConfirmacion) {
    return { error: 'Todos los campos son requeridos' }
  }
  if (data.passwordNueva.length < LONGITUD_MINIMA) {
    return { error: `La nueva contraseña debe tener al menos ${LONGITUD_MINIMA} caracteres` }
  }
  if (data.passwordNueva !== data.passwordConfirmacion) {
    return { error: 'La confirmación no coincide con la nueva contraseña' }
  }
  if (data.passwordNueva === data.passwordActual) {
    return { error: 'La nueva contraseña debe ser diferente a la actual' }
  }

  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: sesion.sub } })
    if (!usuario) return { error: 'Usuario no encontrado' }

    const ok = await bcrypt.compare(data.passwordActual, usuario.password)
    if (!ok) {
      await registrarLog('SECURITY', 'AUTH', `Cambio de contraseña con actual incorrecta: ${sesion.email}`, undefined, sesion.tenantId)
      return { error: 'La contraseña actual es incorrecta' }
    }

    await prisma.usuario.update({ where: { id: usuario.id }, data: { password: await bcrypt.hash(data.passwordNueva, 12) } })
    await registrarLog('AUDIT', 'AUTH', `Contraseña cambiada por ${sesion.email}`, undefined, sesion.tenantId)
    return { success: true }
  } catch (error: any) {
    await registrarLog('ERROR', 'AUTH', `Error cambiando contraseña: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo cambiar la contraseña' }
  }
}
