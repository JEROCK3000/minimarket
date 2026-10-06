/**
 * Motor de promociones (sin dependencias de servidor: lo usan igual el POS para
 * mostrar y el servidor para registrar; el servidor es el que decide).
 *   NXM        → lleva N, paga M del producto (2x1, 3x2): unidades gratis = ⌊cant/N⌋·(N−M).
 *                Solo unidad suelta (no presentaciones) y cantidades enteras.
 *   PORCENTAJE → % de descuento sobre la línea: un producto, una categoría o toda la tienda.
 * Una línea recibe la MEJOR promoción aplicable (no se acumulan).
 */
export interface Promocion {
  id: string; nombre: string; tipo: 'NXM' | 'PORCENTAJE'
  productoId: string | null; categoriaId: string | null
  lleva: number | null; paga: number | null; porcentaje: number | null
  desde: string; hasta: string // YYYY-MM-DD (inclusive)
  dias: number[] | null        // 0 = domingo … 6 = sábado; null = todos
}
export interface LineaPromo { key: string; productoId: string; categoriaId: string | null; cantidad: number; precioUnitario: number; conPresentacion: boolean }

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const diaISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function promoVigente(p: Promocion, ahora = new Date()) {
  const hoy = diaISO(ahora)
  return p.desde <= hoy && hoy <= p.hasta && (!p.dias || p.dias.length === 0 || p.dias.includes(ahora.getDay()))
}

function descuentoDe(p: Promocion, l: LineaPromo): number {
  const subtotal = r2(l.cantidad * l.precioUnitario)
  if (p.tipo === 'NXM') {
    if (p.productoId !== l.productoId || l.conPresentacion || !Number.isInteger(l.cantidad)) return 0
    const n = p.lleva ?? 0, m = p.paga ?? 0
    if (!(n > m && m >= 1)) return 0
    return r2(Math.floor(l.cantidad / n) * (n - m) * l.precioUnitario)
  }
  const aplica = p.productoId ? p.productoId === l.productoId : p.categoriaId ? p.categoriaId === l.categoriaId : true
  if (!aplica || !p.porcentaje || p.porcentaje <= 0) return 0
  return r2((subtotal * Math.min(p.porcentaje, 100)) / 100)
}

/** Descuento y promoción ganadora por línea (solo las que tienen descuento). */
export function aplicarPromociones(lineas: LineaPromo[], promos: Promocion[], ahora = new Date()) {
  const vigentes = promos.filter((p) => promoVigente(p, ahora))
  const res = new Map<string, { descuento: number; promocion: string }>()
  for (const l of lineas) {
    let mejor: { descuento: number; promocion: string } | null = null
    for (const p of vigentes) {
      const d = descuentoDe(p, l)
      if (d > 0 && (!mejor || d > mejor.descuento)) mejor = { descuento: d, promocion: p.nombre }
    }
    if (mejor) res.set(l.key, mejor)
  }
  return res
}

/** Texto corto de la regla para listados ("2x1", "15% en Lácteos"…). */
export function describirPromo(p: Pick<Promocion, 'tipo' | 'lleva' | 'paga' | 'porcentaje'>) {
  return p.tipo === 'NXM' ? `${p.lleva}x${p.paga}` : `${p.porcentaje}% de descuento`
}
