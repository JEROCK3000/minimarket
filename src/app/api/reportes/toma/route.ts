import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { registrarLog } from '@/lib/logs/logger'
import { responderReporte } from '@/lib/reports/tabla'
import { contextoReporte, noAutorizado, errorReporte, formatoDe } from '../_comun'

// GET /api/reportes/toma?id&formato — detalle de una toma de inventario (solo ADMIN)
export async function GET(request: NextRequest) {
  const ctx = await contextoReporte('ADMIN')
  if (!ctx) return noAutorizado()
  const sp = new URL(request.url).searchParams
  const id = (sp.get('id') ?? '').slice(0, 40)
  try {
    const toma = await prisma.tomaInventario.findFirst({
      where: { id, tenantId: ctx.sesion.tenantId },
      include: { items: { include: { producto: { select: { nombre: true, codigoBarras: true, unidad: true, precioCompra: true } } } } },
    })
    if (!toma) return NextResponse.json({ error: 'Toma no encontrada' }, { status: 404 })
    const filas = toma.items
      .map((i) => {
        const dif = Number(i.cantidadContada) - Number(i.stockAlContar)
        const costo = Number(i.producto.precioCompra)
        return { i, dif, costo, valor: dif * costo }
      })
      .sort((a, b) => a.valor - b.valor) // mayores faltantes primero
    const faltante = filas.reduce((s, f) => s + (f.valor < 0 ? -f.valor : 0), 0)
    const sobrante = filas.reduce((s, f) => s + (f.valor > 0 ? f.valor : 0), 0)
    const estado = toma.estado === 'EN_CURSO' ? 'en curso (valores estimados)' : toma.estado === 'APLICADA' ? `aplicada por ${toma.aplicadaPor}` : 'cancelada (no se ajustó el stock)'

    await registrarLog('AUDIT', 'REPORTES', `Reporte toma ${toma.numero} (${formatoDe(sp)}) por ${ctx.sesion.email}`, undefined, ctx.sesion.tenantId)
    return responderReporte({
      formato: formatoDe(sp), empresa: ctx.empresa, archivo: `toma_${toma.numero}`, orientacion: 'landscape',
      titulo: `Toma de inventario ${toma.numero}`,
      subtitulo: `${toma.categoriaNombre ?? 'Todos los productos'} | ${toma.createdAt.toLocaleDateString('es-EC')} | ${estado} | ${filas.length} contado(s) | faltante $${faltante.toFixed(2)} · sobrante $${sobrante.toFixed(2)}`,
      columnas: [
        { header: 'Producto', ancho: 32 }, { header: 'Código', ancho: 16 }, { header: 'Sistema', tipo: 'numero', ancho: 10 },
        { header: 'Contado', tipo: 'numero', ancho: 10 }, { header: 'Diferencia', tipo: 'numero', ancho: 11 },
        { header: 'Costo unit.', tipo: 'moneda', ancho: 12 }, { header: 'Valor dif.', tipo: 'moneda', ancho: 12 }, { header: 'Contó', ancho: 18 },
      ],
      filas: filas.map((f) => [
        f.i.producto.nombre, f.i.producto.codigoBarras ?? '', Number(f.i.stockAlContar), Number(f.i.cantidadContada), f.dif, f.costo, f.valor, f.i.contadoPor,
      ]),
      totales: ['TOTAL NETO', null, null, null, null, null, sobrante - faltante, null],
    })
  } catch (error) {
    return errorReporte('toma', error, ctx.sesion.tenantId)
  }
}
