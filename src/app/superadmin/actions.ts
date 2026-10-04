'use server'

import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db/prisma'
import { requerirSuperadmin } from '@/lib/auth/session'
import { registrarLog } from '@/lib/logs/logger'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { slugUnico } from '@/lib/saas/tenants'

/**
 * Acciones del SUPERADMIN (panel Solinteec), siguiendo SmartianERP
 * (SuperAdminController): alta y gestión de minimarkets, planes, pagos de
 * suscripción. Todas empiezan con requerirSuperadmin() (rol validado contra la
 * BD) y quedan en el log AUDIT. Las contraseñas temporales se generan con
 * crypto.randomBytes, se guardan solo como hash bcrypt y se devuelven una vez.
 */
const DIA = 86400000
const temporal = () => randomBytes(9).toString('base64url')
const revalidar = (tenantId?: string) => {
  revalidatePath('/superadmin')
  if (tenantId) revalidatePath(`/superadmin/tenants/${tenantId}`)
}

const rucSchema = z.string().trim().regex(/^\d{13}$/, 'El RUC debe tener 13 dígitos')

// ─── Alta de minimarket ───────────────────────────────────────────────────────
const nuevoTenantSchema = z.object({
  nombre: z.string().trim().min(2, 'Nombre del negocio requerido').max(150),
  ruc: rucSchema.optional().or(z.literal('')),
  emailContacto: z.string().trim().toLowerCase().email('Correo de contacto inválido').max(150),
  telefono: z.string().trim().max(20).optional().or(z.literal('')),
  planId: z.string().optional().or(z.literal('')),
  cicloFacturacion: z.enum(['MENSUAL', 'ANUAL']),
  estado: z.enum(['PRUEBA', 'ACTIVO']),
  diasVigencia: z.coerce.number().int().min(0).max(3660), // 0 = sin vencimiento
  adminNombre: z.string().trim().min(2, 'Nombre del administrador requerido').max(120),
  adminEmail: z.string().trim().toLowerCase().email('Correo del administrador inválido').max(180),
})
export type NuevoTenantValues = z.infer<typeof nuevoTenantSchema>

/** Crea el minimarket + su usuario ADMIN (contraseña temporal de un solo uso). */
export async function crearTenantAction(data: NuevoTenantValues) {
  const sesion = await requerirSuperadmin()
  const parsed = nuevoTenantSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  const d = parsed.data
  try {
    if (await prisma.usuario.findFirst({ where: { email: d.adminEmail }, select: { id: true } })) {
      return { error: 'El correo del administrador ya está registrado en el sistema' }
    }
    if (d.planId && !(await prisma.planSuscripcion.findUnique({ where: { id: d.planId }, select: { id: true } }))) {
      return { error: 'Plan no válido' }
    }
    const password = temporal()
    const tenant = await prisma.$transaction(async (tx) => {
      const t = await tx.tenant.create({
        data: {
          nombre: d.nombre, slug: await slugUnico(d.nombre), ruc: d.ruc || null, emailContacto: d.emailContacto,
          telefono: d.telefono || null, planId: d.planId || null, cicloFacturacion: d.cicloFacturacion, estado: d.estado,
          fechaExpiracion: d.diasVigencia > 0 ? new Date(Date.now() + d.diasVigencia * DIA) : null,
        },
      })
      await tx.usuario.create({
        data: { tenantId: t.id, nombre: d.adminNombre, email: d.adminEmail, rol: 'ADMIN', password: await bcrypt.hash(password, 12) },
      })
      return t
    })
    await registrarLog('AUDIT', 'SUPERADMIN', `Minimarket creado: ${d.nombre} (admin ${d.adminEmail}) por ${sesion.email}`, undefined, tenant.id)
    revalidar()
    return { success: true, tenantId: tenant.id, adminEmail: d.adminEmail, passwordTemporal: password }
  } catch (error: any) {
    await registrarLog('ERROR', 'SUPERADMIN', `Error creando minimarket: ${error.message || error}`)
    return { error: 'No se pudo crear el minimarket' }
  }
}

// ─── Gestión de un minimarket ─────────────────────────────────────────────────
const datosTenantSchema = z.object({
  nombre: z.string().trim().min(2).max(150),
  ruc: rucSchema.optional().or(z.literal('')),
  emailContacto: z.string().trim().toLowerCase().email('Correo inválido').max(150).optional().or(z.literal('')),
  telefono: z.string().trim().max(20).optional().or(z.literal('')),
  notasAdmin: z.string().trim().max(2000).optional().or(z.literal('')),
})

