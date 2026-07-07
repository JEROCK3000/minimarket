'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { format } from 'date-fns'

/** Devuelve los datos proyectados de la factura de una venta, SIN emitirla al SRI. */
export async function obtenerVistaPreviaFacturaAction(ventaId: string) {
  const sesion = await requerirTenant()
  try {
    const venta = await prisma.venta.findFirst({
      where: { id: ventaId, tenantId: sesion.tenantId },
      include: { cliente: true, items: { include: { producto: true } } },
    })
    if (!venta) return { error: 'Venta no encontrada' }

    const emisor = await prisma.emisorSRI.findUnique({ where: { tenantId: sesion.tenantId } })
    if (!emisor) return { error: 'Configura primero el emisor en Configuración > Facturación SRI' }

    // Secuencial proyectado (mayor entre el configurado y el histórico)
    const facturas = await prisma.facturaSRI.findMany({ where: { tenantId: sesion.tenantId }, select: { claveAcceso: true } })
    let maxSeq = emisor.secuencialFactura - 1
    for (const f of facturas) {
      const s = parseInt(f.claveAcceso.substring(30, 39), 10)
      if (!isNaN(s) && s > maxSeq) maxSeq = s
    }
    const secuencial = String(maxSeq + 1).padStart(9, '0')
    const numeroFactura = `${emisor.codigoEstablecimiento}-${emisor.codigoPuntoEmision}-${secuencial}`

    return {
      success: true,
      emisor: {
        razonSocial: emisor.razonSocial,
        ruc: emisor.ruc,
        ambiente: emisor.ambiente === 2 ? 'PRODUCCIÓN' : 'PRUEBAS',
      },
      cliente: venta.cliente
        ? { nombre: venta.cliente.nombre, identificacion: venta.cliente.identificacion }
        : { nombre: 'CONSUMIDOR FINAL', identificacion: '9999999999999' },
      numeroFactura,
      fecha: format(venta.fecha, 'dd/MM/yyyy'),
      items: venta.items.map((it) => ({
        nombre: it.producto.nombre,
        cantidad: Number(it.cantidad),
        precioUnitario: Number(it.precioUnitario),
        subtotal: Number(it.subtotal),
      })),
      totales: {
        subtotal: Number(venta.subtotal),
        descuento: Number(venta.descuento),
        iva: Number(venta.iva),
        total: Number(venta.total),
      },
    }
  } catch (error: any) {
    return { error: error.message || 'No se pudo obtener la vista previa' }
  }
}
