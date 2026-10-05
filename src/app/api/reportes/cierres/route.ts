import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { registrarLog } from '@/lib/logs/logger'
import { responderReporte, rangoFechas } from '@/lib/reports/tabla'
import { contextoReporte, noAutorizado, errorReporte, formatoDe } from '../_comun'

// GET /api/reportes/cierres?desde&hasta&formato — historial de cierres de caja (solo ADMIN)
export async function GET(request: NextRequest) {
  const ctx = await contextoReporte('ADMIN')
  if (!ctx) return noAutorizado()
  const sp = new URL(request.url).searchParams
  const { desde, hasta, txt } = rangoFechas(sp)
  try {
    const cierres = await prisma.cierreCaja.findMany({
      where: { tenantId: ctx.sesion.tenantId, createdAt: { gte: desde, lte: hasta } },
      orderBy: { createdAt: 'asc' },
    })
    const s = (k: 'totalVendido' | 'diferencia' | 'retirosEfectivo' | 'ingresosEfectivo') => cierres.reduce((a, c) => a + Number(c[k]), 0)
    const hora = (d: Date) => d.toLocaleString('es-EC', { timeZone: 'America/Guayaquil', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

    await registrarLog('AUDIT', 'REPORTES', `Reporte de cierres de caja (${formatoDe(sp)}) por ${ctx.sesion.email}`, undefined, ctx.sesion.tenantId)
    return responderReporte({
      formato: formatoDe(sp), empresa: ctx.empresa, archivo: 'cierres_de_caja', orientacion: 'landscape',
      titulo: 'Historial de cierres de caja', subtitulo: `${txt} | ${cierres.length} cierre(s)`,
      columnas: [
        { header: 'Cierre', ancho: 14 }, { header: 'Desde', ancho: 14 }, { header: 'Cajero', ancho: 20 },
        { header: 'Fondo', tipo: 'moneda', ancho: 10 }, { header: 'Efectivo', tipo: 'moneda', ancho: 11 }, { header: 'Tarjeta', tipo: 'moneda', ancho: 11 },
        { header: 'Transf.', tipo: 'moneda', ancho: 11 }, { header: 'Total vendido', tipo: 'moneda', ancho: 13 }, { header: 'Gastos', tipo: 'moneda', ancho: 10 },
        { header: 'Retiros', tipo: 'moneda', ancho: 10 }, { header: 'Ingresos', tipo: 'moneda', ancho: 10 },
        { header: 'Esperado', tipo: 'moneda', ancho: 11 }, { header: 'Contado', tipo: 'moneda', ancho: 11 }, { header: 'Diferencia', tipo: 'moneda', ancho: 11 },
      ],
      filas: cierres.map((c) => [
        hora(c.createdAt), hora(c.desde), c.usuarioNombre ?? '—', Number(c.fondoInicial), Number(c.ventasEfectivo), Number(c.ventasTarjeta),
        Number(c.ventasTransfer), Number(c.totalVendido), Number(c.gastosEfectivo),
        Number(c.retirosEfectivo), Number(c.ingresosEfectivo), Number(c.efectivoEsperado), Number(c.efectivoContado), Number(c.diferencia),
      ]),
      totales: ['TOTAL', null, null, null, null, null, null, s('totalVendido'), null, s('retirosEfectivo'), s('ingresosEfectivo'), null, null, s('diferencia')],
    })
  } catch (error) {
    return errorReporte('cierres', error, ctx.sesion.tenantId)
  }
}
