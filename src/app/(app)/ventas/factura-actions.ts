'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { generarRidePDF } from '@/lib/reports/ride'
import { enviarFacturaPorEmail } from '@/lib/utils/email'
import { format } from 'date-fns'
import { readFileSync, existsSync } from 'fs'
import { compradorDeVenta } from '@/lib/ventas/comprador'
import { calcularVenta } from '@/lib/ventas/totales'
import { extraerInfoAdicional } from '@/lib/sri/info-adicional'

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

  const { items, totales } = datosRide(venta)

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
      identificacion: compradorDeVenta(venta)?.identificacion ?? '9999999999999',
      direccion: venta.cliente?.direccion ?? null,
      email: venta.cliente?.email ?? null,
    },
    items, totales,
    infoAdicional: extraerInfoAdicional(venta.factura.xmlFirmado),
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

/**
 * Construye el RIDE (PDF base64) de una nota de crédito de la venta: la indicada
 * por `ncId` o, si no se indica, la que anula toda la factura. Una NC parcial
 * lista solo los productos devueltos.
 */
async function construirRideNC(tenantId: string, ventaId: string, ncId?: string) {
  const venta = await prisma.venta.findFirst({
    where: { id: ventaId, tenantId },
    include: { cliente: true, items: { include: { producto: true } } },
  })
  const nc = venta && await prisma.notaCredito.findFirst({
    where: { tenantId, ventaId, estado: 'AUTORIZADA', ...(ncId ? { id: ncId } : { tipo: 'TOTAL' }) },
  })
  if (!venta || !nc) throw new ErrorRide('Nota de crédito no encontrada o no autorizada')

  const emisor = await prisma.emisorSRI.findUnique({ where: { tenantId } })
  if (!emisor) throw new Error('Emisor no configurado')

  const ca = nc.claveAcceso
  const numeroNC = `${ca.substring(24, 27)}-${ca.substring(27, 30)}-${ca.substring(30, 39)}`

  // Número de la factura modificada (desde la clave de la factura original)
  const facturaOriginal = await prisma.facturaSRI.findUnique({ where: { ventaId } })
  const caF = facturaOriginal?.claveAcceso ?? ''
  const numFactura = caF ? `${caF.substring(24, 27)}-${caF.substring(27, 30)}-${caF.substring(30, 39)}` : '—'

  const { items, totales } = nc.devolucionId ? await datosRideDevolucion(nc.devolucionId, venta.items) : datosRide(venta)

  const pdfBase64 = generarRidePDF({
    tipoDocumento: 'NOTA_CREDITO',
    emisor: {
      razonSocial: emisor.razonSocial, nombreComercial: emisor.nombreComercial, ruc: emisor.ruc,
      dirMatriz: emisor.dirMatriz, dirEstablecimiento: emisor.dirEstablecimiento,
      obligadoContabilidad: emisor.obligadoContabilidad, ambiente: emisor.ambiente,
    },
    factura: {
      numero: numeroNC, claveAcceso: ca, numeroAutorizacion: nc.numeroAutorizacion,
      fechaAutorizacion: nc.fechaAutorizacion, fechaEmision: format(nc.createdAt, 'dd/MM/yyyy'), formaPago: venta.formaPago,
    },
    notaCredito: { docModificadoNumero: numFactura, motivo: nc.motivo },
    cliente: {
      nombre: venta.cliente?.nombre ?? 'CONSUMIDOR FINAL', identificacion: compradorDeVenta(venta)?.identificacion ?? '9999999999999',
      direccion: venta.cliente?.direccion ?? null, email: venta.cliente?.email ?? null,
    },
    items, totales,
    infoAdicional: extraerInfoAdicional(nc.xmlFirmado),
    logo: cargarLogo(emisor.logoPath),
  })
  return { pdfBase64, numeroNC, venta, nc }
}

class ErrorRide extends Error {}

