import { z } from 'zod'

/**
 * Validadores reutilizables. Toda entrada externa (formularios, APIs) debe
 * validarse en el servidor con zod antes de tocar la base de datos (AGENTS.md §14.3).
 *
 * Uso típico en una server action:
 *
 *   const parsed = miSchema.safeParse(data)
 *   if (!parsed.success) throw new Error('Datos inválidos')
 *   // usa parsed.data (tipado y saneado)
 */

export const emailSchema = z.string().email('Correo inválido').max(180)
export const nombreSchema = z.string().trim().min(1, 'Requerido').max(200)
export const telefonoSchema = z.string().trim().max(20).optional().or(z.literal(''))

/** Cédula ecuatoriana (10 dígitos, dígito verificador). Útil para proyectos EC. */
export function cedulaEcuatorianaValida(cedula: string): boolean {
  const c = cedula.trim()
  if (!/^\d{10}$/.test(c)) return false
  const prov = parseInt(c.substring(0, 2), 10)
  if (!((prov >= 1 && prov <= 24) || prov === 30)) return false
  if (parseInt(c.charAt(2), 10) >= 6) return false
  const coef = [2, 1, 2, 1, 2, 1, 2, 1, 2]
  let suma = 0
  for (let i = 0; i < 9; i++) {
    let v = parseInt(c.charAt(i), 10) * coef[i]
    if (v >= 10) v -= 9
    suma += v
  }
  const residuo = suma % 10
  const digito = residuo === 0 ? 0 : 10 - residuo
  return digito === parseInt(c.charAt(9), 10)
}

/** RUC ecuatoriano (13 dígitos): personas naturales, sociedades y entidades públicas. */
export function rucEcuatorianoValido(ruc: string): boolean {
  const c = ruc.trim()
  if (!/^\d{13}$/.test(c)) return false
  const prov = parseInt(c.substring(0, 2), 10)
  if (!((prov >= 1 && prov <= 24) || prov === 30)) return false
  const tercero = parseInt(c.charAt(2), 10)

  // Persona natural: mismos primeros 10 dígitos válidos como cédula + termina en 001
  if (tercero < 6) return c.endsWith('001') && cedulaEcuatorianaValida(c.substring(0, 10))

  // Sociedad privada (9): módulo 11 con coeficientes 4..2, termina en 001
  if (tercero === 9) {
    if (!c.endsWith('001')) return false
    const coef = [4, 3, 2, 7, 6, 5, 4, 3, 2]
    let suma = 0
    for (let i = 0; i < 9; i++) suma += parseInt(c.charAt(i), 10) * coef[i]
    const res = suma % 11
    const dig = res === 0 ? 0 : 11 - res
    return dig === parseInt(c.charAt(9), 10)
  }

  // Entidad pública (6): módulo 11 con coeficientes 3..2 sobre 8 dígitos, termina en 0001
  if (tercero === 6) {
    if (!c.endsWith('0001')) return false
    const coef = [3, 2, 7, 6, 5, 4, 3, 2]
    let suma = 0
    for (let i = 0; i < 8; i++) suma += parseInt(c.charAt(i), 10) * coef[i]
    const res = suma % 11
    const dig = res === 0 ? 0 : 11 - res
    return dig === parseInt(c.charAt(8), 10)
  }
  return false
}

/** Valida una identificación según su tipo (para clientes SRI). Lanza Error si es inválida. */
export function validarIdentificacion(tipo: string, identificacion: string) {
  const c = identificacion.trim()
  if (tipo === 'CEDULA') {
    if (!cedulaEcuatorianaValida(c)) throw new Error('La cédula ingresada es inválida')
  } else if (tipo === 'RUC') {
    if (!rucEcuatorianoValido(c)) throw new Error('El RUC ingresado es inválido')
  } else if (tipo === 'CONSUMIDOR_FINAL') {
    if (c !== '9999999999999') throw new Error('Consumidor Final debe tener identificación 9999999999999')
  } else if (tipo === 'PASAPORTE') {
    if (c.length < 5) throw new Error('El pasaporte debe tener al menos 5 caracteres')
  } else {
    throw new Error('Tipo de identificación no válido')
  }
}
