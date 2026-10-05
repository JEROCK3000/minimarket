/**
 * Clasificación de pérdidas de inventario (mermas). Se guarda en
 * MovimientoInventario.categoria y alimenta el reporte "Mermas y pérdidas".
 * Sin dependencias de servidor: se usa también en el navegador.
 */
export const CATEGORIAS_MERMA = {
  VENCIDO: 'Vencido',
  DANADO: 'Dañado / roto',
  CONSUMO: 'Consumo interno',
  ROBO: 'Robo / extravío',
  FALTANTE: 'Faltante en conteo',
  OTRO: 'Otro',
} as const
export type CategoriaMerma = keyof typeof CATEGORIAS_MERMA

/** Las que el usuario elige a mano (FALTANTE la asigna el conteo/toma de inventario). */
export const CATEGORIAS_MERMA_MANUAL: CategoriaMerma[] = ['VENCIDO', 'DANADO', 'CONSUMO', 'ROBO', 'OTRO']
export const esCategoriaMerma = (v: string): v is CategoriaMerma => v in CATEGORIAS_MERMA
