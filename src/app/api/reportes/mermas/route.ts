import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { registrarLog } from '@/lib/logs/logger'
import { responderReporte, rangoFechas } from '@/lib/reports/tabla'
import { CATEGORIAS_MERMA, esCategoriaMerma } from '@/lib/inventario/mermas'
import { contextoReporte, noAutorizado, errorReporte, formatoDe } from '../_comun'

// GET /api/reportes/mermas?desde&hasta&formato — pérdidas de inventario valorizadas a costo (solo ADMIN):
// mermas (vencido, dañado, consumo, robo…) y faltantes de conteos/tomas de inventario.
export async function GET(request: NextRequest) {
  const ctx = await contextoReporte('ADMIN')
  if (!ctx) return noAutorizado()
  const sp = new URL(request.url).searchParams
  const { desde, hasta, txt } = rangoFechas(sp)
  try {
    const movs = await prisma.movimientoInventario.findMany({
      where: {
        tenantId: ctx.sesion.tenantId, createdAt: { gte: desde, lte: hasta }, cantidad: { lt: 0 },
        OR: [{ tipo: 'MERMA' }, { categoria: { not: null } }],
      },
      include: { producto: { select: { nombre: true, unidad: true, precioCompra: true } } },
      orderBy: { createdAt: 'asc' },
    })
    const filas = movs.map((m) => {
      const cantidad = -Number(m.cantidad)
      const costo = m.costoUnitario !== null ? Number(m.costoUnitario) : Number(m.producto.precioCompra) // movimientos anteriores al cambio
      const cat = m.categoria && esCategoriaMerma(m.categoria) ? CATEGORIAS_MERMA[m.categoria] : 'Sin clasificar'
      return { m, cantidad, costo, valor: cantidad * costo, cat }
    })
    const total = filas.reduce((s, f) => s + f.valor, 0)
    const porCat = new Map<string, number>()
    for (const f of filas) porCat.set(f.cat, (porCat.get(f.cat) ?? 0) + f.valor)
    const resumen = [...porCat.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => `${c}: $${v.toFixed(2)}`).join(' · ')

    await registrarLog('AUDIT', 'REPORTES', `Reporte de mermas (${formatoDe(sp)}) por ${ctx.sesion.email}`, undefined, ctx.sesion.tenantId)
    return responderReporte({
      formato: formatoDe(sp), empresa: ctx.empresa, archivo: 'mermas', orientacion: 'landscape',
      titulo: 'Mermas y pérdidas de inventario',
      subtitulo: `${txt} | ${filas.length} movimiento(s) | valorizado a costo${resumen ? ` | ${resumen}` : ''}`,
      columnas: [
        { header: 'Fecha', ancho: 16 }, { header: 'Producto', ancho: 30 }, { header: 'Tipo', ancho: 18 },
        { header: 'Cantidad', tipo: 'numero', ancho: 10 }, { header: 'Costo unit.', tipo: 'moneda', ancho: 12 },
        { header: 'Valor perdido', tipo: 'moneda', ancho: 14 }, { header: 'Detalle', ancho: 34 }, { header: 'Registró', ancho: 18 },
      ],
      filas: filas.map((f) => [
        f.m.createdAt.toLocaleString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        f.m.producto.nombre, f.cat, f.cantidad, f.costo, f.valor, f.m.motivo ?? '', f.m.usuarioNombre ?? '—',
      ]),
      totales: ['TOTAL', null, null, null, null, total, null, null],
    })
  } catch (error) {
    return errorReporte('mermas', error, ctx.sesion.tenantId)
  }
}
