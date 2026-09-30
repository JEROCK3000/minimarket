import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { registrarLog } from '@/lib/logs/logger'
import { responderReporte } from '@/lib/reports/tabla'
import { contextoReporte, noAutorizado, errorReporte, formatoDe } from '../_comun'

// GET /api/reportes/sin-movimiento?dias=30&formato — productos con stock que no se vendieron en N días
export async function GET(request: NextRequest) {
  const ctx = await contextoReporte()
  if (!ctx) return noAutorizado()
  const sp = new URL(request.url).searchParams
  const dias = Math.min(Math.max(parseInt(sp.get('dias') || '30', 10) || 30, 1), 365)
  const limite = new Date(Date.now() - dias * 86400000)
  try {
    const [productos, ultimas] = await Promise.all([
      prisma.producto.findMany({
        where: { tenantId: ctx.sesion.tenantId, activo: true, stock: { gt: 0 } },
        include: { categoria: { select: { nombre: true } } },
      }),
      prisma.movimientoInventario.groupBy({
        by: ['productoId'], where: { tenantId: ctx.sesion.tenantId, tipo: 'VENTA' }, _max: { createdAt: true },
      }),
    ])
    const ultimaVenta = new Map(ultimas.map((u) => [u.productoId, u._max.createdAt]))
    const quietos = productos
      .map((p) => ({ p, ultima: ultimaVenta.get(p.id) ?? null }))
      .filter(({ ultima }) => !ultima || ultima < limite)
      .map(({ p, ultima }) => ({
        nombre: p.nombre, categoria: p.categoria?.nombre ?? '—', stock: Number(p.stock),
        costo: Number(p.precioCompra), valor: Number(p.stock) * Number(p.precioCompra), ultima,
      }))
      .sort((a, b) => b.valor - a.valor)
    const total = quietos.reduce((s, q) => s + q.valor, 0)

    await registrarLog('AUDIT', 'REPORTES', `Reporte productos sin movimiento ${dias}d (${formatoDe(sp)}) por ${ctx.sesion.email}`, undefined, ctx.sesion.tenantId)
    return responderReporte({
      formato: formatoDe(sp), empresa: ctx.empresa, archivo: `productos_sin_venta_${dias}d`,
      titulo: 'Productos sin movimiento', subtitulo: `Con stock y sin ventas en los últimos ${dias} días | ${quietos.length} producto(s) | capital inmovilizado a costo`,
      columnas: [
        { header: 'Producto', ancho: 32 }, { header: 'Categoría', ancho: 16 }, { header: 'Stock', tipo: 'numero', ancho: 10 },
        { header: 'Costo unit.', tipo: 'moneda', ancho: 12 }, { header: 'Valor a costo', tipo: 'moneda', ancho: 14 }, { header: 'Última venta', ancho: 14 },
      ],
      filas: quietos.map((q) => [q.nombre, q.categoria, q.stock, q.costo, q.valor, q.ultima ? q.ultima.toLocaleDateString('es-EC') : 'Nunca']),
      totales: ['TOTAL', null, null, null, total, null],
    })
  } catch (error) {
    return errorReporte('sin-movimiento', error, ctx.sesion.tenantId)
  }
}
