'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { moverStock } from '@/lib/inventario/movimientos'
import { CATEGORIAS_MERMA_MANUAL, CATEGORIAS_MERMA, type CategoriaMerma } from '@/lib/inventario/mermas'
import { bloqueoPorSuscripcion, limiteDelPlan } from '@/lib/saas/suscripcion'

export interface MovimientoKardex {
  id: string
  fecha: string
  tipo: string
  cantidad: number
  stockPrevio: number
  stockNuevo: number
  motivo: string | null
  usuario: string | null
}

/** Kardex de un producto: últimos 300 movimientos (más recientes primero). */
export async function obtenerKardexAction(productoId: string): Promise<
  { success: true; producto: { nombre: string; unidad: string; stock: number }; movimientos: MovimientoKardex[] } | { error: string }
> {
  const sesion = await requerirTenant()
  const producto = await prisma.producto.findFirst({
    where: { id: productoId, tenantId: sesion.tenantId },
    select: { nombre: true, unidad: true, stock: true },
  })
  if (!producto) return { error: 'Producto no encontrado' }
  const movs = await prisma.movimientoInventario.findMany({
    where: { tenantId: sesion.tenantId, productoId },
    orderBy: { createdAt: 'desc' },
    take: 300,
  })
  return {
    success: true,
    producto: { nombre: producto.nombre, unidad: producto.unidad, stock: Number(producto.stock) },
    movimientos: movs.map((m) => ({
      id: m.id, fecha: m.createdAt.toISOString(), tipo: m.tipo, cantidad: Number(m.cantidad),
      stockPrevio: Number(m.stockPrevio), stockNuevo: Number(m.stockNuevo), motivo: m.motivo, usuario: m.usuarioNombre,
    })),
  }
}

const ajusteSchema = z.object({
  productoId: z.string().min(1),
  modo: z.enum(['MERMA', 'ENTRADA', 'SALIDA', 'CONTEO']),
  cantidad: z.coerce.number().min(0, 'Cantidad inválida').max(9999999),
  motivo: z.string().trim().min(3, 'Indica el motivo').max(150),
  categoria: z.enum(CATEGORIAS_MERMA_MANUAL as [CategoriaMerma, ...CategoriaMerma[]]).optional(),
})
export type AjusteStockValues = z.infer<typeof ajusteSchema>

/**
 * Ajuste de inventario con kardex (solo ADMIN):
 *   MERMA   → sale la cantidad (vencido, dañado, robo…), tipo MERMA
 *   ENTRADA → entra la cantidad (sobrante, devolución a stock…), tipo AJUSTE
 *   SALIDA  → sale la cantidad (consumo interno, faltante…), tipo AJUSTE
 *   CONTEO  → la cantidad es el stock físico contado; se ajusta la diferencia
 * Nunca deja el stock en negativo.
 */
export async function ajustarStockAction(data: AjusteStockValues) {
  const sesion = await requerirTenant('ADMIN')
  {
    const bloqueo = await bloqueoPorSuscripcion(sesion.tenantId)
    if (bloqueo) return { error: bloqueo }
  }
  const parsed = ajusteSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  const d = parsed.data
  if (d.modo !== 'CONTEO' && d.cantidad <= 0) return { error: 'La cantidad debe ser mayor a cero' }
  if (d.modo === 'MERMA' && !d.categoria) return { error: 'Indica el tipo de merma' }

  const producto = await prisma.producto.findFirst({
    where: { id: d.productoId, tenantId: sesion.tenantId },
    select: { id: true, nombre: true },
  })
  if (!producto) return { error: 'Producto no encontrado' }

  const etiquetas = { MERMA: 'Merma', ENTRADA: 'Ajuste (entrada)', SALIDA: 'Ajuste (salida)', CONTEO: 'Conteo físico' }
  try {
    const resultado = await prisma.$transaction(async (tx) => {
      let delta: number
      if (d.modo === 'CONTEO') {
        const actual = await tx.producto.findUniqueOrThrow({ where: { id: producto.id }, select: { stock: true } })
        delta = d.cantidad - Number(actual.stock)
        if (Math.abs(delta) < 0.0005) throw new ErrorNegocio('El conteo coincide con el stock del sistema: no hay nada que ajustar')
      } else {
        delta = d.modo === 'ENTRADA' ? d.cantidad : -d.cantidad
      }
      const r = await moverStock(tx, {
        tenantId: sesion.tenantId, productoId: producto.id, cantidad: delta,
        tipo: d.modo === 'MERMA' ? 'MERMA' : 'AJUSTE',
        motivo: `${etiquetas[d.modo]}${d.modo === 'MERMA' ? ` (${CATEGORIAS_MERMA[d.categoria!]})` : ''}: ${d.motivo}`,
        // Mermas por su tipo; un conteo que baja el stock es un faltante.
        categoria: d.modo === 'MERMA' ? d.categoria : d.modo === 'CONTEO' && delta < 0 ? 'FALTANTE' : undefined,
        usuarioNombre: sesion.nombre,
      })
      if (r.stockNuevo < -0.0005) throw new ErrorNegocio(`No hay stock suficiente: quedaría en ${r.stockNuevo.toFixed(3)}`)
      return { delta, ...r }
    })
    await registrarLog('AUDIT', 'INVENTARIO', `${etiquetas[d.modo]} ${producto.nombre}: ${resultado.delta > 0 ? '+' : ''}${resultado.delta} (${resultado.stockPrevio} → ${resultado.stockNuevo}) — ${d.motivo}`, undefined, sesion.tenantId)
    revalidatePath('/productos')
    return { success: true, stockNuevo: resultado.stockNuevo }
  } catch (error: any) {
    if (error instanceof ErrorNegocio) return { error: error.message }
    await registrarLog('ERROR', 'INVENTARIO', `Error ajustando stock: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo registrar el ajuste' }
  }
}

class ErrorNegocio extends Error {}
