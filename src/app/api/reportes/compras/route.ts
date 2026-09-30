import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { registrarLog } from '@/lib/logs/logger'
import { responderReporte, rangoFechas } from '@/lib/reports/tabla'
import { contextoReporte, noAutorizado, errorReporte, formatoDe } from '../_comun'

// GET /api/reportes/compras?desde&hasta&formato — compras del período (solo ADMIN). Las anuladas se listan pero no suman.
export async function GET(request: NextRequest) {
  const ctx = await contextoReporte('ADMIN')
  if (!ctx) return noAutorizado()
  const sp = new URL(request.url).searchParams
  const { desde, hasta, txt } = rangoFechas(sp)
  try {
    const compras = await prisma.compra.findMany({
      where: { tenantId: ctx.sesion.tenantId, fecha: { gte: desde, lte: hasta } },
      include: { proveedor: { select: { nombre: true } } },
      orderBy: { fecha: 'asc' },
    })
    const activas = compras.filter((c) => c.estado !== 'ANULADA')
    const suma = (k: 'subtotal' | 'iva' | 'total') => activas.reduce((s, c) => s + Number(c[k]), 0)

    await registrarLog('AUDIT', 'REPORTES', `Reporte de compras (${formatoDe(sp)}) por ${ctx.sesion.email}`, undefined, ctx.sesion.tenantId)
    return responderReporte({
      formato: formatoDe(sp), empresa: ctx.empresa, archivo: 'compras', orientacion: 'landscape',
      titulo: 'Reporte de compras', subtitulo: `${txt} | ${activas.length} compra(s) activa(s); las anuladas no suman`,
      columnas: [
        { header: 'Nº', ancho: 12 }, { header: 'Fecha', ancho: 12 }, { header: 'Proveedor', ancho: 28 }, { header: 'Factura', ancho: 20 },
        { header: 'Estado', ancho: 10 }, { header: 'Subtotal', tipo: 'moneda', ancho: 13 }, { header: 'IVA', tipo: 'moneda', ancho: 11 }, { header: 'Total', tipo: 'moneda', ancho: 13 },
      ],
      filas: compras.map((c) => [
        c.numero, c.fecha.toLocaleDateString('es-EC'), c.proveedor?.nombre ?? 'Sin proveedor', c.numFactura ?? '—', c.estado,
        Number(c.subtotal), Number(c.iva), Number(c.total),
      ]),
      totales: ['TOTAL', null, null, null, null, suma('subtotal'), suma('iva'), suma('total')],
    })
  } catch (error) {
    return errorReporte('compras', error, ctx.sesion.tenantId)
  }
}
