import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { registrarLog } from '@/lib/logs/logger'
import { calcularVenta } from '@/lib/ventas/totales'
import { responderReporte, rangoFechas } from '@/lib/reports/tabla'
import { contextoReporte, noAutorizado, errorReporte, formatoDe } from '../_comun'

// GET /api/reportes/utilidad?desde&hasta&formato — utilidad y margen por producto (solo ADMIN)
export async function GET(request: NextRequest) {
  const ctx = await contextoReporte('ADMIN')
  if (!ctx) return noAutorizado()
  const sp = new URL(request.url).searchParams
  const { desde, hasta, txt } = rangoFechas(sp)
  try {
    const ventas = await prisma.venta.findMany({
      where: { tenantId: ctx.sesion.tenantId, estado: 'COMPLETADA', fecha: { gte: desde, lte: hasta } },
      include: { items: { include: { producto: { select: { nombre: true, precioCompra: true, ivaPorcentaje: true } } } } },
    })
    const porProducto = new Map<string, { nombre: string; cantidad: number; venta: number; costo: number; costoEstimado: boolean }>()
    for (const v of ventas) {
      // Base sin IVA por línea, con el descuento de la venta prorrateado (mismo cálculo que la factura).
      const calc = calcularVenta(
        v.items.map((it) => ({ cantidad: Number(it.cantidad), precioUnitario: Number(it.precioUnitario), ivaPorcentaje: Number(it.producto.ivaPorcentaje) })),
        Number(v.descuento),
      )
      v.items.forEach((it, i) => {
        const cant = Number(it.cantidad)
        const costoU = it.costoUnitario != null ? Number(it.costoUnitario) : Number(it.producto.precioCompra)
        const a = porProducto.get(it.productoId) ?? { nombre: it.producto.nombre, cantidad: 0, venta: 0, costo: 0, costoEstimado: false }
        a.cantidad += cant
        a.venta += calc.lineas[i].base
        a.costo += cant * costoU
        a.costoEstimado ||= it.costoUnitario == null
        porProducto.set(it.productoId, a)
      })
    }
    // Devoluciones del período: restan la venta; el costo vuelve solo si el producto
    // regresó al inventario (si volvió dañado, el costo queda como pérdida).
    const devueltos = await prisma.devolucionItem.findMany({
      where: { devolucion: { tenantId: ctx.sesion.tenantId, createdAt: { gte: desde, lte: hasta } } },
      include: { devolucion: { select: { reingresaStock: true } }, ventaItem: { select: { costoUnitario: true, producto: { select: { nombre: true, precioCompra: true } } } } },
    })
    for (const d of devueltos) {
      const cant = Number(d.cantidad)
      const costoU = d.ventaItem.costoUnitario != null ? Number(d.ventaItem.costoUnitario) : Number(d.ventaItem.producto.precioCompra)
      const a = porProducto.get(d.productoId) ?? { nombre: d.ventaItem.producto.nombre, cantidad: 0, venta: 0, costo: 0, costoEstimado: false }
      a.cantidad -= cant
      a.venta -= Number(d.base)
      if (d.devolucion.reingresaStock) a.costo -= cant * costoU
      porProducto.set(d.productoId, a)
    }
    const filas = [...porProducto.values()]
      .map((p) => ({ ...p, utilidad: p.venta - p.costo }))
      .sort((a, b) => b.utilidad - a.utilidad)
    const tot = filas.reduce((t, p) => ({ venta: t.venta + p.venta, costo: t.costo + p.costo }), { venta: 0, costo: 0 })
    const hayEstimados = filas.some((p) => p.costoEstimado)

    await registrarLog('AUDIT', 'REPORTES', `Reporte de utilidad (${formatoDe(sp)}) por ${ctx.sesion.email}`, undefined, ctx.sesion.tenantId)
    return responderReporte({
      formato: formatoDe(sp), empresa: ctx.empresa, archivo: 'utilidad_por_producto', orientacion: 'landscape',
      titulo: 'Utilidad y margen por producto',
      subtitulo: `${txt} | Ventas sin IVA, con descuentos y menos devoluciones${hayEstimados ? ' | * costo estimado con el precio de compra actual (ventas anteriores a sept-2026)' : ''}`,
      columnas: [
        { header: 'Producto', ancho: 34 }, { header: 'Cantidad', tipo: 'numero', ancho: 11 },
        { header: 'Venta neta', tipo: 'moneda', ancho: 14 }, { header: 'Costo', tipo: 'moneda', ancho: 14 },
        { header: 'Utilidad', tipo: 'moneda', ancho: 14 }, { header: 'Margen', tipo: 'porcentaje', ancho: 10 },
      ],
      filas: filas.map((p) => [
        p.nombre + (p.costoEstimado ? ' *' : ''), p.cantidad, p.venta, p.costo, p.utilidad, p.venta > 0 ? (p.utilidad / p.venta) * 100 : 0,
      ]),
      totales: ['TOTAL', null, tot.venta, tot.costo, tot.venta - tot.costo, tot.venta > 0 ? ((tot.venta - tot.costo) / tot.venta) * 100 : 0],
    })
  } catch (error) {
    return errorReporte('utilidad', error, ctx.sesion.tenantId)
  }
}
