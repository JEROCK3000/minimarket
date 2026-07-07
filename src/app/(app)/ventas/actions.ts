'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { revalidatePath } from 'next/cache'

/**
 * Anula una venta y REVIERTE el stock (devuelve la mercadería al inventario),
 * registrando el movimiento en el kardex.
 *
 * Regla fiscal: si la venta ya tiene factura AUTORIZADA por el SRI, no se puede
 * simplemente anular — eso requiere una Nota de Crédito. Se bloquea con aviso.
 */
export async function anularVentaAction(ventaId: string) {
  const sesion = await requerirTenant('ADMIN') // solo el dueño anula

  try {
    const venta = await prisma.venta.findFirst({
      where: { id: ventaId, tenantId: sesion.tenantId },
      include: { items: true, factura: true },
    })
    if (!venta) return { error: 'Venta no encontrada' }
    if (venta.estado === 'ANULADA') return { error: 'La venta ya está anulada' }
    if (venta.factura?.estado === 'AUTORIZADA') {
      return { error: 'No se puede anular: la factura ya fue autorizada por el SRI. Requiere una Nota de Crédito.' }
    }

    await prisma.$transaction(async (tx) => {
      // Revertir stock de cada item
      for (const it of venta.items) {
        const prod = await tx.producto.findUnique({ where: { id: it.productoId } })
        if (!prod) continue
        const stockPrevio = Number(prod.stock)
        const stockNuevo = stockPrevio + Number(it.cantidad)
        await tx.producto.update({ where: { id: it.productoId }, data: { stock: stockNuevo } })
        await tx.movimientoInventario.create({
          data: {
            tenantId: sesion.tenantId,
            productoId: it.productoId,
            tipo: 'AJUSTE',
            cantidad: Number(it.cantidad), // + entra de vuelta
            stockPrevio,
            stockNuevo,
            motivo: `Anulación venta ${venta.numero}`,
          },
        })
      }
      await tx.venta.update({ where: { id: ventaId }, data: { estado: 'ANULADA' } })
    })

    await registrarLog('AUDIT', 'VENTAS', `Venta ANULADA: ${venta.numero} (stock revertido)`, undefined, sesion.tenantId)
    revalidatePath('/ventas')
    revalidatePath('/productos')
    revalidatePath('/dashboard')
    return { success: true }
  } catch (error: any) {
    await registrarLog('ERROR', 'VENTAS', `Error anulando venta: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo anular la venta' }
  }
}
