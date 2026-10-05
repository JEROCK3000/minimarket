import { documentAuthorization } from 'open-factura'
import { ENDPOINTS_SRI } from '@/lib/sri/helpers'
import { ErrorXmlFactura } from './xml-factura'

/**
 * Descarga del SRI el XML AUTORIZADO de una factura a partir de su clave de
 * acceso (49 dígitos; viene en el RIDE como código de barras). El ambiente
 * (pruebas/producción) se toma de la propia clave (posición 24).
 */
export async function descargarFacturaPorClave(clave: string): Promise<string> {
  if (!/^\d{49}$/.test(clave)) throw new ErrorXmlFactura('La clave de acceso debe tener 49 dígitos')
  if (clave.slice(8, 10) !== '01') throw new ErrorXmlFactura('La clave de acceso no corresponde a una factura')
  const endpoint = clave[23] === '1' ? ENDPOINTS_SRI.pruebas.autorizacion : ENDPOINTS_SRI.produccion.autorizacion
  let resp: any
  try {
    resp = await documentAuthorization(clave, endpoint)
  } catch {
    throw new ErrorXmlFactura('No se pudo consultar el SRI en este momento. Intenta de nuevo o sube el archivo XML.')
  }
  const r = resp?.RespuestaAutorizacionComprobante ?? resp
  const lista = r?.autorizaciones?.autorizacion
  const auts: any[] = Array.isArray(lista) ? lista : lista ? [lista] : []
  const aut = auts.find((a) => a?.estado === 'AUTORIZADO' || a?.estado === 'AUTORIZADA')
  if (!aut?.comprobante) {
    throw new ErrorXmlFactura(auts.length ? 'La factura no está autorizada por el SRI' : 'El SRI no tiene una factura con esa clave de acceso')
  }
  return String(aut.comprobante)
}
