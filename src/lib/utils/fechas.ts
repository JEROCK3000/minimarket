/**
 * Fechas "solo día" (YYYY-MM-DD) en la hora LOCAL (el servidor corre con
 * TZ=America/Guayaquil). Ojo: `new Date('2026-10-01')` se interpreta en UTC
 * (= 30/09 19:00 en Ecuador) y `toISOString().slice(0, 10)` devuelve el día UTC
 * (desde las 19:00 ya es "mañana"). Usar siempre estas funciones.
 */
export function hoyLocalISO(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Primer día del mes en curso (YYYY-MM-DD, hora local). */
export function inicioMesLocalISO(d: Date = new Date()): string {
  return hoyLocalISO(new Date(d.getFullYear(), d.getMonth(), 1))
}

/**
 * Convierte un día elegido por el usuario en el instante a guardar: si es hoy,
 * la hora actual (así cuenta en la caja abierta); si es otro día, ese día a
 * mediodía local (sin riesgo de saltar al día anterior/siguiente).
 */
export function fechaDeDia(dia: string | undefined | null): Date {
  if (!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia) || dia === hoyLocalISO()) return new Date()
  return new Date(`${dia}T12:00:00`)
}

/** Días desde hoy (local) hasta un día YYYY-MM-DD: 0 = hoy, negativo = ya pasó. */
export function diasHasta(dia: string, hoy: string = hoyLocalISO()): number {
  const [a, m, d] = dia.split('-').map(Number)
  const [ah, mh, dh] = hoy.split('-').map(Number)
  return Math.round((Date.UTC(a, m - 1, d) - Date.UTC(ah, mh - 1, dh)) / 86400000)
}

/** Vencimientos de compra: a partir de cuántos días se pide confirmar la fecha. */
export const DIAS_CONFIRMAR_VENCIMIENTO = 7
