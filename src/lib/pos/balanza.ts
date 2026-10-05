/**
 * Etiquetas de balanza (EAN-13 de "uso interno", prefijo 2x): la balanza
 * imprime  [prefijo][código PLU][valor][dígito verificador]  donde el valor es
 * el PESO (gramos) o el PRECIO total (centavos). Sin dependencias de servidor:
 * lo usa el POS en el navegador.
 */
export interface ConfigBalanza {
  activo: boolean
  prefijos: string[]      // ej. ["20","21"] o ["2"]
  digitosCodigo: number   // largo del PLU: 4–6 (lo más común: 5)
  modo: 'PESO' | 'PRECIO' // qué trae el valor
}
export const BALANZA_POR_DEFECTO: ConfigBalanza = { activo: false, prefijos: ['20'], digitosCodigo: 5, modo: 'PESO' }

export function normalizarConfigBalanza(v: unknown): ConfigBalanza {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<ConfigBalanza>
  const prefijos = Array.isArray(o.prefijos) ? o.prefijos.map(String).filter((p) => /^2\d?$/.test(p)).slice(0, 10) : BALANZA_POR_DEFECTO.prefijos
  const dig = Number(o.digitosCodigo)
  return {
    activo: o.activo === true,
    prefijos: prefijos.length ? prefijos : BALANZA_POR_DEFECTO.prefijos,
    digitosCodigo: dig >= 4 && dig <= 6 ? dig : BALANZA_POR_DEFECTO.digitosCodigo,
    modo: o.modo === 'PRECIO' ? 'PRECIO' : 'PESO',
  }
}

export function ean13Valido(codigo: string) {
  if (!/^\d{13}$/.test(codigo)) return false
  const d = codigo.split('').map(Number)
  const suma = d.slice(0, 12).reduce((s, n, i) => s + n * (i % 2 === 0 ? 1 : 3), 0)
  return (10 - (suma % 10)) % 10 === d[12]
}

/** Interpreta una etiqueta de balanza. null si no corresponde al formato configurado. */
export function leerEtiquetaBalanza(codigo: string, c: ConfigBalanza): { plu: string; peso?: number; precio?: number } | null {
  if (!c.activo || !ean13Valido(codigo)) return null
  const prefijo = c.prefijos.find((p) => codigo.startsWith(p))
  if (!prefijo) return null
  const plu = codigo.slice(prefijo.length, prefijo.length + c.digitosCodigo)
  const valorTxt = codigo.slice(prefijo.length + c.digitosCodigo, 12)
  if (valorTxt.length < 4) return null
  const valor = Number(valorTxt)
  return c.modo === 'PESO' ? { plu, peso: valor / 1000 } : { plu, precio: valor / 100 }
}

/** Compara códigos PLU ignorando ceros a la izquierda ("00123" = "123"). */
export const mismoPlu = (a: string | null | undefined, b: string) => !!a && a.replace(/^0+/, '') === b.replace(/^0+/, '')