export async function actualizarTenantAction(id: string, data: z.infer<typeof datosTenantSchema>) {
  const sesion = await requerirSuperadmin()
  const parsed = datosTenantSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  const d = parsed.data
  await prisma.tenant.update({
    where: { id },
    data: { nombre: d.nombre, ruc: d.ruc || null, emailContacto: d.emailContacto || null, telefono: d.telefono || null, notasAdmin: d.notasAdmin || null },
  })
  await registrarLog('AUDIT', 'SUPERADMIN', `Datos del minimarket actualizados: ${d.nombre} por ${sesion.email}`, undefined, id)
  revalidar(id)
  return { success: true }
}

export async function cambiarPlanAction(id: string, planId: string | null, ciclo: 'MENSUAL' | 'ANUAL') {
  const sesion = await requerirSuperadmin()
  if (!['MENSUAL', 'ANUAL'].includes(ciclo)) return { error: 'Ciclo no válido' }
  if (planId) {
    const plan = await prisma.planSuscripcion.findUnique({ where: { id: planId }, select: { activo: true } })
    if (!plan) return { error: 'Plan no válido' }
  }
  const t = await prisma.tenant.update({ where: { id }, data: { planId: planId || null, cicloFacturacion: ciclo }, select: { nombre: true } })
  await registrarLog('AUDIT', 'SUPERADMIN', `Plan de ${t.nombre} cambiado (${planId ?? 'sin plan'}, ${ciclo}) por ${sesion.email}`, undefined, id)
  revalidar(id)
  return { success: true }
}

const pagoSchema = z.object({
  monto: z.coerce.number().min(0).max(100000),
  tipo: z.enum(['TRANSFERENCIA', 'EFECTIVO', 'TARJETA', 'CORTESIA']),
  referencia: z.string().trim().max(200).optional().or(z.literal('')),
  meses: z.coerce.number().int().min(1).max(36),
  notas: z.string().trim().max(1000).optional().or(z.literal('')),
})

/**
 * Registra un pago de suscripción y extiende la vigencia `meses` desde el
 * vencimiento actual (o desde hoy si ya venció). Pasa de PRUEBA a ACTIVO.
 */
export async function registrarPagoAction(id: string, data: z.infer<typeof pagoSchema>) {
  const sesion = await requerirSuperadmin()
  const parsed = pagoSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  const d = parsed.data
  const t = await prisma.tenant.findUnique({ where: { id }, select: { nombre: true, fechaExpiracion: true, estado: true } })
  if (!t) return { error: 'Minimarket no encontrado' }
  if (t.estado === 'CANCELADO') return { error: 'El minimarket está cancelado: reactívalo antes de registrar pagos' }
  const desde = t.fechaExpiracion && t.fechaExpiracion > new Date() ? t.fechaExpiracion : new Date()
  const hasta = new Date(desde)
  hasta.setMonth(hasta.getMonth() + d.meses)
  await prisma.$transaction([
    prisma.pagoSuscripcion.create({
      data: { tenantId: id, superadminId: sesion.sub, tipo: d.tipo, monto: d.monto, referencia: d.referencia || null, periodoDesde: desde, periodoHasta: hasta, notas: d.notas || null },
    }),
    prisma.tenant.update({ where: { id }, data: { fechaExpiracion: hasta, estado: 'ACTIVO' } }),
  ])
  await registrarLog('AUDIT', 'SUPERADMIN', `Pago registrado ${t.nombre}: $${d.monto.toFixed(2)} (${d.tipo}) vigencia hasta ${hasta.toISOString().slice(0, 10)} por ${sesion.email}`, undefined, id)
  revalidar(id)
  return { success: true, hasta: hasta.toISOString() }
}

/** Fija el vencimiento a una fecha (o lo quita con null = sin vencimiento). */
export async function fijarVencimientoAction(id: string, fecha: string | null) {
  const sesion = await requerirSuperadmin()
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: 'Fecha inválida' }
  const venc = fecha ? new Date(`${fecha}T23:59:59`) : null
  const t = await prisma.tenant.update({ where: { id }, data: { fechaExpiracion: venc }, select: { nombre: true } })
  await registrarLog('AUDIT', 'SUPERADMIN', `Vencimiento de ${t.nombre}: ${fecha ?? 'sin vencimiento'} por ${sesion.email}`, undefined, id)
  revalidar(id)
  return { success: true }
}

/** Suspensión manual (consulta sí; operar no) o su levantamiento. */
export async function suspenderTenantAction(id: string, suspender: boolean) {
  const sesion = await requerirSuperadmin()
  const t = await prisma.tenant.update({ where: { id }, data: { suspendidoManual: !!suspender }, select: { nombre: true } })
  await registrarLog('AUDIT', 'SUPERADMIN', `Minimarket ${suspender ? 'SUSPENDIDO' : 'reactivado (suspensión manual levantada)'}: ${t.nombre} por ${sesion.email}`, undefined, id)
  revalidar(id)
  return { success: true }
}

