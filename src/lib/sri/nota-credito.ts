/**
 * Generación del XML de Nota de Crédito (SRI Ecuador, codDoc 04, v1.1.0).
 * open-factura no genera notas de crédito, así que se construye el XML aquí.
 * La firma (ec-sri-invoice-signer) y el envío (documentReception/Authorization)
 * se reutilizan igual que para la factura.
 */

function esc(v: string | number): string {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export interface NotaCreditoInput {
  infoTributaria: {
    ambiente: string; razonSocial: string; nombreComercial?: string; ruc: string
    claveAcceso: string; estab: string; ptoEmi: string; secuencial: string; dirMatriz: string
  }
  infoNotaCredito: {
    fechaEmision: string // dd/mm/yyyy
    dirEstablecimiento: string
    tipoIdentificacionComprador: string
    razonSocialComprador: string
    identificacionComprador: string
    obligadoContabilidad: 'SI' | 'NO'
    codDocModificado: string // '01' factura
    numDocModificado: string // 001-001-000000001
    fechaEmisionDocSustento: string // dd/mm/yyyy
    totalSinImpuestos: string
    valorModificacion: string
    baseImponible: string
    valorImpuesto: string
    motivo: string
  }
  detalles: {
    codigoInterno: string; descripcion: string; cantidad: string
    precioUnitario: string; precioTotalSinImpuesto: string
    baseImponible: string; valorImpuesto: string
  }[]
}

/**
 * Construye el XML de la nota de crédito, listo para firmar.
 * IMPORTANTE: se genera COMPACTO (sin saltos de línea ni indentación entre
 * etiquetas). El whitespace entre elementos altera el digest de la firma
 * XAdES y el SRI lo rechaza con "FIRMA INVÁLIDA".
 */
export function generarXmlNotaCredito(d: NotaCreditoInput): string {
  const it = d.infoTributaria
  const inc = d.infoNotaCredito

  const detalles = d.detalles.map((det) =>
    `<detalle>` +
    `<codigoInterno>${esc(det.codigoInterno)}</codigoInterno>` +
    `<descripcion>${esc(det.descripcion)}</descripcion>` +
    `<cantidad>${esc(det.cantidad)}</cantidad>` +
    `<precioUnitario>${esc(det.precioUnitario)}</precioUnitario>` +
    `<descuento>0.00</descuento>` +
    `<precioTotalSinImpuesto>${esc(det.precioTotalSinImpuesto)}</precioTotalSinImpuesto>` +
    `<impuestos>` +
    `<impuesto>` +
    `<codigo>2</codigo>` +
    `<codigoPorcentaje>4</codigoPorcentaje>` +
    `<tarifa>15</tarifa>` +
    `<baseImponible>${esc(det.baseImponible)}</baseImponible>` +
    `<valor>${esc(det.valorImpuesto)}</valor>` +
    `</impuesto>` +
    `</impuestos>` +
    `</detalle>`
  ).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<notaCredito id="comprobante" version="1.1.0">` +
    `<infoTributaria>` +
    `<ambiente>${esc(it.ambiente)}</ambiente>` +
    `<tipoEmision>1</tipoEmision>` +
    `<razonSocial>${esc(it.razonSocial)}</razonSocial>` +
    `<nombreComercial>${esc(it.nombreComercial || it.razonSocial)}</nombreComercial>` +
    `<ruc>${esc(it.ruc)}</ruc>` +
    `<claveAcceso>${esc(it.claveAcceso)}</claveAcceso>` +
    `<codDoc>04</codDoc>` +
    `<estab>${esc(it.estab)}</estab>` +
    `<ptoEmi>${esc(it.ptoEmi)}</ptoEmi>` +
    `<secuencial>${esc(it.secuencial)}</secuencial>` +
    `<dirMatriz>${esc(it.dirMatriz)}</dirMatriz>` +
    `</infoTributaria>` +
    `<infoNotaCredito>` +
    `<fechaEmision>${esc(inc.fechaEmision)}</fechaEmision>` +
    `<dirEstablecimiento>${esc(inc.dirEstablecimiento)}</dirEstablecimiento>` +
    `<tipoIdentificacionComprador>${esc(inc.tipoIdentificacionComprador)}</tipoIdentificacionComprador>` +
    `<razonSocialComprador>${esc(inc.razonSocialComprador)}</razonSocialComprador>` +
    `<identificacionComprador>${esc(inc.identificacionComprador)}</identificacionComprador>` +
    `<obligadoContabilidad>${esc(inc.obligadoContabilidad)}</obligadoContabilidad>` +
    `<codDocModificado>${esc(inc.codDocModificado)}</codDocModificado>` +
    `<numDocModificado>${esc(inc.numDocModificado)}</numDocModificado>` +
    `<fechaEmisionDocSustento>${esc(inc.fechaEmisionDocSustento)}</fechaEmisionDocSustento>` +
    `<totalSinImpuestos>${esc(inc.totalSinImpuestos)}</totalSinImpuestos>` +
    `<valorModificacion>${esc(inc.valorModificacion)}</valorModificacion>` +
    `<moneda>DOLAR</moneda>` +
    `<totalConImpuestos>` +
    `<totalImpuesto>` +
    `<codigo>2</codigo>` +
    `<codigoPorcentaje>4</codigoPorcentaje>` +
    `<baseImponible>${esc(inc.baseImponible)}</baseImponible>` +
    `<valor>${esc(inc.valorImpuesto)}</valor>` +
    `</totalImpuesto>` +
    `</totalConImpuestos>` +
    `<motivo>${esc(inc.motivo)}</motivo>` +
    `</infoNotaCredito>` +
    `<detalles>${detalles}</detalles>` +
    `</notaCredito>`
}
