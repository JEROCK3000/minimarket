/** Carga de promociones desde la BD (solo servidor; recibe tenantId, no es server action). */
import { prisma } from '@/lib/db/prisma'
import { hoyLocalISO } from '@/lib/utils/fechas'
import type { Promocion } from './promociones'

/** Promociones activas cuya vigencia incluye hoy (los días de la semana los filtra el motor). */
export async function promocionesDeHoy(tenantId: string): Promise<Promocion[]> {
  const hoy = new Date(`${hoyLocalISO()}T00:00:00Z`) // columnas DATE: comparar a medianoche UTC
  const filas = await prisma.promocion.findMany({ where: { tenantId, activa: true, desde: { lte: hoy }, hasta: { gte: hoy } } })
  return filas.map(aPromocion)
}

export function aPromocion(p: { id: string; nombre: string; tipo: string; productoId: string | null; categoriaId: string | null; lleva: number | null; paga: number | null; porcentaje: unknown; desde: Date; hasta: Date; dias: string | null }): Promocion {
  return {
    id: p.id, nombre: p.nombre, tipo: p.tipo === 'NXM' ? 'NXM' : 'PORCENTAJE',
    productoId: p.productoId, categoriaId: p.categoriaId, lleva: p.lleva, paga: p.paga,
    porcentaje: p.porcentaje != null ? Number(p.porcentaje) : null,
    desde: p.desde.toISOString().slice(0, 10), hasta: p.hasta.toISOString().slice(0, 10),
    dias: p.dias ? p.dias.split(',').map(Number).filter((n) => n >= 0 && n <= 6) : null,
  }
}
