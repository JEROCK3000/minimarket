import { prisma } from '@/lib/db/prisma'

/**
 * Vencimientos de productos con stock (solo servidor; recibe tenantId, no es server action).
 *
 * Los lotes se registran en las compras (CompraItem.fechaVencimiento). Como no se
 * lleva stock por lote, se estima con FIFO qué lotes siguen en bodega: se recorren
 * las compras ACTIVAS del producto de la más reciente a la más antigua, sumando
 * cantidades hasta cubrir el stock actual; solo esos lotes cuentan. Así no se
 * avisa de lotes viejos que ya se vendieron.
 */
export interface VencimientoProducto {
  productoId: string
  nombre: string
  stock: number
  unidad: string
  fechaVencimiento: Date // la más próxima entre los lotes que siguen en stock
  dias: number           // días que faltan (negativo = vencido)
}

const DIA = 86400000

export async function vencimientosEnStock(tenantId: string, diasAviso = 30): Promise<VencimientoProducto[]> {
  const items = await prisma.compraItem.findMany({
    where: {
      compra: { tenantId, estado: 'ACTIVA' },
      producto: { activo: true, stock: { gt: 0 } },
      productoId: { in: (await prisma.compraItem.findMany({
        where: { compra: { tenantId, estado: 'ACTIVA' }, fechaVencimiento: { not: null } },
        select: { productoId: true }, distinct: ['productoId'],
      })).map((x) => x.productoId) },
    },
    select: {
      productoId: true, cantidad: true, fechaVencimiento: true,
      compra: { select: { fecha: true } },
      producto: { select: { nombre: true, stock: true, unidad: true } },
    },
  })

  const porProducto = new Map<string, typeof items>()
  for (const it of items) porProducto.set(it.productoId, [...(porProducto.get(it.productoId) ?? []), it])

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const resultado: VencimientoProducto[] = []
  for (const [productoId, lotes] of porProducto) {
    lotes.sort((a, b) => b.compra.fecha.getTime() - a.compra.fecha.getTime()) // más reciente primero
    const stock = Number(lotes[0].producto.stock)
    let acumulado = 0
    let proxima: Date | null = null
    for (const l of lotes) {
      if (acumulado >= stock) break
      acumulado += Number(l.cantidad)
      if (l.fechaVencimiento && (!proxima || l.fechaVencimiento < proxima)) proxima = l.fechaVencimiento
    }
    if (!proxima) continue
    // La columna es DATE (guardada a mediodía UTC): comparar por día calendario.
    const venc = new Date(proxima.getUTCFullYear(), proxima.getUTCMonth(), proxima.getUTCDate())
    const dias = Math.round((venc.getTime() - hoy.getTime()) / DIA)
    if (dias <= diasAviso) {
      resultado.push({ productoId, nombre: lotes[0].producto.nombre, stock, unidad: lotes[0].producto.unidad, fechaVencimiento: venc, dias })
    }
  }
  return resultado.sort((a, b) => a.dias - b.dias)
}
