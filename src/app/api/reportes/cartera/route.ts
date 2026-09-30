import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { registrarLog } from '@/lib/logs/logger'
import { responderReporte } from '@/lib/reports/tabla'
import { contextoReporte, noAutorizado, errorReporte, formatoDe } from '../_comun'

// GET /api/reportes/cartera?formato — cuentas por cobrar (fiado) al día de hoy, con antigüedad (solo ADMIN)
export async function GET(request: NextRequest) {
  const ctx = await contextoReporte('ADMIN')
  if (!ctx) return noAutorizado()
  const sp = new URL(request.url).searchParams
  try {
    const ventas = await prisma.venta.findMany({
      where: { tenantId: ctx.sesion.tenantId, estado: 'COMPLETADA', saldoPendiente: { gt: 0 } },
      include: { cliente: { select: { nombre: true, identificacion: true, telefono: true } } },
      orderBy: { fecha: 'asc' },
    })
    const hoy = Date.now()
    const filas = ventas.map((v) => {
      const dias = Math.floor((hoy - v.fecha.getTime()) / 86400000)
      const vencida = v.diasCredito != null && dias > v.diasCredito
      return [
        v.cliente?.nombre ?? '—', v.cliente?.identificacion ?? '—', v.cliente?.telefono ?? '—', v.numero,
        v.fecha.toLocaleDateString('es-EC'), dias, vencida ? 'VENCIDA' : 'Al día', Number(v.total), Number(v.saldoPendiente),
      ] as (string | number)[]
    })
    const total = ventas.reduce((s, v) => s + Number(v.saldoPendiente), 0)
    await registrarLog('AUDIT', 'REPORTES', `Reporte de cartera (${formatoDe(sp)}) por ${ctx.sesion.email}`, undefined, ctx.sesion.tenantId)
    return responderReporte({
      formato: formatoDe(sp), empresa: ctx.empresa, archivo: 'cartera_por_cobrar', orientacion: 'landscape',
      titulo: 'Cartera por cobrar (fiado)', subtitulo: `Al ${new Date().toLocaleDateString('es-EC')} | ${ventas.length} venta(s) pendiente(s)`,
      columnas: [
        { header: 'Cliente', ancho: 26 }, { header: 'Identificación', ancho: 15 }, { header: 'Teléfono', ancho: 13 }, { header: 'Venta', ancho: 12 },
        { header: 'Fecha', ancho: 11 }, { header: 'Días', tipo: 'entero', ancho: 7 }, { header: 'Estado', ancho: 10 },
        { header: 'Total', tipo: 'moneda', ancho: 11 }, { header: 'Saldo', tipo: 'moneda', ancho: 11 },
      ],
      filas,
      totales: ['TOTAL', null, null, null, null, null, null, null, total],
    })
  } catch (error) {
    return errorReporte('cartera', error, ctx.sesion.tenantId)
  }
}
