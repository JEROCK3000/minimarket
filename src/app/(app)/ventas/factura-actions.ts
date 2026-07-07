'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { generarRidePDF } from '@/lib/reports/ride'
import { enviarFacturaPorEmail } from '@/lib/utils/email'
import { format } from 'date-fns'

/** Carga los datos y arma el RIDE en base64 de una venta con factura autorizada. */
async function construirRide(tenantId: string, ventaId: string) {
  const venta = await prisma.venta.findFirst({
    where: { id: ventaId, tenantId },
    include: { cliente: true, items: { include: { producto: true } }, factura: true },
  })
  if (!venta || !venta.factura) throw new Error('Venta o factura no encontrada')
  if (venta.factura.estado !== 'AUTORIZADA') throw new Error('La factura debe estar AUTORIZADA')

  const emisor = await prisma.emisorSRI.findUnique({ where: { tenantId } })
  if (!emisor) throw new Error('Emisor no configurado')

  const estab = venta.factura.claveAcceso.substring(24, 27)
  const ptoEmi = venta.factura.claveAcceso.substring(27, 30)
  const seq = venta.factura.claveAcceso.substring(30, 39)
  const numeroFactura = `${estab}-${ptoEmi}-${seq}`

  const pdfBase64 = generarRidePDF({
    emisor: { razonSocial: emisor.razonSocial, nombreComercial: emisor.nombreComercial, ruc: emisor.ruc, dirMatriz: emisor.dirMatriz, ambiente: emisor.ambiente },
    factura: {
      numero: numeroFactura,
      claveAcceso: venta.factura.claveAcceso,
      numeroAutorizacion: venta.factura.numeroAutorizacion,
      fechaAutorizacion: venta.factura.fechaAutorizacion,
      fechaEmision: format(venta.fecha, 'dd/MM/yyyy'),
    },
    cliente: { nombre: venta.cliente?.nombre ?? 'CONSUMIDOR FINAL', identificacion: venta.cliente?.identificacion ?? '9999999999999' },
    items: venta.items.map((it) => ({ descripcion: it.producto.nombre, cantidad: Number(it.cantidad), precioUnitario: Number(it.precioUnitario), subtotal: Number(it.subtotal) })),
    totales: { subtotal: Number(venta.subtotal), descuento: Number(venta.descuento), iva: Number(venta.iva), total: Number(venta.total) },
  })

  return { pdfBase64, numeroFactura, venta, emisor }
}

/** Devuelve el RIDE (PDF base64) para descargar en el navegador. */
export async function descargarRideAction(ventaId: string) {
  const sesion = await requerirTenant()
  try {
    const { pdfBase64, numeroFactura } = await construirRide(sesion.tenantId, ventaId)
    await registrarLog('AUDIT', 'VENTAS', `RIDE descargado factura ${numeroFactura}`, undefined, sesion.tenantId)
    return { success: true, pdfBase64, numeroFactura }
  } catch (error: any) {
    return { error: error.message || 'No se pudo generar el PDF' }
  }
}

/** Envía la factura (RIDE PDF + XML) al correo del cliente. */
export async function enviarFacturaEmailAction(ventaId: string) {
  const sesion = await requerirTenant()
  try {
    const { pdfBase64, numeroFactura, venta } = await construirRide(sesion.tenantId, ventaId)
    if (!venta.cliente?.email) return { error: 'El cliente no tiene correo electrónico registrado' }

    await enviarFacturaPorEmail(
      sesion.tenantId,
      venta.cliente.email,
      numeroFactura,
      venta.factura!.claveAcceso,
      pdfBase64,
      venta.factura!.xmlFirmado || ''
    )
    return { success: true, email: venta.cliente.email }
  } catch (error: any) {
    await registrarLog('ERROR', 'VENTAS', `Error enviando factura: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: error.message || 'No se pudo enviar la factura' }
  }
}
