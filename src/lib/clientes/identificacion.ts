/**
 * Detección del tipo de una identificación ecuatoriana a partir del número.
 * El operador solo escribe lo que dicta el cliente (10 o 13 dígitos); aquí se
 * decide si es cédula / RUC de persona natural, RUC de sociedad o entidad
 * pública, o consumidor final. Sin dependencias: se usa en servidor y navegador.
 */

export const CONSUMIDOR_FINAL = '9999999999999'

export type ClaseIdentificacion = 'natural' | 'sociedad' | 'publica' | 'consumidor_final'

export interface IdentificacionDetectada {
  clase: ClaseIdentificacion
  /** 10 dígitos, solo para persona natural */
  cedula: string | null
  /** 13 dígitos; para persona natural es cedula + '001' */
  ruc: string | null
}

/** Devuelve null si no es una cédula ni un RUC con estructura válida (provincia, tercer dígito, sufijo). */
export function detectarIdentificacion(numero: string): IdentificacionDetectada | null {
  const c = numero.replace(/\D/g, '')
  if (c === CONSUMIDOR_FINAL) return { clase: 'consumidor_final', cedula: null, ruc: null }
  if (c.length !== 10 && c.length !== 13) return null
  const prov = parseInt(c.substring(0, 2), 10)
  if (!((prov >= 1 && prov <= 24) || prov === 30)) return null
  const tercero = parseInt(c.charAt(2), 10)
  if (tercero < 6) {
    if (c.length === 13 && !c.endsWith('001')) return null
    const cedula = c.substring(0, 10)
    return { clase: 'natural', cedula, ruc: `${cedula}001` }
  }
  if (c.length === 13 && (tercero === 6 || tercero === 9)) {
    return { clase: tercero === 9 ? 'sociedad' : 'publica', cedula: null, ruc: c }
  }
  return null
}