/** Cancelar: el minimarket deja de tener acceso (ni login). Reversible. */
export async function cancelarTenantAction(id: string, cancelar: boolean) {
  const sesion = await requerirSuperadmin()
  const t = await prisma.tenant.update({ where: { id }, data: { estado: cancelar ? 'CANCELADO' : 'ACTIVO' }, select: { nombre: true } })
  await registrarLog('AUDIT', 'SUPERADMIN', `Minimarket ${cancelar ? 'CANCELADO' : 'reactivado'}: ${t.nombre} por ${sesion.email}`, undefined, id)
  revalidar(id)
  return { success: true }
}

/** Contraseña temporal para un usuario de un minimarket (p. ej. su admin olvidó la suya). */
export async function restablecerPasswordUsuarioAction(tenantId: string, usuarioId: string) {
  const sesion = await requerirSuperadmin()
  const u = await prisma.usuario.findFirst({ where: { id: usuarioId, tenantId, rol: { not: 'SUPERADMIN' } }, select: { email: true } })
  if (!u) return { error: 'Usuario no encontrado' }
  const password = temporal()
  await prisma.usuario.update({ where: { id: usuarioId }, data: { password: await bcrypt.hash(password, 12), activo: true } })
  await registrarLog('SECURITY', 'SUPERADMIN', `Contraseña restablecida para ${u.email} por ${sesion.email}`, undefined, tenantId)
  return { success: true, email: u.email, passwordTemporal: password }
}

// ─── Planes ───────────────────────────────────────────────────────────────────
const entero = z.union([z.coerce.number().int().min(1).max(10000000), z.literal(''), z.null()]).transform((v) => (v === '' || v === null ? null : Number(v)))
const planSchema = z.object({
  codigo: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,50}$/, 'Código: minúsculas, números y guiones'),
  nombre: z.string().trim().min(2).max(100),
  descripcion: z.string().trim().max(1000).optional().or(z.literal('')),
  precioMensual: z.coerce.number().min(0).max(100000),
  precioAnual: z.coerce.number().min(0).max(1000000),
  maxUsuarios: entero, maxProductos: entero, maxFacturasMes: entero,
  diasPrueba: z.coerce.number().int().min(0).max(365),
  orden: z.coerce.number().int().min(0).max(1000),
  activo: z.boolean(),
})
export type PlanValues = z.input<typeof planSchema>

export async function guardarPlanAction(id: string | null, data: PlanValues) {
  const sesion = await requerirSuperadmin()
  const parsed = planSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  const { codigo, ...resto } = parsed.data
  const campos = { ...resto, descripcion: resto.descripcion || null }
  try {
    if (id) await prisma.planSuscripcion.update({ where: { id }, data: campos }) // el código es inmutable
    else await prisma.planSuscripcion.create({ data: { codigo, ...campos } })
  } catch (error: any) {
    if (error.code === 'P2002') return { error: 'Ya existe un plan con ese código' }
    return { error: 'No se pudo guardar el plan' }
  }
  await registrarLog('AUDIT', 'SUPERADMIN', `Plan ${id ? 'actualizado' : 'creado'}: ${resto.nombre} por ${sesion.email}`)
  revalidatePath('/superadmin/planes')
  return { success: true }
}

/** Elimina un plan solo si ningún minimarket ni solicitud lo usa (si no, desactívalo). */
export async function eliminarPlanAction(id: string) {
  const sesion = await requerirSuperadmin()
  const uso = await prisma.planSuscripcion.findUnique({ where: { id }, select: { nombre: true, _count: { select: { tenants: true, solicitudes: true } } } })
  if (!uso) return { error: 'Plan no encontrado' }
  if (uso._count.tenants + uso._count.solicitudes > 0) return { error: 'El plan está en uso: desactívalo en lugar de eliminarlo' }
  await prisma.planSuscripcion.delete({ where: { id } })
  await registrarLog('AUDIT', 'SUPERADMIN', `Plan eliminado: ${uso.nombre} por ${sesion.email}`)
  revalidatePath('/superadmin/planes')
  return { success: true }
}

// ─── Cuenta del superadmin ────────────────────────────────────────────────────
export async function cambiarPasswordSuperadminAction(actual: string, nueva: string) {
  const sesion = await requerirSuperadmin()
  if (!nueva || nueva.length < 12) return { error: 'La nueva contraseña debe tener al menos 12 caracteres' }
  const u = await prisma.usuario.findUnique({ where: { id: sesion.sub }, select: { password: true } })
  if (!u || !(await bcrypt.compare(actual || '', u.password))) {
    await registrarLog('SECURITY', 'SUPERADMIN', `Cambio de contraseña con actual incorrecta: ${sesion.email}`)
    return { error: 'La contraseña actual es incorrecta' }
  }
  await prisma.usuario.update({ where: { id: sesion.sub }, data: { password: await bcrypt.hash(nueva, 12) } })
  await registrarLog('AUDIT', 'SUPERADMIN', `Contraseña del superadmin cambiada: ${sesion.email}`)
  return { success: true }
}

