'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { revalidatePath } from 'next/cache'
import { moverStock } from '@/lib/inventario/movimientos'

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
      include: { items: true, factura: true, _count: { select: { abonos: true } } },
    })
    if (!venta) return { error: 'Venta no encontrada' }
    if (venta.estado === 'ANULADA') return { error: 'La venta ya está anulada' }
    if (venta._count.abonos > 0) {
      return { error: 'No se puede anular: esta venta a crédito ya tiene abonos registrados.' }
    }
    if (Number(venta.totalDevuelto) > 0) {
      return { error: 'No se puede anular: esta venta ya tiene devoluciones. Usa "Devolver productos" para devolver lo que queda.' }
    }
    if (venta.factura?.estado === 'AUTORIZADA') {
      return { error: 'No se puede anular: la factura ya fue autorizada por el SRI. Requiere una Nota de Crédito.' }
    }

    await prisma.$transaction(async (tx) => {
      // Marcar primero, condicionado a que siga activa: si dos anulaciones
      // llegan a la vez, solo una revierte el stock.
      const marcada = await tx.venta.updateMany({
        where: { id: ventaId, tenantId: sesion.tenantId, estado: { not: 'ANULADA' } },
        data: { estado: 'ANULADA', saldoPendiente: 0 },
      })
      if (marcada.count === 0) throw new Error('La venta ya está anulada')
      // Revertir stock de cada item (+ entra de vuelta)
      for (const it of venta.items) {
        await moverStock(tx, {
          tenantId: sesion.tenantId, productoId: it.productoId,
          cantidad: Number(it.cantidad) * Number(it.factor), tipo: 'AJUSTE', motivo: `Anulación venta ${venta.numero}`,
        })
      }
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
