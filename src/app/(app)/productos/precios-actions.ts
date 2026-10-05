'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { bloqueoPorSuscripcion } from '@/lib/saas/suscripcion'

const schema = z.object({
  regla: z.string().trim().min(3).max(200), // descripción de la regla aplicada (para el historial)
  cambios: z.array(z.object({
    productoId: z.string().min(1).max(40),
    precioVenta: z.coerce.number().positive('Precio inválido').max(999999),
  })).min(1, 'No hay cambios que aplicar').max(3000, 'Máximo 3000 productos por vez'),
})

/** Aplica nuevos precios de venta (sin IVA) a varios productos del minimarket (solo ADMIN), con historial. */
export async function actualizarPreciosMasivoAction(data: z.infer<typeof schema>) {
  const sesion = await requerirTenant('ADMIN')
  const bloqueo = await bloqueoPorSuscripcion(sesion.tenantId)
  if (bloqueo) return { error: bloqueo }
  const parsed = schema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  const { cambios, regla } = parsed.data
  try {
    const actuales = await prisma.producto.findMany({
      where: { tenantId: sesion.tenantId, id: { in: cambios.map((c) => c.productoId) } },
      select: { id: true, precioVenta: true },
    })
    const previo = new Map(actuales.map((p) => [p.id, Number(p.precioVenta)]))
    if (previo.size !== new Set(cambios.map((c) => c.productoId)).size) return { error: 'Uno o más productos no son válidos' }
    const efectivos = cambios
      .map((c) => ({ ...c, precioVenta: Math.round(c.precioVenta * 10000) / 10000 }))
      .filter((c) => Math.abs((previo.get(c.productoId) ?? 0) - c.precioVenta) > 0.00005)
    if (efectivos.length === 0) return { error: 'Los precios nuevos son iguales a los actuales' }
    await prisma.$transaction(async (tx) => {
      for (const c of efectivos) {
        await tx.producto.update({ where: { id: c.productoId }, data: { precioVenta: c.precioVenta } })
      }
      await tx.historialPrecio.createMany({
        data: efectivos.map((c) => ({
          tenantId: sesion.tenantId, productoId: c.productoId, precioAnterior: previo.get(c.productoId)!, precioNuevo: c.precioVenta,
          origen: 'MASIVO', detalle: regla, usuarioNombre: sesion.nombre,
        })),
      })
    }, { timeout: 60000 })
    await registrarLog('AUDIT', 'PRODUCTOS', `Cambio masivo de precios: ${efectivos.length} producto(s) — ${regla} — por ${sesion.email}`, undefined, sesion.tenantId)
    revalidatePath('/productos'); revalidatePath('/pos')
    return { success: true, actualizados: efectivos.length }
  } catch (error: any) {
    await registrarLog('ERROR', 'PRODUCTOS', `Error en cambio masivo de precios: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudieron actualizar los precios' }
  }
}
