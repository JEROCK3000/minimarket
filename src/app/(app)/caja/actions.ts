'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { revalidatePath } from 'next/cache'

/** Calcula el resumen de caja de un período (por defecto, el día de hoy). */
export async function obtenerResumenCaja(tenantId: string, desde: Date, hasta: Date) {
  const [ventas, gastos] = await Promise.all([
    prisma.venta.findMany({
      where: { tenantId, estado: 'COMPLETADA', fecha: { gte: desde, lte: hasta } },
      select: { formaPago: true, total: true },
    }),
    prisma.gasto.aggregate({
      where: { tenantId, fecha: { gte: desde, lte: hasta } },
      _sum: { monto: true },
    }),
  ])

  let efectivo = 0, tarjeta = 0, transfer = 0
  for (const v of ventas) {
    const t = Number(v.total)
    if (v.formaPago === 'EFECTIVO') efectivo += t
    else if (v.formaPago === 'TARJETA') tarjeta += t
    else transfer += t
  }
  const totalVendido = efectivo + tarjeta + transfer
  const gastosEfectivo = Number(gastos._sum.monto ?? 0)

  return {
    totalVentas: ventas.length,
    ventasEfectivo: efectivo,
    ventasTarjeta: tarjeta,
    ventasTransfer: transfer,
    totalVendido,
    gastosEfectivo,
    efectivoEsperado: efectivo - gastosEfectivo,
  }
}

export async function registrarCierreAction(data: { efectivoContado: number; notas?: string }) {
  const sesion = await requerirTenant()

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const ahora = new Date()
  const r = await obtenerResumenCaja(sesion.tenantId, hoy, ahora)

  const contado = Number(data.efectivoContado) || 0
  const diferencia = contado - r.efectivoEsperado

  try {
    await prisma.cierreCaja.create({
      data: {
        tenantId: sesion.tenantId,
        usuarioId: sesion.sub,
        usuarioNombre: sesion.nombre,
        desde: hoy,
        hasta: ahora,
        totalVentas: r.totalVentas,
        ventasEfectivo: r.ventasEfectivo,
        ventasTarjeta: r.ventasTarjeta,
        ventasTransfer: r.ventasTransfer,
        totalVendido: r.totalVendido,
        gastosEfectivo: r.gastosEfectivo,
        efectivoEsperado: r.efectivoEsperado,
        efectivoContado: contado,
        diferencia,
        notas: data.notas || null,
      },
    })
    await registrarLog('AUDIT', 'CAJA', `Cierre de caja: esperado ${r.efectivoEsperado.toFixed(2)}, contado ${contado.toFixed(2)}, diferencia ${diferencia.toFixed(2)}`, undefined, sesion.tenantId)
    revalidatePath('/caja')
    return { success: true, diferencia }
  } catch (error: any) {
    await registrarLog('ERROR', 'CAJA', `Error registrando cierre: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo registrar el cierre' }
  }
}
