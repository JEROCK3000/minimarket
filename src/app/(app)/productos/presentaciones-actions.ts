'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { bloqueoPorSuscripcion } from '@/lib/saas/suscripcion'

/** Presentaciones (six-pack, caja…) y precios por mayor de un producto. Solo ADMIN. */
async function productoDelTenant(tenantId: string, productoId: string) {
  return prisma.producto.findFirst({ where: { id: String(productoId), tenantId }, select: { id: true, nombre: true, precioVenta: true } })
}
const revalidar = () => { revalidatePath('/productos'); revalidatePath('/pos') }

export async function obtenerPresentacionesAction(productoId: string) {
  const sesion = await requerirTenant('ADMIN')
  const prod = await productoDelTenant(sesion.tenantId, productoId)
  if (!prod) return { error: 'Producto no encontrado' }
  const [presentaciones, escalas] = await Promise.all([
    prisma.productoPresentacion.findMany({ where: { productoId: prod.id, activo: true }, orderBy: { factor: 'asc' } }),
    prisma.productoPrecioEscala.findMany({ where: { productoId: prod.id }, orderBy: { desde: 'asc' } }),
  ])
  return {
    success: true as const,
    presentaciones: presentaciones.map((p) => ({ id: p.id, nombre: p.nombre, factor: Number(p.factor), codigoBarras: p.codigoBarras ?? '', precioVenta: Number(p.precioVenta) })),
    escalas: escalas.map((e) => ({ desde: Number(e.desde), precioVenta: Number(e.precioVenta) })),
  }
}

const presentacionSchema = z.object({
  id: z.string().max(40).optional().or(z.literal('')),
  nombre: z.string().trim().min(2, 'Nombre de la presentación requerido').max(60),
  factor: z.coerce.number().min(1.001, 'Debe contener más de 1 unidad').max(100000),
  codigoBarras: z.string().trim().max(50).optional().or(z.literal('')),
  precioVenta: z.coerce.number().positive('Precio inválido').max(999999),
})

export async function guardarPresentacionAction(productoId: string, data: z.infer<typeof presentacionSchema>) {
  const sesion = await requerirTenant('ADMIN')
  const bloqueo = await bloqueoPorSuscripcion(sesion.tenantId)
  if (bloqueo) return { error: bloqueo }
  const parsed = presentacionSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  const d = parsed.data
  try {
    const prod = await productoDelTenant(sesion.tenantId, productoId)
    if (!prod) return { error: 'Producto no encontrado' }
    // El código de barras no puede repetirse con un producto ni con otra presentación
    if (d.codigoBarras) {
      const [enProducto, enPres] = await Promise.all([
        prisma.producto.findFirst({ where: { tenantId: sesion.tenantId, codigoBarras: d.codigoBarras }, select: { nombre: true } }),
        prisma.productoPresentacion.findFirst({ where: { tenantId: sesion.tenantId, codigoBarras: d.codigoBarras, activo: true, NOT: d.id ? { id: d.id } : undefined }, select: { nombre: true } }),
      ])
      if (enProducto) return { error: `Ese código de barras ya es del producto "${enProducto.nombre}"` }
      if (enPres) return { error: `Ese código de barras ya es de la presentación "${enPres.nombre}"` }
    }
    const datos = { nombre: d.nombre, factor: d.factor, codigoBarras: d.codigoBarras || null, precioVenta: Math.round(d.precioVenta * 10000) / 10000 }
    if (d.id) {
      const r = await prisma.productoPresentacion.updateMany({ where: { id: d.id, productoId: prod.id, tenantId: sesion.tenantId }, data: datos })
      if (r.count === 0) return { error: 'Presentación no encontrada' }
    } else {
      // Una presentación borrada antes con el mismo código lo libera
      if (d.codigoBarras) await prisma.productoPresentacion.updateMany({ where: { tenantId: sesion.tenantId, codigoBarras: d.codigoBarras, activo: false }, data: { codigoBarras: null } })
      await prisma.productoPresentacion.create({ data: { tenantId: sesion.tenantId, productoId: prod.id, ...datos } })
    }
    await registrarLog('AUDIT', 'PRODUCTOS', `Presentación ${d.id ? 'editada' : 'creada'}: ${prod.nombre} — ${d.nombre} x${d.factor} a $${datos.precioVenta} (sin IVA) por ${sesion.email}`, undefined, sesion.tenantId)
    revalidar()
    return { success: true }
  } catch (error: any) {
    if (error?.code === 'P2002') return { error: 'Ese código de barras ya está en uso' }
    await registrarLog('ERROR', 'PRODUCTOS', `Error guardando presentación: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo guardar la presentación' }
  }
}

/** Se desactiva (no se borra): las ventas pasadas conservan su nombre y factor. */
export async function eliminarPresentacionAction(id: string) {
  const sesion = await requerirTenant('ADMIN')
  const r = await prisma.productoPresentacion.updateMany({ where: { id: String(id), tenantId: sesion.tenantId }, data: { activo: false, codigoBarras: null } })
  if (r.count === 0) return { error: 'Presentación no encontrada' }
  await registrarLog('AUDIT', 'PRODUCTOS', `Presentación eliminada (${id}) por ${sesion.email}`, undefined, sesion.tenantId)
  revalidar()
  return { success: true }
}

const escalasSchema = z.array(z.object({
  desde: z.coerce.number().min(1.001, 'La escala empieza desde más de 1 unidad').max(100000),
  precioVenta: z.coerce.number().positive('Precio inválido').max(999999),
})).max(5, 'Máximo 5 escalas')

/** Reemplaza las escalas de precio por mayor del producto. */
export async function guardarEscalasAction(productoId: string, data: z.infer<typeof escalasSchema>) {
  const sesion = await requerirTenant('ADMIN')
  const bloqueo = await bloqueoPorSuscripcion(sesion.tenantId)
  if (bloqueo) return { error: bloqueo }
  const parsed = escalasSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  const escalas = parsed.data
  if (new Set(escalas.map((e) => e.desde)).size !== escalas.length) return { error: 'Hay dos escalas con la misma cantidad' }
  const prod = await productoDelTenant(sesion.tenantId, productoId)
  if (!prod) return { error: 'Producto no encontrado' }
  try {
    await prisma.$transaction([
      prisma.productoPrecioEscala.deleteMany({ where: { productoId: prod.id } }),
      prisma.productoPrecioEscala.createMany({ data: escalas.map((e) => ({ productoId: prod.id, desde: e.desde, precioVenta: Math.round(e.precioVenta * 10000) / 10000 })) }),
    ])
    await registrarLog('AUDIT', 'PRODUCTOS', `Precios por mayor de ${prod.nombre}: ${escalas.map((e) => `desde ${e.desde} → $${e.precioVenta}`).join(', ') || 'ninguno'} por ${sesion.email}`, undefined, sesion.tenantId)
    revalidar()
    return { success: true }
  } catch (error: any) {
    await registrarLog('ERROR', 'PRODUCTOS', `Error guardando escalas: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudieron guardar los precios por mayor' }
  }
}
