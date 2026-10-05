/**
 * Presentaciones y precio por mayor (sin dependencias de servidor: lo usan el
 * POS y el servidor para calcular lo mismo).
 */
export interface Escala { desde: number; precioVenta: number }

/** Precio unitario (sin IVA) según la cantidad: la escala más alta alcanzada, o el precio base. */
export function precioUnitarioPara(precioBase: number, escalas: Escala[], cantidad: number): number {
  let precio = precioBase
  let mejor = 0
  for (const e of escalas) if (cantidad + 1e-9 >= e.desde && e.desde > mejor) { mejor = e.desde; precio = e.precioVenta }
  return precio
}

/** Descripción de una línea de venta en comprobantes: "Producto (Six-pack)". */
export function descripcionItem(nombreProducto: string, presentacion?: string | null) {
  return presentacion ? `${nombreProducto} (${presentacion})` : nombreProducto
}

/** Unidades del producto que mueve una línea (cantidad × factor). */
export const unidadesDe = (cantidad: unknown, factor: unknown) => Number(cantidad) * (Number(factor) || 1)
