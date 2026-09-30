import { NextRequest } from 'next/server'
import { registrarLog } from '@/lib/logs/logger'
import { responderReporte } from '@/lib/reports/tabla'
import { vencimientosEnStock } from '@/lib/inventario/vencimientos'
import { contextoReporte, noAutorizado, errorReporte, formatoDe } from '../_comun'

// GET /api/reportes/por-vencer?dias=30&formato — productos en stock vencidos o por vencer (estimación FIFO por lote)
export async function GET(request: NextRequest) {
  const ctx = await contextoReporte()
  if (!ctx) return noAutorizado()
  const sp = new URL(request.url).searchParams
  const dias = Math.min(Math.max(parseInt(sp.get('dias') || '30', 10) || 30, 1), 365)
  try {
    const lista = await vencimientosEnStock(ctx.sesion.tenantId, dias)
    await registrarLog('AUDIT', 'REPORTES', `Reporte por vencer ${dias}d (${formatoDe(sp)}) por ${ctx.sesion.email}`, undefined, ctx.sesion.tenantId)
    return responderReporte({
      formato: formatoDe(sp), empresa: ctx.empresa, archivo: `productos_por_vencer_${dias}d`,
      titulo: 'Productos por vencer', subtitulo: `Vencidos o que vencen en los próximos ${dias} días | lotes en stock estimados por FIFO | ${lista.length} producto(s)`,
      columnas: [
        { header: 'Producto', ancho: 34 }, { header: 'Stock', tipo: 'numero', ancho: 10 }, { header: 'Unidad', ancho: 10 },
        { header: 'Vence', ancho: 13 }, { header: 'Estado', ancho: 18 },
      ],
      filas: lista.map((v) => [
        v.nombre, v.stock, v.unidad, v.fechaVencimiento.toLocaleDateString('es-EC'),
        v.dias < 0 ? `Vencido (${-v.dias} d)` : v.dias === 0 ? 'Vence hoy' : `En ${v.dias} día(s)`,
      ]),
    })
  } catch (error) {
    return errorReporte('por-vencer', error, ctx.sesion.tenantId)
  }
}
