import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { registrarLog } from '@/lib/logs/logger'
import { responderReporte, rangoFechas } from '@/lib/reports/tabla'
import { contextoReporte, noAutorizado, errorReporte, formatoDe } from '../_comun'

// GET /api/reportes/cajeros?desde&hasta&formato — ventas por cajero (solo ADMIN)
export async function GET(request: NextRequest) {
  const ctx = await contextoReporte('ADMIN')
  if (!ctx) return noAutorizado()
  const sp = new URL(request.url).searchParams
  const { desde, hasta, txt } = rangoFechas(sp)
  try {
    const ventas = await prisma.venta.findMany({
      where: { tenantId: ctx.sesion.tenantId, fecha: { gte: desde, lte: hasta } },
      select: { usuarioId: true, estado: true, total: true, descuento: true, formaPago: true, usuario: { select: { nombre: true } } },
    })
    const por = new Map<string, { nombre: string; n: number; total: number; efectivo: number; otros: number; descuentos: number; anuladas: number }>()
    for (const v of ventas) {
      const k = v.usuarioId ?? 'sin-usuario'
      const a = por.get(k) ?? { nombre: v.usuario?.nombre ?? 'Sin usuario', n: 0, total: 0, efectivo: 0, otros: 0, descuentos: 0, anuladas: 0 }
      if (v.estado === 'ANULADA') a.anuladas++
      else {
        a.n++
        a.total += Number(v.total)
        a.descuentos += Number(v.descuento)
        if (v.formaPago === 'EFECTIVO') a.efectivo += Number(v.total); else a.otros += Number(v.total)
      }
      por.set(k, a)
    }
    const filas = [...por.values()].sort((a, b) => b.total - a.total)
    const t = filas.reduce((s, c) => ({ n: s.n + c.n, total: s.total + c.total, ef: s.ef + c.efectivo, ot: s.ot + c.otros, d: s.d + c.descuentos, an: s.an + c.anuladas }), { n: 0, total: 0, ef: 0, ot: 0, d: 0, an: 0 })

    await registrarLog('AUDIT', 'REPORTES', `Reporte de ventas por cajero (${formatoDe(sp)}) por ${ctx.sesion.email}`, undefined, ctx.sesion.tenantId)
    return responderReporte({
      formato: formatoDe(sp), empresa: ctx.empresa, archivo: 'ventas_por_cajero', orientacion: 'landscape',
      titulo: 'Ventas por cajero', subtitulo: txt,
      columnas: [
        { header: 'Cajero', ancho: 28 }, { header: 'Ventas', tipo: 'entero', ancho: 10 }, { header: 'Total vendido', tipo: 'moneda', ancho: 15 },
        { header: 'Ticket promedio', tipo: 'moneda', ancho: 15 }, { header: 'Efectivo', tipo: 'moneda', ancho: 13 },
        { header: 'Tarjeta/Transf./Fiado', tipo: 'moneda', ancho: 18 }, { header: 'Descuentos', tipo: 'moneda', ancho: 13 }, { header: 'Anuladas', tipo: 'entero', ancho: 10 },
      ],
      filas: filas.map((c) => [c.nombre, c.n, c.total, c.n ? c.total / c.n : 0, c.efectivo, c.otros, c.descuentos, c.anuladas]),
      totales: ['TOTAL', t.n, t.total, t.n ? t.total / t.n : 0, t.ef, t.ot, t.d, t.an],
    })
  } catch (error) {
    return errorReporte('cajeros', error, ctx.sesion.tenantId)
  }
}
