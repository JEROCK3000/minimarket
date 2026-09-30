'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { format } from 'date-fns'
import { calcularVenta } from '@/lib/ventas/totales'
import { compradorDeVenta } from '@/lib/ventas/comprador'
import { formaPagoSri } from '@/lib/sri/impuestos'
import { ticketFactura, ticketVenta, ticketPrueba, etiquetasPrecio } from '@/lib/print/escpos'
import { redondear2 } from '@/lib/ventas/totales'
import { leerIpImpresora, ipValida } from '@/lib/print/impresora-config'

export type ResultadoTicketTermico =
  | { success: true; datosBase64: string; ip: string; tipo: 'FACTURA' | 'TICKET' }
  | { sinImpresora: true }
  | { error: string }

/**
 * Genera los bytes ESC/POS de una venta para la impresora térmica. Si la venta
 * tiene factura AUTORIZADA sale el RIDE (datos fiscales completos); si no, un
 * ticket de venta no fiscal. El navegador los envía al agente local (9448).
 */
export async function ticketTermicoAction(ventaId: string): Promise<ResultadoTicketTermico> {
  const sesion = await requerirTenant()
  try {
    const ip = await leerIpImpresora(sesion.tenantId)
    if (!ip) return { sinImpresora: true }

    const venta = await prisma.venta.findFirst({
      where: { id: ventaId, tenantId: sesion.tenantId },
      include: { cliente: true, items: { include: { producto: true } }, factura: true },
    })
    if (!venta) return { error: 'Venta no encontrada' }

    const emisor = await prisma.emisorSRI.findUnique({ where: { tenantId: sesion.tenantId } })
    const items = venta.items.map((it) => ({
      descripcion: it.producto.nombre, cantidad: Number(it.cantidad), precioUnitario: Number(it.precioUnitario),
    }))
    const totales = calcularVenta(
      venta.items.map((it) => ({
        cantidad: Number(it.cantidad), precioUnitario: Number(it.precioUnitario), ivaPorcentaje: Number(it.producto.ivaPorcentaje),
      })),
      Number(venta.descuento),
    )
    const pagoCon = venta.pagoCon != null ? Number(venta.pagoCon) : null
    const comprador = compradorDeVenta(venta)

    if (venta.factura?.estado === 'AUTORIZADA' && emisor && venta.cliente && comprador) {
      const ca = venta.factura.claveAcceso
      const bytes = ticketFactura({
        emisor: {
          razonSocial: emisor.razonSocial, nombreComercial: emisor.nombreComercial, ruc: emisor.ruc,
          dirMatriz: emisor.dirMatriz, dirEstablecimiento: emisor.dirEstablecimiento,
          contribuyenteEspecial: emisor.contribuyenteEspecial, obligadoContabilidad: emisor.obligadoContabilidad,
          ambiente: emisor.ambiente,
        },
        numero: `${ca.substring(24, 27)}-${ca.substring(27, 30)}-${ca.substring(30, 39)}`,
        fechaEmision: `${ca.substring(0, 2)}/${ca.substring(2, 4)}/${ca.substring(4, 8)}`,
        cliente: { nombre: venta.cliente.nombre, identificacion: comprador.identificacion, direccion: venta.cliente.direccion },
        items, totales,
        formaPagoSri: formaPagoSri(venta.formaPago),
        pagoCon,
        numeroAutorizacion: venta.factura.numeroAutorizacion,
        fechaAutorizacion: venta.factura.fechaAutorizacion ? format(venta.factura.fechaAutorizacion, 'dd/MM/yyyy HH:mm:ss') : null,
        claveAcceso: ca,
      })
      return { success: true, datosBase64: bytes.toString('base64'), ip, tipo: 'FACTURA' }
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: sesion.tenantId }, select: { nombre: true } })
    const bytes = ticketVenta({
      negocio: {
        nombre: emisor?.nombreComercial || emisor?.razonSocial || tenant?.nombre || 'MiniMarket',
        ruc: emisor?.ruc ?? null,
        direccion: emisor?.dirEstablecimiento ?? null,
      },
      numero: venta.numero,
      fecha: format(venta.fecha, 'dd/MM/yyyy HH:mm'),
      cliente: { nombre: venta.cliente?.nombre ?? 'CONSUMIDOR FINAL', identificacion: comprador?.identificacion ?? null },
      items, totales,
      formaPago: venta.formaPago,
      pagoCon,
      facturaPendiente: venta.requiereFactura && venta.estado !== 'ANULADA',
    })
    return { success: true, datosBase64: bytes.toString('base64'), ip, tipo: 'TICKET' }
  } catch (error: any) {
    await registrarLog('ERROR', 'IMPRESION', `Error generando ticket térmico: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo generar el ticket' }
  }
}

/** Ticket de prueba para la IP indicada (permite probar antes de guardar). */
export async function ticketPruebaAction(ip: string): Promise<{ success: true; datosBase64: string; ip: string } | { error: string }> {
  const sesion = await requerirTenant('ADMIN')
  const limpia = ip.trim()
  if (!ipValida(limpia)) return { error: 'IP no válida (ejemplo: 192.168.1.50)' }
  const [emisor, tenant] = await Promise.all([
    prisma.emisorSRI.findUnique({ where: { tenantId: sesion.tenantId }, select: { nombreComercial: true, razonSocial: true } }),
    prisma.tenant.findUnique({ where: { id: sesion.tenantId }, select: { nombre: true } }),
  ])
  const nombre = emisor?.nombreComercial || emisor?.razonSocial || tenant?.nombre || 'MiniMarket'
  return { success: true, datosBase64: ticketPrueba(nombre, limpia).toString('base64'), ip: limpia }
}

/** Etiquetas de precio (PVP con IVA) de hasta 100 productos del tenant, en la térmica. */
export async function etiquetasTermicaAction(productoIds: string[]): Promise<ResultadoTicketTermico> {
  const sesion = await requerirTenant()
  const ids = [...new Set((Array.isArray(productoIds) ? productoIds : []).filter((x) => typeof x === 'string'))].slice(0, 100)
  if (ids.length === 0) return { error: 'No hay productos para etiquetar' }
  try {
    const ip = await leerIpImpresora(sesion.tenantId)
    if (!ip) return { sinImpresora: true }
    const [productos, emisor, tenant] = await Promise.all([
      prisma.producto.findMany({
        where: { id: { in: ids }, tenantId: sesion.tenantId },
        select: { id: true, nombre: true, precioVenta: true, ivaPorcentaje: true, unidad: true, codigoBarras: true },
      }),
      prisma.emisorSRI.findUnique({ where: { tenantId: sesion.tenantId }, select: { nombreComercial: true, razonSocial: true } }),
      prisma.tenant.findUnique({ where: { id: sesion.tenantId }, select: { nombre: true } }),
    ])
    const orden = new Map(ids.map((id, i) => [id, i]))
    productos.sort((a, b) => (orden.get(a.id) ?? 0) - (orden.get(b.id) ?? 0))
    const negocio = emisor?.nombreComercial || emisor?.razonSocial || tenant?.nombre || 'MiniMarket'
    const bytes = etiquetasPrecio(productos.map((p) => ({
      negocio, nombre: p.nombre, unidad: p.unidad, codigoBarras: p.codigoBarras,
      precioFinal: redondear2(Number(p.precioVenta) * (1 + Number(p.ivaPorcentaje) / 100)),
    })))
    return { success: true, datosBase64: bytes.toString('base64'), ip, tipo: 'TICKET' }
  } catch (error: any) {
    await registrarLog('ERROR', 'IMPRESION', `Error generando etiquetas: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudieron generar las etiquetas' }
  }
}
