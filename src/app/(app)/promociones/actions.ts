'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { bloqueoPorSuscripcion } from '@/lib/saas/suscripcion'

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
const schema = z.object({
  nombre: z.string().trim().min(3, 'Ponle un nombre (ej. "Coca Cola 2x1")').max(80),
  tipo: z.enum(['NXM', 'PORCENTAJE']),
  productoId: z.string().max(40).optional().or(z.literal('')),
  categoriaId: z.string().max(40).optional().or(z.literal('')),
  lleva: z.coerce.number().int().min(2).max(20).optional(),
  paga: z.coerce.number().int().min(1).max(19).optional(),
  porcentaje: z.coerce.number().min(1, 'Mínimo 1%').max(90, 'Máximo 90%').optional(),
  desde: fecha,
  hasta: fecha,
  dias: z.array(z.number().int().min(0).max(6)).max(7).default([]),
})
export type PromocionValues = z.infer<typeof schema>

/** Crea o edita una promoción (solo ADMIN). */
export async function guardarPromocionAction(id: string | null, data: PromocionValues) {
  const sesion = await requerirTenant('ADMIN')
  const bloqueo = await bloqueoPorSuscripcion(sesion.tenantId)
  if (bloqueo) return { error: bloqueo }
  const parsed = schema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  const d = parsed.data
  if (d.desde > d.hasta) return { error: 'La fecha "hasta" debe ser igual o posterior a "desde"' }
  if (d.tipo === 'NXM') {
    if (!d.productoId) return { error: 'El 2x1 / 3x2 es para un producto: elígelo' }
    if (!d.lleva || !d.paga || d.paga >= d.lleva) return { error: 'En "lleva N paga M", M debe ser menor que N (ej. lleva 2 paga 1)' }
  } else if (!d.porcentaje) return { error: 'Indica el porcentaje de descuento' }
  if (d.productoId && !(await prisma.producto.findFirst({ where: { id: d.productoId, tenantId: sesion.tenantId }, select: { id: true } }))) return { error: 'Producto no válido' }
  if (d.categoriaId && !(await prisma.categoria.findFirst({ where: { id: d.categoriaId, tenantId: sesion.tenantId }, select: { id: true } }))) return { error: 'Categoría no válida' }
  const datos = {
    nombre: d.nombre, tipo: d.tipo,
    productoId: d.productoId || null,
    categoriaId: d.tipo === 'PORCENTAJE' && !d.productoId ? d.categoriaId || null : null,
    lleva: d.tipo === 'NXM' ? d.lleva! : null, paga: d.tipo === 'NXM' ? d.paga! : null,
    porcentaje: d.tipo === 'PORCENTAJE' ? d.porcentaje! : null,
    desde: new Date(`${d.desde}T00:00:00Z`), hasta: new Date(`${d.hasta}T00:00:00Z`),
    dias: d.dias.length > 0 && d.dias.length < 7 ? [...new Set(d.dias)].sort().join(',') : null,
  }
  try {
    if (id) {
      const r = await prisma.promocion.updateMany({ where: { id: String(id), tenantId: sesion.tenantId }, data: datos })
      if (r.count === 0) return { error: 'Promoción no encontrada' }
    } else {
      await prisma.promocion.create({ data: { tenantId: sesion.tenantId, ...datos } })
    }
    await registrarLog('AUDIT', 'PROMOCIONES', `Promoción ${id ? 'editada' : 'creada'}: ${d.nombre} (${d.desde} a ${d.hasta}) por ${sesion.email}`, undefined, sesion.tenantId)
    revalidatePath('/promociones'); revalidatePath('/pos')
    return { success: true }
  } catch (error: any) {
    await registrarLog('ERROR', 'PROMOCIONES', `Error guardando promoción: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo guardar la promoción' }
  }
}

export async function cambiarEstadoPromocionAction(id: string, activa: boolean) {
  const sesion = await requerirTenant('ADMIN')
  const r = await prisma.promocion.updateMany({ where: { id: String(id), tenantId: sesion.tenantId }, data: { activa: activa === true } })
  if (r.count === 0) return { error: 'Promoción no encontrada' }
  await registrarLog('AUDIT', 'PROMOCIONES', `Promoción ${activa ? 'activada' : 'pausada'} (${id}) por ${sesion.email}`, undefined, sesion.tenantId)
  revalidatePath('/promociones'); revalidatePath('/pos')
  return { success: true }
}

/** Elimina la promoción (las ventas pasadas conservan su nombre y descuento). */
export async function eliminarPromocionAction(id: string) {
  const sesion = await requerirTenant('ADMIN')
  const r = await prisma.promocion.deleteMany({ where: { id: String(id), tenantId: sesion.tenantId } })
  if (r.count === 0) return { error: 'Promoción no encontrada' }
  await registrarLog('AUDIT', 'PROMOCIONES', `Promoción eliminada (${id}) por ${sesion.email}`, undefined, sesion.tenantId)
  revalidatePath('/promociones'); revalidatePath('/pos')
  return { success: true }
}
