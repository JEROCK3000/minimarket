/**
 * Códigos del SRI (Ficha técnica de comprobantes electrónicos, tablas 16 y 24).
 */

/** Tarifa de IVA (%) → codigoPorcentaje del SRI. */
const CODIGO_PORCENTAJE_IVA: Record<number, string> = { 0: '0', 5: '5', 12: '2', 13: '10', 14: '3', 15: '4' }

export function codigoPorcentajeIva(tarifa: number): string {
  const codigo = CODIGO_PORCENTAJE_IVA[Number(tarifa)]
  if (!codigo) throw new Error(`Tarifa de IVA no soportada por el SRI: ${tarifa}%`)
  return codigo
}

/**
 * Forma de pago del POS → código SRI.
 * TARJETA se reporta como tarjeta de crédito (19): el POS no distingue débito/crédito.
 */
const FORMA_PAGO_SRI: Record<string, string> = {
  EFECTIVO: '01',       // sin utilización del sistema financiero
  TARJETA: '19',        // tarjeta de crédito
  TRANSFERENCIA: '20',  // otros con utilización del sistema financiero
}

export function formaPagoSri(formaPago: string): string {
  return FORMA_PAGO_SRI[formaPago] ?? '01'
}

export const NOMBRE_FORMA_PAGO_SRI: Record<string, string> = {
  '01': 'SIN UTILIZACION DEL SISTEMA FINANCIERO',
  '16': 'TARJETA DE DEBITO',
  '19': 'TARJETA DE CREDITO',
  '20': 'OTROS CON UTILIZACION DEL SISTEMA FINANCIERO',
}
