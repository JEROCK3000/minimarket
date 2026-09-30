'use server'

import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

/**
 * Gestión de usuarios del minimarket (solo ADMIN, siempre dentro de su tenant).
 * Las contraseñas temporales se generan con crypto.randomBytes, se guardan solo
 * como hash bcrypt (costo 12) y se devuelven UNA vez para entregarlas al usuario,
 * que debe cambiarla en Configuración → Seguridad. Nunca se registran en logs.
 */

const generarTemporal = () => randomBytes(9).toString('base64url') // 12 caracteres

const usuarioSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre es requerido').max(120),
  email: z.string().trim().toLowerCase().email('Correo inválido').max(180),
  rol: z.enum(['USER', 'ADMIN']),
})
export type UsuarioFormValues = z.infer<typeof usuarioSchema>

async function usuarioDelTenant(id: string, tenantId: string) {
  return prisma.usuario.findFirst({
    where: { id, tenantId, rol: { not: 'SUPERADMIN' } },
    select: { id: true, nombre: true, email: true, rol: true, activo: true },
  })
}

/** ¿Quedaría al menos un ADMIN activo si se quita/desactiva a `excluirId`? */
async function quedaOtroAdmin(tenantId: string, excluirId: string) {
  const n = await prisma.usuario.count({ where: { tenantId, rol: 'ADMIN', activo: true, id: { not: excluirId } } })
  return n > 0
}

export async function crearUsuarioAction(data: UsuarioFormValues) {
  const sesion = await requerirTenant('ADMIN')
  const parsed = usuarioSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  const d = parsed.data
  try {
    // El login busca por correo en todo el sistema: debe ser único globalmente.
    const existe = await prisma.usuario.findFirst({ where: { email: d.email }, select: { id: true } })
    if (existe) return { error: 'Ese correo ya está registrado. Usa otro.' }
    const temporal = generarTemporal()
    await prisma.usuario.create({
      data: { tenantId: sesion.tenantId, nombre: d.nombre, email: d.email, rol: d.rol, password: await bcrypt.hash(temporal, 12) },
    })
    await registrarLog('AUDIT', 'USUARIOS', `Usuario creado: ${d.email} (${d.rol}) por ${sesion.email}`, undefined, sesion.tenantId)
    revalidatePath('/usuarios')
    return { success: true, passwordTemporal: temporal }
  } catch (error: any) {
    await registrarLog('ERROR', 'USUARIOS', `Error creando usuario: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo crear el usuario' }
  }
}

const edicionSchema = usuarioSchema.pick({ nombre: true, rol: true })

export async function actualizarUsuarioAction(id: string, data: { nombre: string; rol: 'USER' | 'ADMIN' }) {
  const sesion = await requerirTenant('ADMIN')
  const parsed = edicionSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  const u = await usuarioDelTenant(id, sesion.tenantId)
  if (!u) return { error: 'Usuario no encontrado' }
  if (u.rol !== parsed.data.rol) {
    if (id === sesion.sub) return { error: 'No puedes cambiar tu propio rol' }
    if (u.rol === 'ADMIN' && !(await quedaOtroAdmin(sesion.tenantId, id))) return { error: 'Debe quedar al menos un administrador activo' }
  }
  try {
    await prisma.usuario.update({ where: { id }, data: { nombre: parsed.data.nombre, rol: parsed.data.rol } })
    await registrarLog('AUDIT', 'USUARIOS', `Usuario actualizado: ${u.email} (${u.rol} → ${parsed.data.rol}) por ${sesion.email}`, undefined, sesion.tenantId)
    revalidatePath('/usuarios')
    return { success: true }
  } catch (error: any) {
    await registrarLog('ERROR', 'USUARIOS', `Error actualizando usuario: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo actualizar el usuario' }
  }
}

/** Activa/desactiva. Un usuario desactivado no puede entrar (se valida en cada petición). */
export async function cambiarEstadoUsuarioAction(id: string, activo: boolean) {
  const sesion = await requerirTenant('ADMIN')
  if (id === sesion.sub) return { error: 'No puedes desactivar tu propia cuenta' }
  const u = await usuarioDelTenant(id, sesion.tenantId)
  if (!u) return { error: 'Usuario no encontrado' }
  if (!activo && u.rol === 'ADMIN' && !(await quedaOtroAdmin(sesion.tenantId, id))) {
    return { error: 'Debe quedar al menos un administrador activo' }
  }
  await prisma.usuario.update({ where: { id }, data: { activo: Boolean(activo) } })
  await registrarLog('AUDIT', 'USUARIOS', `Usuario ${activo ? 'activado' : 'desactivado'}: ${u.email} por ${sesion.email}`, undefined, sesion.tenantId)
  revalidatePath('/usuarios')
  return { success: true }
}

/** Genera una contraseña temporal nueva para otro usuario (la propia se cambia en Seguridad). */
export async function restablecerPasswordAction(id: string) {
  const sesion = await requerirTenant('ADMIN')
  if (id === sesion.sub) return { error: 'Tu propia contraseña se cambia en Configuración → Seguridad' }
  const u = await usuarioDelTenant(id, sesion.tenantId)
  if (!u) return { error: 'Usuario no encontrado' }
  const temporal = generarTemporal()
  await prisma.usuario.update({ where: { id }, data: { password: await bcrypt.hash(temporal, 12) } })
  await registrarLog('SECURITY', 'USUARIOS', `Contraseña restablecida para ${u.email} por ${sesion.email}`, undefined, sesion.tenantId)
  return { success: true, passwordTemporal: temporal }
}
