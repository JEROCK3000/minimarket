'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const gastoSchema = z.object({
  categoria: z.string().trim().min(1, 'La categoría es requerida').max(60),
  descripcion: z.string().trim().min(1, 'La descripción es requerida').max(300),
  monto: z.coerce.number().positive('El monto debe ser mayor a 0').max(9999999),
  fecha: z.string().optional(),
})
export interface GastoFormValues {
  categoria: string
  descripcion: string
  monto: string
  fecha?: string
}

export async function crearGastoAction(data: GastoFormValues) {
  const sesion = await requerirTenant('ADMIN')
  const parsed = gastoSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  const d = parsed.data

  try {
    await prisma.gasto.create({
      data: {
        tenantId: sesion.tenantId,
        categoria: d.categoria,
        descripcion: d.descripcion,
        monto: d.monto,
        fecha: d.fecha ? new Date(d.fecha) : new Date(),
      },
    })
    await registrarLog('AUDIT', 'GASTOS', `Gasto registrado: ${d.descripcion} (${d.monto})`, undefined, sesion.tenantId)
    revalidatePath('/gastos')
    return { success: true }
  } catch (error: any) {
    await registrarLog('ERROR', 'GASTOS', `Error registrando gasto: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo registrar el gasto' }
  }
}

export async function eliminarGastoAction(id: string) {
  const sesion = await requerirTenant('ADMIN')
  try {
    const g = await prisma.gasto.findFirst({ where: { id, tenantId: sesion.tenantId } })
    if (!g) return { error: 'Gasto no encontrado' }
    await prisma.gasto.delete({ where: { id } })
    await registrarLog('AUDIT', 'GASTOS', `Gasto eliminado: ${g.descripcion}`, undefined, sesion.tenantId)
    revalidatePath('/gastos')
    return { success: true }
  } catch {
    return { error: 'No se pudo eliminar el gasto' }
  }
}
