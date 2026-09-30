import type { Prisma, TipoMovimiento } from '@prisma/client'

/**
 * Mueve el stock de un producto y registra el kardex, dentro de una
 * transacción. El cambio es ATÓMICO (increment/decrement en la BD): dos
 * ventas simultáneas del mismo producto no se pisan, y un producto repetido
 * en la misma operación se descuenta las dos veces. El stock previo se deriva
 * del resultado, así el kardex siempre cuadra con el stock real.
 *
 * @param cantidad con signo: + entra (compra, ajuste positivo), − sale (venta, merma)
 */
export async function moverStock(
  tx: Prisma.TransactionClient,
  m: {
    tenantId: string
    productoId: string
    cantidad: number
    tipo: TipoMovimiento
    motivo: string
    precioCompra?: number
  },
) {
  const actualizado = await tx.producto.update({
    where: { id: m.productoId },
    data: {
      stock: m.cantidad >= 0 ? { increment: m.cantidad } : { decrement: -m.cantidad },
      ...(m.precioCompra !== undefined ? { precioCompra: m.precioCompra } : {}),
    },
    select: { stock: true },
  })
  const stockNuevo = Number(actualizado.stock)
  const stockPrevio = stockNuevo - m.cantidad
  await tx.movimientoInventario.create({
    data: {
      tenantId: m.tenantId,
      productoId: m.productoId,
      tipo: m.tipo,
      cantidad: m.cantidad,
      stockPrevio,
      stockNuevo,
      motivo: m.motivo.slice(0, 200),
    },
  })
  return { stockPrevio, stockNuevo }
}
