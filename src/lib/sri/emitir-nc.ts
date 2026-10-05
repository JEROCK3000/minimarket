import { getP12FromLocalFile, documentReception, documentAuthorization } from 'open-factura'
import { signCreditNoteXml } from 'ec-sri-invoice-signer'
import { format } from 'date-fns'
import { prisma } from '@/lib/db/prisma'
import { descifrarSecreto } from '@/lib/security/crypto'
import { registrarLog } from '@/lib/logs/logger'
import { ENDPOINTS_SRI, mapTipoIdentificacion, generarClaveAcceso } from './helpers'
import { generarXmlNotaCredito } from './nota-credito'
import { codigoPorcentajeIva } from './impuestos'
import { camposAdicionalesEmision } from './info-adicional'

/**
 * Firma, envía y espera la autorización de una Nota de Crédito (total o
 * parcial) ante el SRI. Solo servidor (recibe tenantId: no es server action).
 * Código movido sin cambios desde ventas/nc-actions.ts para compartirlo.
 */
export interface DetalleNC {
  codigoInterno: string; descripcion: string; cantidad: number; precioUnitario: number
  descuento: number; base: number; ivaPorcentaje: number; iva: number
}
export interface DatosNC {
  tenantId: string
  claveFactura: string // clave de acceso de la factura modificada
  fechaFactura: Date
  comprador: { tipoIdentificacion: string; identificacion: string; razonSocial: string }
  motivo: string
  base: number
  total: number
  porTarifa: { tarifa: number; base: number; iva: number }[]
  detalles: DetalleNC[]
}
export type ResultadoNC =
  | { estado: 'AUTORIZADA'; claveAcceso: string; numeroAutorizacion: string; xml: string; fechaAutorizacion: Date; numDocModificado: string }
  | { estado: 'PENDIENTE'; claveAcceso: string; numDocModificado: string }
  | { estado: 'RECHAZADA'; claveAcceso: string; numDocModificado: string; mensaje: string }
  | { error: string }

export const numeroDesdeClave = (ca: string) => `${ca.substring(24, 27)}-${ca.substring(27, 30)}-${ca.substring(30, 39)}`

export async function emitirNotaCreditoSri(d: DatosNC): Promise<ResultadoNC> {
  const emisor = await prisma.emisorSRI.findUnique({ where: { tenantId: d.tenantId } })
  if (!emisor) return { error: 'Emisor SRI no configurado' }
  const endpoints = emisor.ambiente === 1 ? ENDPOINTS_SRI.pruebas : ENDPOINTS_SRI.produccion
  const numDocModificado = numeroDesdeClave(d.claveFactura)

  // Secuencial de NC (independiente del de facturas): mayor histórico + 1
  const ncs = await prisma.notaCredito.findMany({ where: { tenantId: d.tenantId }, select: { claveAcceso: true } })
  let maxSeq = 0
  for (const n of ncs) {
    const s = parseInt(n.claveAcceso.substring(30, 39), 10)
    if (!isNaN(s) && s > maxSeq) maxSeq = s
  }
  const secuencial = String(maxSeq + 1).padStart(9, '0')

  const accessKey = generarClaveAcceso({
    fecha: format(new Date(), 'ddMMyyyy'), codDoc: '04', ruc: emisor.ruc, ambiente: String(emisor.ambiente),
    estab: emisor.codigoEstablecimiento, ptoEmi: emisor.codigoPuntoEmision, secuencial,
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
      tipoIdentificacionComprador: mapTipoIdentificacion(d.comprador.tipoIdentificacion),
      razonSocialComprador: d.comprador.razonSocial,
      identificacionComprador: d.comprador.identificacion,
      obligadoContabilidad: emisor.obligadoContabilidad ? 'SI' : 'NO',
      codDocModificado: '01',
      numDocModificado,
      fechaEmisionDocSustento: format(d.fechaFactura, 'dd/MM/yyyy'),
      totalSinImpuestos: d.base.toFixed(2),
      valorModificacion: d.total.toFixed(2),
      impuestos: d.porTarifa.map((t) => ({ codigoPorcentaje: codigoPorcentajeIva(t.tarifa), baseImponible: t.base.toFixed(2), valor: t.iva.toFixed(2) })),
      motivo: d.motivo,
    },
    detalles: d.detalles.map((l) => ({
      codigoInterno: l.codigoInterno, descripcion: l.descripcion, cantidad: String(l.cantidad),
      precioUnitario: l.precioUnitario.toFixed(4), descuento: l.descuento.toFixed(2), precioTotalSinImpuesto: l.base.toFixed(2),
      codigoPorcentaje: codigoPorcentajeIva(l.ivaPorcentaje), tarifa: String(l.ivaPorcentaje),
      baseImponible: l.base.toFixed(2), valorImpuesto: l.iva.toFixed(2),
    })),
    // "RUC Proveedor" (Res. SRI NAC-DGERCGC26-00000027)
    infoAdicional: await camposAdicionalesEmision(),
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
    await registrarLog('ERROR', 'VENTAS', `Error firmando NC: ${err.message || err}`, undefined, d.tenantId)
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
  const aut = await consultarAutorizacionNC(accessKey, endpoints.autorizacion, 5)
  if (!aut) return { estado: 'PENDIENTE', claveAcceso: accessKey, numDocModificado }
  if (aut.estado === 'AUTORIZADO' || aut.estado === 'AUTORIZADA') {
    return { estado: 'AUTORIZADA', claveAcceso: accessKey, numeroAutorizacion: aut.numeroAutorizacion, xml: aut.comprobante, fechaAutorizacion: new Date(aut.fechaAutorizacion), numDocModificado }
  }
  const msgs = aut.mensajes?.mensaje || []
  const txt = Array.isArray(msgs) ? msgs.map((m: any) => `${m.mensaje}: ${m.informacionAdicional || ''}`).join(' | ') : `${msgs.mensaje || ''}`
  return { estado: 'RECHAZADA', claveAcceso: accessKey, numDocModificado, mensaje: txt }
}

/** Consulta la autorización de una NC ya enviada (reintentos cada 2 s). null = sigue sin respuesta. */
export async function consultarAutorizacionNC(claveAcceso: string, endpoint: string, intentos = 1): Promise<any | null> {
  for (let i = 1; i <= intentos; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    try {
      const authResult: any = await documentAuthorization(claveAcceso, endpoint)
      const respAuth = authResult?.RespuestaAutorizacionComprobante || authResult
      const auts = respAuth?.autorizaciones?.autorizacion
      const temp = Array.isArray(auts) ? auts[0] : auts
      if (temp && temp.estado !== 'PENDIENTE') return temp
    } catch { /* reintentar */ }
  }
  return null
}
