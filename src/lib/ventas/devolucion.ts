import { calcularVenta, redondear2, type LineaVenta } from './totales'

/**
 * Cálculo de una devolución parcial sobre una venta, consistente al centavo con
 * la factura original (calcularVenta): cada línea devuelta toma su parte
 * proporcional del descuento global y su IVA. Si se devuelve TODO lo que queda
 * de una línea, se usa el remanente exacto (línea original − ya devuelto), así
 * la suma de todas las devoluciones nunca supera la factura por redondeos.
 */
export interface LineaOriginal extends LineaVenta { id: string }
export interface YaDevuelto { cantidad: number; descuento: number; base: number; iva: number }
export interface LineaDevuelta {
  ventaItemId: string
  cantidad: number
  precioUnitario: number
  ivaPorcentaje: number
  subtotal: number
  descuento: number
  base: number
  iva: number
}
export interface TotalesDevolucion {
  lineas: LineaDevuelta[]
  subtotal: number
  descuento: number
  base: number
  iva: number
  total: number
  porTarifa: { tarifa: number; base: number; iva: number }[]
}

const EPS = 0.0005

export function calcularDevolucion(
  originales: LineaOriginal[],
  descuentoGlobal: number,
  devuelto: Map<string, YaDevuelto>,
  solicitado: Map<string, number>, // ventaItemId → cantidad a devolver
): TotalesDevolucion {
  const calc = calcularVenta(originales, descuentoGlobal)
  const lineas: LineaDevuelta[] = []
  originales.forEach((o, i) => {
    const q = solicitado.get(o.id) ?? 0
    if (q <= EPS) return
    const orig = calc.lineas[i]
    const ya = devuelto.get(o.id) ?? { cantidad: 0, descuento: 0, base: 0, iva: 0 }
    const restante = o.cantidad - ya.cantidad
    if (q > restante + EPS) throw new Error(`Cantidad a devolver mayor a la disponible (${restante})`)
    let subtotal: number, descuento: number, base: number, iva: number
    if (Math.abs(q - restante) <= EPS) {
      // Cierra la línea: remanente exacto
      descuento = redondear2(orig.descuento - ya.descuento)
      base = redondear2(orig.base - ya.base)
      iva = redondear2(orig.iva - ya.iva)
      subtotal = redondear2(base + descuento)
    } else {
      subtotal = redondear2(q * o.precioUnitario)
      descuento = o.cantidad > 0 ? redondear2((orig.descuento * q) / o.cantidad) : 0
      base = redondear2(subtotal - descuento)
      iva = redondear2((base * o.ivaPorcentaje) / 100)
    }
    lineas.push({ ventaItemId: o.id, cantidad: q, precioUnitario: o.precioUnitario, ivaPorcentaje: o.ivaPorcentaje, subtotal, descuento, base, iva })
  })
  const porTarifaMap = new Map<number, { base: number; iva: number }>()
  for (const l of lineas) {
    const t = porTarifaMap.get(l.ivaPorcentaje) ?? { base: 0, iva: 0 }
    porTarifaMap.set(l.ivaPorcentaje, { base: redondear2(t.base + l.base), iva: redondear2(t.iva + l.iva) })
  }
  const suma = (k: 'subtotal' | 'descuento' | 'base' | 'iva') => redondear2(lineas.reduce((a, l) => a + l[k], 0))
  const base = suma('base'), iva = suma('iva')
  return {
    lineas, subtotal: suma('subtotal'), descuento: suma('descuento'), base, iva, total: redondear2(base + iva),
    porTarifa: [...porTarifaMap.entries()].map(([tarifa, v]) => ({ tarifa, ...v })),
  }
}