/** Ítems y totales del RIDE de una NC parcial (los guardados en la devolución). */
async function datosRideDevolucion(devolucionId: string, itemsVenta: { id: string; productoId: string; producto: { nombre: string } }[]) {
  const dev = await prisma.devolucion.findUniqueOrThrow({ where: { id: devolucionId }, include: { items: true } })
  const nombre = new Map(itemsVenta.map((i) => [i.id, i]))
  const baseDe = (gravada: boolean) => dev.items.filter((i) => (Number(i.ivaPorcentaje) > 0) === gravada).reduce((a, i) => a + Number(i.base), 0)
  return {
    items: dev.items.map((i) => ({
      codigo: (nombre.get(i.ventaItemId)?.productoId ?? i.productoId).slice(-6), descripcion: nombre.get(i.ventaItemId)?.producto.nombre ?? 'Producto',
      cantidad: Number(i.cantidad), precioUnitario: Number(i.precioUnitario), descuento: Number(i.descuento), subtotal: Number(i.base),
    })),
    totales: {
      subtotal15: baseDe(true), subtotal0: baseDe(false), subtotalSinImpuestos: Number(dev.total) - Number(dev.iva),
      descuento: Number(dev.descuento), iva: Number(dev.iva), total: Number(dev.total),
    },
  }
}

export async function descargarRideNCAction(ventaId: string, ncId?: string) {
  const sesion = await requerirTenant()
  try {
    const { pdfBase64, numeroNC } = await construirRideNC(sesion.tenantId, String(ventaId), ncId ? String(ncId) : undefined)
    await registrarLog('AUDIT', 'VENTAS', `RIDE nota de crédito descargado ${numeroNC}`, undefined, sesion.tenantId)
    return { success: true, pdfBase64, numeroNC }
  } catch (error: any) {
    if (error instanceof ErrorRide) return { error: error.message }
    await registrarLog('ERROR', 'VENTAS', `Error generando RIDE de NC: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo generar el PDF' }
  }
}

export async function enviarNCEmailAction(ventaId: string, emailManual?: string, ncId?: string) {
  const sesion = await requerirTenant()
  try {
    const { pdfBase64, numeroNC, venta, nc } = await construirRideNC(sesion.tenantId, String(ventaId), ncId ? String(ncId) : undefined)
    const destino = (emailManual?.trim() || venta.cliente?.email || '').trim()
    if (!destino) return { error: 'Indica un correo de destino' }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destino)) return { error: 'El correo de destino no es válido' }
    await enviarFacturaPorEmail(sesion.tenantId, destino, numeroNC, nc.claveAcceso, pdfBase64, nc.xmlFirmado || '')
    return { success: true, email: destino }
  } catch (error: any) {
    await registrarLog('ERROR', 'VENTAS', `Error enviando nota de crédito: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: error instanceof ErrorRide ? error.message : 'No se pudo enviar la nota de crédito' }
  }
}

/**
 * Líneas y totales del RIDE con el MISMO cálculo que el XML enviado al SRI
 * (lib/ventas/totales.ts: tarifa de IVA por producto y descuento prorrateado).
 * Antes los subtotales por tarifa se calculaban sin descuento y el IVA/total se
 * tomaban de la venta: con descuento, el PDF podía no coincidir con el XML.
 */
function datosRide(venta: {
  descuento: unknown
  items: { productoId: string; cantidad: unknown; precioUnitario: unknown; producto: { nombre: string; ivaPorcentaje: unknown } }[]
}) {
  const calc = calcularVenta(
    venta.items.map((it) => ({ cantidad: Number(it.cantidad), precioUnitario: Number(it.precioUnitario), ivaPorcentaje: Number(it.producto.ivaPorcentaje) })),
    Number(venta.descuento),
  )
  const baseDe = (gravada: boolean) => calc.porTarifa.filter((t) => (t.tarifa > 0) === gravada).reduce((a, t) => a + t.base, 0)
  return {
    items: venta.items.map((it, i) => ({
      codigo: it.productoId.slice(-6), descripcion: it.producto.nombre, cantidad: Number(it.cantidad),
      precioUnitario: Number(it.precioUnitario), descuento: calc.lineas[i].descuento, subtotal: calc.lineas[i].base,
    })),
    totales: {
      subtotal15: baseDe(true), subtotal0: baseDe(false), subtotalSinImpuestos: calc.base,
      descuento: calc.descuento, iva: calc.iva, total: calc.total,
    },
  }
}
