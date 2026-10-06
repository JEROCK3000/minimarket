/**
 * Cálculo único de totales de una venta, usado al registrarla y al emitir su
 * factura / nota de crédito / RIDE / ticket, para que todos cuadren al centavo:
 *   - subtotal por línea redondeado a 2 decimales;
 *   - descuento global prorrateado por línea (la última absorbe el residuo);
 *   - IVA por línea sobre la base con descuento, con la tarifa de SU producto
 *     (0%, 15%, …), redondeado a 2 decimales;
 *   - totales = suma de líneas; desglose por tarifa para el SRI.
 */

export interface LineaVenta {
  cantidad: number
  precioUnitario: number
  ivaPorcentaje: number
  descuentoLinea?: number // descuento propio de la línea (promoción 2x1, % …); 0 si no hay
}

export interface LineaCalculada extends LineaVenta {
  subtotal: number  // cantidad × precio, antes de descuento
  descuento: number // descuento de la línea + su parte del descuento global
  base: number      // subtotal − descuento (base imponible)
  iva: number
}

export interface TotalesVenta {
  lineas: LineaCalculada[]
  subtotal: number  // suma de subtotales (antes de descuento)
  descuento: number // descuento GLOBAL (manual) aplicado
  descuentoLineas: number // suma de descuentos por línea (promociones)
  descuentoTotal: number  // global + líneas: el "Total descuento" de la factura
  base: number      // total sin impuestos
  iva: number
  total: number
  porTarifa: { tarifa: number; base: number; iva: number }[]
}

export const redondear2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function calcularVenta(lineas: LineaVenta[], descuentoGlobal = 0): TotalesVenta {
  const subtotales = lineas.map((l) => redondear2(l.cantidad * l.precioUnitario))
  const subtotal = redondear2(subtotales.reduce((a, b) => a + b, 0))
  // Descuento propio de cada línea (promociones), nunca mayor que la línea
  const descLinea = lineas.map((l, i) => redondear2(Math.min(Math.max(l.descuentoLinea ?? 0, 0), subtotales[i])))
  const netos = subtotales.map((st, i) => redondear2(st - descLinea[i]))
  const neto = redondear2(netos.reduce((a, b) => a + b, 0))
  // El descuento global (manual) se prorratea sobre lo que queda tras las promociones
  const descuento = redondear2(Math.min(Math.max(descuentoGlobal, 0), neto))

  let descuentoRestante = descuento
  const calculadas: LineaCalculada[] = lineas.map((l, i) => {
    const esUltima = i === lineas.length - 1
    const desc = esUltima
      ? descuentoRestante
      : neto > 0 ? redondear2((descuento * netos[i]) / neto) : 0
    descuentoRestante = redondear2(descuentoRestante - desc)
    const base = redondear2(netos[i] - desc)
    return { ...l, subtotal: subtotales[i], descuento: redondear2(descLinea[i] + desc), base, iva: redondear2((base * l.ivaPorcentaje) / 100) }
  })
  const descuentoLineas = redondear2(descLinea.reduce((a, b) => a + b, 0))

  const porTarifaMap = new Map<number, { base: number; iva: number }>()
  for (const l of calculadas) {
    const t = porTarifaMap.get(l.ivaPorcentaje) ?? { base: 0, iva: 0 }
    porTarifaMap.set(l.ivaPorcentaje, { base: redondear2(t.base + l.base), iva: redondear2(t.iva + l.iva) })
  }

  const base = redondear2(calculadas.reduce((a, l) => a + l.base, 0))
  const iva = redondear2(calculadas.reduce((a, l) => a + l.iva, 0))
  return {
    lineas: calculadas,
    subtotal,
    descuento,
    descuentoLineas,
    descuentoTotal: redondear2(descuento + descuentoLineas),
    base,
    iva,
    total: redondear2(base + iva),
    porTarifa: [...porTarifaMap.entries()].sort((a, b) => b[0] - a[0]).map(([tarifa, v]) => ({ tarifa, ...v })),
  }
}

/** Líneas para calcularVenta desde los ítems guardados de una venta (incluye el descuento de promoción). */
export function lineasDeItems(items: { cantidad: unknown; precioUnitario: unknown; descuento?: unknown; producto: { ivaPorcentaje: unknown } }[]): LineaVenta[] {
  return items.map((it) => ({
    cantidad: Number(it.cantidad), precioUnitario: Number(it.precioUnitario),
    ivaPorcentaje: Number(it.producto.ivaPorcentaje), descuentoLinea: Number(it.descuento ?? 0),
  }))
}
