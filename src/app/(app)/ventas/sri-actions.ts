'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { descifrarSecreto } from '@/lib/security/crypto'
import { revalidatePath } from 'next/cache'
import { generateInvoiceXml, getP12FromLocalFile, documentReception, documentAuthorization } from 'open-factura'
import { signInvoiceXml } from 'ec-sri-invoice-signer'
import { format } from 'date-fns'
import { ENDPOINTS_SRI, mapTipoIdentificacion, generarClaveAcceso, envolverFactura } from '@/lib/sri/helpers'

/**
 * Emite la factura electrónica de una venta al SRI.
 * Portado y adaptado de GABLIMADOS: aquí la firma se descifra (retrocompatible),
 * el emisor es por tenant y el comprobante se genera desde una Venta.
 */
export async function emitirFacturaVentaAction(ventaId: string) {
  const sesion = await requerirTenant()

  try {
    const venta = await prisma.venta.findFirst({
      where: { id: ventaId, tenantId: sesion.tenantId },
      include: { cliente: true, items: { include: { producto: true } }, factura: true },
    })
    if (!venta) throw new Error('Venta no encontrada')
    if (!venta.cliente) throw new Error('La venta no tiene cliente asignado para facturar')
    if (venta.factura?.estado === 'AUTORIZADA') throw new Error('Esta venta ya tiene factura autorizada')

    const emisor = await prisma.emisorSRI.findUnique({ where: { tenantId: sesion.tenantId } })
    if (!emisor) throw new Error('Configura primero los datos del emisor en Configuración > Facturación SRI')

    const endpoints = emisor.ambiente === 1 ? ENDPOINTS_SRI.pruebas : ENDPOINTS_SRI.produccion

    // Secuencial: mayor entre el configurado y el histórico de claves de acceso
    const facturas = await prisma.facturaSRI.findMany({
      where: { tenantId: sesion.tenantId },
      select: { claveAcceso: true },
    })
    let maxSeq = emisor.secuencialFactura - 1
    for (const f of facturas) {
      const s = parseInt(f.claveAcceso.substring(30, 39), 10)
      if (!isNaN(s) && s > maxSeq) maxSeq = s
    }
    const secuencial = String(maxSeq + 1).padStart(9, '0')

    const subtotalNeto = Number(venta.subtotal) - Number(venta.descuento)

    const invoiceInput = {
      infoTributaria: {
        ambiente: String(emisor.ambiente) as '1' | '2',
        tipoEmision: '1',
        razonSocial: emisor.razonSocial,
        nombreComercial: emisor.nombreComercial || emisor.razonSocial,
        ruc: emisor.ruc,
        codDoc: '01' as const,
        estab: emisor.codigoEstablecimiento,
        ptoEmi: emisor.codigoPuntoEmision,
        secuencial,
        dirMatriz: emisor.dirMatriz,
        agenteRetencion: emisor.agenteRetencion || undefined,
      },
      infoFactura: {
        fechaEmision: format(new Date(), 'dd/MM/yyyy'),
        dirEstablecimiento: emisor.dirEstablecimiento,
        contribuyenteEspecial: emisor.contribuyenteEspecial || undefined,
        obligadoContabilidad: emisor.obligadoContabilidad ? ('SI' as const) : ('NO' as const),
        tipoIdentificacionComprador: mapTipoIdentificacion(venta.cliente.tipoIdentificacion),
        razonSocialComprador: venta.cliente.nombre,
        identificacionComprador: venta.cliente.identificacion,
        direccionComprador: venta.cliente.direccion || emisor.dirEstablecimiento,
        totalSinImpuestos: subtotalNeto.toFixed(2),
        totalDescuento: Number(venta.descuento).toFixed(2),
        totalConImpuestos: {
          totalImpuesto: [{
            codigo: '2' as const,
            codigoPorcentaje: '4' as any,
            descuentoAdicional: '0.00',
            baseImponible: subtotalNeto.toFixed(2),
            tarifa: '15.00',
            valor: Number(venta.iva).toFixed(2),
          }],
        },
        importeTotal: Number(venta.total).toFixed(2),
        moneda: 'DOLAR',
        pagos: { pago: [{ formaPago: '01', total: Number(venta.total).toFixed(2), plazo: '0', unidadTiempo: 'dias' }] },
      },
      detalles: {
        detalle: venta.items.map((item) => {
          const sub = Number(item.subtotal)
          const factorDesc = Number(venta.subtotal) > 0 ? Number(venta.descuento) / Number(venta.subtotal) : 0
          const descItem = sub * factorDesc
          const base = sub - descItem
          return {
            codigoPrincipal: item.productoId.substring(0, 25),
            descripcion: item.producto.nombre,
            cantidad: String(item.cantidad),
            precioUnitario: Number(item.precioUnitario).toFixed(4),
            descuento: descItem.toFixed(2),
            precioTotalSinImpuesto: base.toFixed(2),
            impuestos: {
              impuesto: [{
                codigo: '2', codigoPorcentaje: '4', tarifa: '15',
                baseImponible: base.toFixed(2), valor: (base * 0.15).toFixed(2),
              }],
            },
          }
        }),
      },
    }

    const accessKey = generarClaveAcceso({
      fecha: format(new Date(), 'ddMMyyyy'),
      codDoc: '01',
      ruc: emisor.ruc,
      ambiente: String(emisor.ambiente),
      estab: emisor.codigoEstablecimiento,
      ptoEmi: emisor.codigoPuntoEmision,
      secuencial,
    })

    const invoice = envolverFactura(invoiceInput, accessKey)
    const xml = generateInvoiceXml(invoice)
    const cleanedXml = xml
      .replace(' xmlns:ds="http://www.w3.org/2000/09/xmldsig#"', '')
      .replace(' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"', '')

    // Firmar (contraseña descifrada, retrocompatible con texto plano legado)
    let p12Buffer: any
    try {
      p12Buffer = getP12FromLocalFile(emisor.rutaFirma)
    } catch (err: any) {
      await registrarLog('ERROR', 'VENTAS', `No se pudo leer firma: ${err.message || err}`, undefined, sesion.tenantId)
      throw new Error('No se pudo leer el archivo de firma. Vuelve a subirlo en Configuración.')
    }
    let signedXml: string
    try {
      signedXml = signInvoiceXml(cleanedXml, Buffer.from(p12Buffer), { pkcs12Password: descifrarSecreto(emisor.passwordFirma) })
    } catch (err: any) {
      await registrarLog('ERROR', 'VENTAS', `Error al firmar: ${err.message || err}`, undefined, sesion.tenantId)
      throw new Error('Error al firmar el XML. Verifica la contraseña de la firma electrónica.')
    }

    // Recepción
    const receptionResult: any = await documentReception(signedXml, endpoints.recepcion)
    const respRec = receptionResult?.RespuestaRecepcionComprobante || receptionResult
    if (respRec?.estado === 'DEVUELTA') {
      const comp = Array.isArray(respRec.comprobantes?.comprobante) ? respRec.comprobantes.comprobante[0] : respRec.comprobantes?.comprobante
      const msgs = comp?.mensajes?.mensaje || []
      const txt = Array.isArray(msgs) ? msgs.map((m: any) => `${m.mensaje}: ${m.informacionAdicional || ''}`).join(' | ') : `${msgs.mensaje || ''}`
      throw new Error(`SRI Recepción Devuelta: ${txt}`)
    }

    // Autorización (hasta 5 intentos)
    await new Promise((r) => setTimeout(r, 2500))
    let autorizacion: any = null
    for (let i = 1; i <= 5; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      try {
        const authResult: any = await documentAuthorization(accessKey, endpoints.autorizacion)
        const respAuth = authResult?.RespuestaAutorizacionComprobante || authResult
        const auts = respAuth?.autorizaciones?.autorizacion
        const temp = Array.isArray(auts) ? auts[0] : auts
        if (temp && temp.estado !== 'PENDIENTE') { autorizacion = temp; break }
      } catch (err: any) {
        await registrarLog('WARN', 'VENTAS', `Intento ${i} autorización falló: ${err.message || err}`, undefined, sesion.tenantId)
      }
    }

    if (!autorizacion) {
      await prisma.facturaSRI.upsert({
        where: { ventaId },
        update: { claveAcceso: accessKey, estado: 'PENDIENTE', mensajeError: 'El SRI está demorando. Vuelve a consultar en unos minutos.' },
        create: { tenantId: sesion.tenantId, ventaId, claveAcceso: accessKey, estado: 'PENDIENTE', mensajeError: 'El SRI está demorando.' },
      })
      revalidatePath('/ventas')
      throw new Error('El SRI está demorando en procesar el comprobante (quedó PENDIENTE). Reintenta en unos minutos.')
    }

    if (autorizacion.estado === 'AUTORIZADO' || autorizacion.estado === 'AUTORIZADA') {
      await prisma.facturaSRI.upsert({
        where: { ventaId },
        update: {
          claveAcceso: accessKey, numeroAutorizacion: autorizacion.numeroAutorizacion, estado: 'AUTORIZADA',
          xmlFirmado: autorizacion.comprobante, fechaAutorizacion: new Date(autorizacion.fechaAutorizacion), mensajeError: null,
        },
        create: {
          tenantId: sesion.tenantId, ventaId, claveAcceso: accessKey, numeroAutorizacion: autorizacion.numeroAutorizacion,
          estado: 'AUTORIZADA', xmlFirmado: autorizacion.comprobante, fechaAutorizacion: new Date(autorizacion.fechaAutorizacion),
        },
      })
      await registrarLog('AUDIT', 'VENTAS', `Factura AUTORIZADA venta ${venta.numero} (${accessKey})`, undefined, sesion.tenantId)
      revalidatePath('/ventas')
      return { success: true, accessKey, numeroAutorizacion: autorizacion.numeroAutorizacion }
    }

    const msgs = autorizacion.mensajes?.mensaje || []
    const txt = Array.isArray(msgs) ? msgs.map((m: any) => `${m.mensaje}: ${m.informacionAdicional || ''}`).join(' | ') : `${msgs.mensaje || ''}`
    await prisma.facturaSRI.upsert({
      where: { ventaId },
      update: { claveAcceso: accessKey, estado: 'RECHAZADA', mensajeError: txt },
      create: { tenantId: sesion.tenantId, ventaId, claveAcceso: accessKey, estado: 'RECHAZADA', mensajeError: txt },
    })
    await registrarLog('ERROR', 'VENTAS', `Factura RECHAZADA venta ${venta.numero}: ${txt}`, undefined, sesion.tenantId)
    revalidatePath('/ventas')
    throw new Error(`SRI Autorización Rechazada: ${txt}`)
  } catch (error: any) {
    await registrarLog('ERROR', 'VENTAS', `Error emitiendo factura: ${error.message || error}`, undefined, sesion.tenantId)
    throw new Error(error.message || 'Error al emitir la factura')
  }
}
