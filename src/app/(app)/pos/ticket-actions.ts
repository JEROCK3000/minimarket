'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { format } from 'date-fns'

export interface TicketData {
  negocio: { nombre: string; ruc: string | null; direccion: string | null }
  venta: {
    numero: string; fecha: string; formaPago: string
    cliente: string; clienteId: string | null
    items: { nombre: string; cantidad: number; precioUnitario: number; subtotal: number }[]
    subtotal: number; descuento: number; iva: number; total: number
    pagoCon: number | null; vuelto: number | null
  }
  factura: { numero: string; claveAcceso: string; autorizacion: string | null } | null
}

/** Devuelve los datos para imprimir el ticket/comprobante de una venta. */
export async function obtenerTicketAction(ventaId: string): Promise<{ success: true; ticket: TicketData } | { error: string }> {
  const sesion = await requerirTenant()
  try {
    const venta = await prisma.venta.findFirst({
      where: { id: ventaId, tenantId: sesion.tenantId },
      include: { cliente: true, items: { include: { producto: true } }, factura: true },
    })
    if (!venta) return { error: 'Venta no encontrada' }

    const emisor = await prisma.emisorSRI.findUnique({ where: { tenantId: sesion.tenantId } })
    const tenant = await prisma.tenant.findUnique({ where: { id: sesion.tenantId }, select: { nombre: true } })

    let facturaInfo = null
    if (venta.factura && venta.factura.estado === 'AUTORIZADA') {
      const ca = venta.factura.claveAcceso
      facturaInfo = {
        numero: `${ca.substring(24, 27)}-${ca.substring(27, 30)}-${ca.substring(30, 39)}`,
        claveAcceso: ca,
        autorizacion: venta.factura.numeroAutorizacion,
      }
    }

    return {
      success: true,
      ticket: {
        negocio: {
          nombre: emisor?.nombreComercial || emisor?.razonSocial || tenant?.nombre || 'MiniMarket',
          ruc: emisor?.ruc ?? null,
          direccion: emisor?.dirEstablecimiento ?? null,
        },
        venta: {
          numero: venta.numero,
          fecha: format(venta.fecha, 'dd/MM/yyyy HH:mm'),
          formaPago: venta.formaPago,
          cliente: venta.cliente?.nombre ?? 'Consumidor Final',
          clienteId: venta.cliente?.identificacion ?? null,
          items: venta.items.map((it) => ({
            nombre: it.producto.nombre, cantidad: Number(it.cantidad),
            precioUnitario: Number(it.precioUnitario), subtotal: Number(it.subtotal),
          })),
          subtotal: Number(venta.subtotal), descuento: Number(venta.descuento),
          iva: Number(venta.iva), total: Number(venta.total),
          pagoCon: venta.pagoCon ? Number(venta.pagoCon) : null,
          vuelto: venta.pagoCon ? Math.max(0, Number(venta.pagoCon) - Number(venta.total)) : null,
        },
        factura: facturaInfo,
      },
    }
  } catch (error: any) {
    return { error: error.message || 'No se pudo obtener el ticket' }
  }
}
