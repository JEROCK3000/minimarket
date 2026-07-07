'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { generarRidePDF } from '@/lib/reports/ride'
import { enviarFacturaPorEmail } from '@/lib/utils/email'
import { format } from 'date-fns'
import { readFileSync, existsSync } from 'fs'

/** Carga el logo del emisor desde disco y lo devuelve como base64 para el RIDE. */
function cargarLogo(logoPath: string | null): { base64: string; formato: 'PNG' | 'JPEG' } | null {
  if (!logoPath || !existsSync(logoPath)) return null
  try {
    const buf = readFileSync(logoPath)
    const esPng = buf[0] === 0x89 && buf[1] === 0x50
    const formato = esPng ? 'PNG' : 'JPEG'
    const mime = esPng ? 'image/png' : 'image/jpeg'
    return { base64: `data:${mime};base64,${buf.toString('base64')}`, formato }
  } catch {
    return null
  }
}

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

  // Desglose de subtotales por tarifa de IVA (15% vs 0%/exento)
  let subtotal15 = 0, subtotal0 = 0
  for (const it of venta.items) {
    const base = Number(it.subtotal)
    if (Number(it.producto.ivaPorcentaje) > 0) subtotal15 += base
    else subtotal0 += base
  }
  const subtotalSinImpuestos = Number(venta.subtotal) - Number(venta.descuento)

  const pdfBase64 = generarRidePDF({
    emisor: {
      razonSocial: emisor.razonSocial, nombreComercial: emisor.nombreComercial, ruc: emisor.ruc,
      dirMatriz: emisor.dirMatriz, dirEstablecimiento: emisor.dirEstablecimiento,
      obligadoContabilidad: emisor.obligadoContabilidad, ambiente: emisor.ambiente,
    },
    factura: {
      numero: numeroFactura,
      claveAcceso: venta.factura.claveAcceso,
      numeroAutorizacion: venta.factura.numeroAutorizacion,
      fechaAutorizacion: venta.factura.fechaAutorizacion,
      fechaEmision: format(venta.fecha, 'dd/MM/yyyy'),
      formaPago: venta.formaPago,
    },
    cliente: {
      nombre: venta.cliente?.nombre ?? 'CONSUMIDOR FINAL',
      identificacion: venta.cliente?.identificacion ?? '9999999999999',
      direccion: venta.cliente?.direccion ?? null,
      email: venta.cliente?.email ?? null,
    },
    items: venta.items.map((it) => ({
      codigo: it.productoId.slice(-6),
      descripcion: it.producto.nombre,
      cantidad: Number(it.cantidad),
      precioUnitario: Number(it.precioUnitario),
      descuento: 0,
      subtotal: Number(it.subtotal),
    })),
    totales: {
      subtotal15, subtotal0, subtotalSinImpuestos,
      descuento: Number(venta.descuento), iva: Number(venta.iva), total: Number(venta.total),
    },
    logo: cargarLogo(emisor.logoPath),
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

/** Envía la factura (RIDE PDF + XML) por correo. Si se pasa emailManual, se envía a ese
 *  correo; si no, al del cliente. Permite reenviar a cualquier destinatario. */
export async function enviarFacturaEmailAction(ventaId: string, emailManual?: string) {
  const sesion = await requerirTenant()
  try {
    const { pdfBase64, numeroFactura, venta } = await construirRide(sesion.tenantId, ventaId)
    const destino = (emailManual?.trim() || venta.cliente?.email || '').trim()
    if (!destino) return { error: 'Indica un correo de destino' }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destino)) return { error: 'El correo de destino no es válido' }

    await enviarFacturaPorEmail(
      sesion.tenantId,
      destino,
      numeroFactura,
      venta.factura!.claveAcceso,
      pdfBase64,
      venta.factura!.xmlFirmado || ''
    )
    return { success: true, email: destino }
  } catch (error: any) {
    await registrarLog('ERROR', 'VENTAS', `Error enviando factura: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: error.message || 'No se pudo enviar la factura' }
  }
}

// ═══ Nota de crédito: RIDE y envío por correo ════════════════════════════════

/** Construye el RIDE (PDF base64) de la nota de crédito de una venta. */
async function construirRideNC(tenantId: string, ventaId: string) {
  const venta = await prisma.venta.findFirst({
    where: { id: ventaId, tenantId },
    include: { cliente: true, items: { include: { producto: true } }, notaCredito: true },
  })
  if (!venta || !venta.notaCredito) throw new Error('Nota de crédito no encontrada')
  if (venta.notaCredito.estado !== 'AUTORIZADA') throw new Error('La nota de crédito debe estar AUTORIZADA')

  const emisor = await prisma.emisorSRI.findUnique({ where: { tenantId } })
  if (!emisor) throw new Error('Emisor no configurado')

  const ca = venta.notaCredito.claveAcceso
  const numeroNC = `${ca.substring(24, 27)}-${ca.substring(27, 30)}-${ca.substring(30, 39)}`

  // Número de la factura modificada (desde la clave de la factura original)
  const facturaOriginal = await prisma.facturaSRI.findUnique({ where: { ventaId } })
  const caF = facturaOriginal?.claveAcceso ?? ''
  const numFactura = caF ? `${caF.substring(24, 27)}-${caF.substring(27, 30)}-${caF.substring(30, 39)}` : '—'

  let subtotal15 = 0, subtotal0 = 0
  for (const it of venta.items) {
    const base = Number(it.subtotal)
    if (Number(it.producto.ivaPorcentaje) > 0) subtotal15 += base
    else subtotal0 += base
  }

  const pdfBase64 = generarRidePDF({
    tipoDocumento: 'NOTA_CREDITO',
    emisor: {
      razonSocial: emisor.razonSocial, nombreComercial: emisor.nombreComercial, ruc: emisor.ruc,
      dirMatriz: emisor.dirMatriz, dirEstablecimiento: emisor.dirEstablecimiento,
      obligadoContabilidad: emisor.obligadoContabilidad, ambiente: emisor.ambiente,
    },
    factura: {
      numero: numeroNC, claveAcceso: ca, numeroAutorizacion: venta.notaCredito.numeroAutorizacion,
      fechaAutorizacion: venta.notaCredito.fechaAutorizacion, fechaEmision: format(venta.notaCredito.createdAt, 'dd/MM/yyyy'), formaPago: venta.formaPago,
    },
    notaCredito: { docModificadoNumero: numFactura, motivo: venta.notaCredito.motivo },
    cliente: {
      nombre: venta.cliente?.nombre ?? 'CONSUMIDOR FINAL', identificacion: venta.cliente?.identificacion ?? '9999999999999',
      direccion: venta.cliente?.direccion ?? null, email: venta.cliente?.email ?? null,
    },
    items: venta.items.map((it) => ({
      codigo: it.productoId.slice(-6), descripcion: it.producto.nombre, cantidad: Number(it.cantidad),
      precioUnitario: Number(it.precioUnitario), descuento: 0, subtotal: Number(it.subtotal),
    })),
    totales: {
      subtotal15, subtotal0, subtotalSinImpuestos: Number(venta.subtotal) - Number(venta.descuento),
      descuento: Number(venta.descuento), iva: Number(venta.iva), total: Number(venta.total),
    },
    logo: cargarLogo(emisor.logoPath),
  })
  return { pdfBase64, numeroNC, venta }
}

export async function descargarRideNCAction(ventaId: string) {
  const sesion = await requerirTenant()
  try {
    const { pdfBase64, numeroNC } = await construirRideNC(sesion.tenantId, ventaId)
    await registrarLog('AUDIT', 'VENTAS', `RIDE nota de crédito descargado ${numeroNC}`, undefined, sesion.tenantId)
    return { success: true, pdfBase64, numeroNC }
  } catch (error: any) {
    return { error: error.message || 'No se pudo generar el PDF' }
  }
}

export async function enviarNCEmailAction(ventaId: string, emailManual?: string) {
  const sesion = await requerirTenant()
  try {
    const { pdfBase64, numeroNC, venta } = await construirRideNC(sesion.tenantId, ventaId)
    const destino = (emailManual?.trim() || venta.cliente?.email || '').trim()
    if (!destino) return { error: 'Indica un correo de destino' }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destino)) return { error: 'El correo de destino no es válido' }
    await enviarFacturaPorEmail(sesion.tenantId, destino, numeroNC, venta.notaCredito!.claveAcceso, pdfBase64, venta.notaCredito!.xmlFirmado || '')
    return { success: true, email: destino }
  } catch (error: any) {
    await registrarLog('ERROR', 'VENTAS', `Error enviando nota de crédito: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: error.message || 'No se pudo enviar la nota de crédito' }
  }
}
