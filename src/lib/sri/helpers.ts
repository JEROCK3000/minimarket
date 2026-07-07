import crypto from 'crypto'

// ─── Endpoints del SRI (Ecuador) ──────────────────────────────────────────────
export const ENDPOINTS_SRI = {
  pruebas: {
    recepcion: 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl',
    autorizacion: 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl',
  },
  produccion: {
    recepcion: 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl',
    autorizacion: 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl',
  },
}

export function mapTipoIdentificacion(tipo: string): '04' | '05' | '06' | '07' | '08' {
  if (tipo === 'RUC') return '04'
  if (tipo === 'CEDULA') return '05'
  if (tipo === 'PASAPORTE') return '06'
  if (tipo === 'CONSUMIDOR_FINAL') return '07'
  return '08'
}

// Código numérico de 8 dígitos: aleatoriedad CRIPTOGRÁFICA (parte de la clave de acceso)
function codigoNumerico(): string {
  return String(crypto.randomInt(10000000, 100000000))
}

function digitoVerificador(clave: string): number {
  let suma = 0
  let mult = 7
  for (let i = 0; i < clave.length; i++) {
    suma += parseInt(clave.charAt(i), 10) * mult
    mult = mult > 2 ? mult - 1 : 7
  }
  let res = 11 - (suma % 11)
  if (res === 10) res = 1
  if (res === 11) res = 0
  return res
}

/** Genera la clave de acceso de 49 dígitos del SRI. */
export function generarClaveAcceso(d: {
  fecha: string // DDMMYYYY
  codDoc: string
  ruc: string
  ambiente: string
  estab: string
  ptoEmi: string
  secuencial: string
}): string {
  let key = ''
  key += d.fecha + d.codDoc + d.ruc + d.ambiente + d.estab + d.ptoEmi + d.secuencial
  key += codigoNumerico()
  key += '1' // tipo de emisión normal
  key += String(digitoVerificador(key))
  return key
}

export function envolverFactura(invoiceData: any, accessKey: string) {
  return {
    factura: {
      '@xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#',
      '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
      '@id': 'comprobante',
      '@version': '1.1.0',
      infoTributaria: {
        ambiente: invoiceData.infoTributaria.ambiente,
        tipoEmision: invoiceData.infoTributaria.tipoEmision,
        razonSocial: invoiceData.infoTributaria.razonSocial,
        nombreComercial: invoiceData.infoTributaria.nombreComercial,
        ruc: invoiceData.infoTributaria.ruc,
        claveAcceso: accessKey,
        codDoc: invoiceData.infoTributaria.codDoc,
        estab: invoiceData.infoTributaria.estab,
        ptoEmi: invoiceData.infoTributaria.ptoEmi,
        secuencial: invoiceData.infoTributaria.secuencial,
        dirMatriz: invoiceData.infoTributaria.dirMatriz,
        agenteRetencion: invoiceData.infoTributaria.agenteRetencion,
      },
      infoFactura: invoiceData.infoFactura,
      detalles: invoiceData.detalles,
    },
  }
}
