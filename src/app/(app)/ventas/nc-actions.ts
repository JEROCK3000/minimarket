'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { descifrarSecreto } from '@/lib/security/crypto'
import { revalidatePath } from 'next/cache'
import { getP12FromLocalFile, documentReception, documentAuthorization } from 'open-factura'
import { signCreditNoteXml } from 'ec-sri-invoice-signer'
import { format } from 'date-fns'
import { ENDPOINTS_SRI, mapTipoIdentificacion, generarClaveAcceso } from '@/lib/sri/helpers'
import { generarXmlNotaCredito } from '@/lib/sri/nota-credito'

/**
 * Emite una Nota de Crédito que anula por completo una factura autorizada.
 * Al autorizarse, revierte el stock de los productos al inventario.
 */
export async function emitirNotaCreditoAction(ventaId: string, motivo: string) {
  const sesion = await requerirTenant('ADMIN') // solo el dueño emite NC

  const motivoLimpio = (motivo || '').trim()
  if (motivoLimpio.length < 3) return { error: 'Indica el motivo de la nota de crédito' }
  if (motivoLimpio.length > 300) return { error: 'El motivo es demasiado largo' }

  try {
    const venta = await prisma.venta.findFirst({
      where: { id: ventaId, tenantId: sesion.tenantId },
      include: { cliente: true, items: { include: { producto: true } }, factura: true, notaCredito: true },
    })
    if (!venta) return { error: 'Venta no encontrada' }
    if (!venta.factura || venta.factura.estado !== 'AUTORIZADA') {
      return { error: 'Solo se puede emitir nota de crédito sobre una factura AUTORIZADA' }
    }
    if (venta.notaCredito?.estado === 'AUTORIZADA') {
      return { error: 'Esta factura ya tiene una nota de crédito autorizada' }
    }
    if (!venta.cliente) return { error: 'La factura no tiene cliente asignado' }

    const emisor = await prisma.emisorSRI.findUnique({ where: { tenantId: sesion.tenantId } })
    if (!emisor) return { error: 'Emisor SRI no configurado' }
    const endpoints = emisor.ambiente === 1 ? ENDPOINTS_SRI.pruebas : ENDPOINTS_SRI.produccion

    // Número de la factura modificada (desde su clave de acceso)
    const caFactura = venta.factura.claveAcceso
    const numDocModificado = `${caFactura.substring(24, 27)}-${caFactura.substring(27, 30)}-${caFactura.substring(30, 39)}`
    const fechaFactura = format(venta.fecha, 'dd/MM/yyyy')

    // Secuencial de NC (independiente del de facturas): mayor histórico + 1
    const ncs = await prisma.notaCredito.findMany({ where: { tenantId: sesion.tenantId }, select: { claveAcceso: true } })
    let maxSeq = 0
    for (const n of ncs) {
      const s = parseInt(n.claveAcceso.substring(30, 39), 10)
      if (!isNaN(s) && s > maxSeq) maxSeq = s
    }
    const secuencial = String(maxSeq + 1).padStart(9, '0')

    const subtotal = Number(venta.subtotal) - Number(venta.descuento)
    const iva = Number(venta.iva)
    const total = Number(venta.total)

    const accessKey = generarClaveAcceso({
      fecha: format(new Date(), 'ddMMyyyy'),
      codDoc: '04',
      ruc: emisor.ruc,
      ambiente: String(emisor.ambiente),
      estab: emisor.codigoEstablecimiento,
      ptoEmi: emisor.codigoPuntoEmision,
      secuencial,
    })

    const xml = generarXmlNotaCredito({
      infoTributaria: {
        ambiente: String(emisor.ambiente), razonSocial: emisor.razonSocial,
        nombreComercial: emisor.nombreComercial || undefined, ruc: emisor.ruc,
        claveAcceso: accessKey, estab: emisor.codigoEstablecimiento, ptoEmi: emisor.codigoPuntoEmision,
        secuencial, dirMatriz: emisor.dirMatriz,
      },
      infoNotaCredito: {
        fechaEmision: format(new Date(), 'dd/MM/yyyy'),
        dirEstablecimiento: emisor.dirEstablecimiento,
        tipoIdentificacionComprador: mapTipoIdentificacion(venta.cliente.tipoIdentificacion),
        razonSocialComprador: venta.cliente.nombre,
        identificacionComprador: venta.cliente.identificacion,
        obligadoContabilidad: emisor.obligadoContabilidad ? 'SI' : 'NO',
        codDocModificado: '01',
        numDocModificado,
        fechaEmisionDocSustento: fechaFactura,
        totalSinImpuestos: subtotal.toFixed(2),
        valorModificacion: total.toFixed(2),
        baseImponible: subtotal.toFixed(2),
        valorImpuesto: iva.toFixed(2),
        motivo: motivoLimpio,
      },
      detalles: venta.items.map((it) => {
        const base = Number(it.subtotal)
        return {
          codigoInterno: it.productoId.slice(-6),
          descripcion: it.producto.nombre,
          cantidad: String(Number(it.cantidad)),
          precioUnitario: Number(it.precioUnitario).toFixed(4),
          precioTotalSinImpuesto: base.toFixed(2),
          baseImponible: base.toFixed(2),
          valorImpuesto: (base * (Number(it.producto.ivaPorcentaje) / 100)).toFixed(2),
        }
      }),
    })

    // Firmar
    let p12: any
    try { p12 = getP12FromLocalFile(emisor.rutaFirma) }
    catch { return { error: 'No se pudo leer la firma electrónica. Revísala en Configuración.' } }
    let signedXml: string
    try {
      // signCreditNoteXml firma apuntando al elemento <notaCredito> (no <factura>)
      signedXml = signCreditNoteXml(xml, Buffer.from(p12), { pkcs12Password: descifrarSecreto(emisor.passwordFirma) })
    } catch (err: any) {
      await registrarLog('ERROR', 'VENTAS', `Error firmando NC: ${err.message || err}`, undefined, sesion.tenantId)
      return { error: 'Error al firmar la nota de crédito. Verifica la contraseña de la firma.' }
    }

    // Recepción
    const rec: any = await documentReception(signedXml, endpoints.recepcion)
    const respRec = rec?.RespuestaRecepcionComprobante || rec
    if (respRec?.estado === 'DEVUELTA') {
      const comp = Array.isArray(respRec.comprobantes?.comprobante) ? respRec.comprobantes.comprobante[0] : respRec.comprobantes?.comprobante
      const msgs = comp?.mensajes?.mensaje || []
      const txt = Array.isArray(msgs) ? msgs.map((m: any) => `${m.mensaje}: ${m.informacionAdicional || ''}`).join(' | ') : `${msgs.mensaje || ''}`
      return { error: `SRI Recepción Devuelta: ${txt}` }
    }

    // Autorización
    await new Promise((r) => setTimeout(r, 2500))
    let aut: any = null
    for (let i = 1; i <= 5; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      try {
        const authResult: any = await documentAuthorization(accessKey, endpoints.autorizacion)
        const respAuth = authResult?.RespuestaAutorizacionComprobante || authResult
        const auts = respAuth?.autorizaciones?.autorizacion
        const temp = Array.isArray(auts) ? auts[0] : auts
        if (temp && temp.estado !== 'PENDIENTE') { aut = temp; break }
      } catch { /* reintentar */ }
    }

    if (!aut) {
      await prisma.notaCredito.upsert({
        where: { ventaId },
        update: { claveAcceso: accessKey, estado: 'PENDIENTE', motivo: motivoLimpio, valorModificacion: total, mensajeError: 'El SRI está demorando. Reintenta en unos minutos.' },
        create: { tenantId: sesion.tenantId, ventaId, claveAcceso: accessKey, estado: 'PENDIENTE', motivo: motivoLimpio, valorModificacion: total, mensajeError: 'El SRI está demorando.' },
      })
      revalidatePath('/ventas')
      return { error: 'El SRI está demorando en procesar la nota de crédito (quedó PENDIENTE). Reintenta en unos minutos.' }
    }

    if (aut.estado === 'AUTORIZADO' || aut.estado === 'AUTORIZADA') {
      // Guardar NC, marcar venta anulada y revertir stock (en transacción)
      await prisma.$transaction(async (tx) => {
        await tx.notaCredito.upsert({
          where: { ventaId },
          update: { claveAcceso: accessKey, numeroAutorizacion: aut.numeroAutorizacion, estado: 'AUTORIZADA', motivo: motivoLimpio, valorModificacion: total, xmlFirmado: aut.comprobante, fechaAutorizacion: new Date(aut.fechaAutorizacion), mensajeError: null },
          create: { tenantId: sesion.tenantId, ventaId, claveAcceso: accessKey, numeroAutorizacion: aut.numeroAutorizacion, estado: 'AUTORIZADA', motivo: motivoLimpio, valorModificacion: total, xmlFirmado: aut.comprobante, fechaAutorizacion: new Date(aut.fechaAutorizacion) },
        })
        await tx.venta.update({ where: { id: ventaId }, data: { estado: 'ANULADA' } })
        for (const it of venta.items) {
          const prod = await tx.producto.findUnique({ where: { id: it.productoId } })
          if (!prod) continue
          const previo = Number(prod.stock)
          const nuevo = previo + Number(it.cantidad)
          await tx.producto.update({ where: { id: it.productoId }, data: { stock: nuevo } })
          await tx.movimientoInventario.create({
            data: { tenantId: sesion.tenantId, productoId: it.productoId, tipo: 'AJUSTE', cantidad: Number(it.cantidad), stockPrevio: previo, stockNuevo: nuevo, motivo: `Nota de crédito ${numDocModificado}` },
          })
        }
      })
      await registrarLog('AUDIT', 'VENTAS', `Nota de crédito AUTORIZADA para factura ${numDocModificado} (${accessKey})`, undefined, sesion.tenantId)
      revalidatePath('/ventas'); revalidatePath('/productos'); revalidatePath('/dashboard')
      return { success: true, numeroAutorizacion: aut.numeroAutorizacion }
    }

    const msgs = aut.mensajes?.mensaje || []
    const txt = Array.isArray(msgs) ? msgs.map((m: any) => `${m.mensaje}: ${m.informacionAdicional || ''}`).join(' | ') : `${msgs.mensaje || ''}`
    await prisma.notaCredito.upsert({
      where: { ventaId },
      update: { claveAcceso: accessKey, estado: 'RECHAZADA', motivo: motivoLimpio, valorModificacion: total, mensajeError: txt },
      create: { tenantId: sesion.tenantId, ventaId, claveAcceso: accessKey, estado: 'RECHAZADA', motivo: motivoLimpio, valorModificacion: total, mensajeError: txt },
    })
    await registrarLog('ERROR', 'VENTAS', `Nota de crédito RECHAZADA: ${txt}`, undefined, sesion.tenantId)
    revalidatePath('/ventas')
    return { error: `SRI Autorización Rechazada: ${txt}` }
  } catch (error: any) {
    await registrarLog('ERROR', 'VENTAS', `Error emitiendo nota de crédito: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: error.message || 'Error al emitir la nota de crédito' }
  }
}
