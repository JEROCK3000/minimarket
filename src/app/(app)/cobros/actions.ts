'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { redondear2 } from '@/lib/ventas/totales'
import { bloqueoPorSuscripcion, limiteDelPlan } from '@/lib/saas/suscripcion'

export interface VentaPendiente { id: string; numero: string; fecha: string; total: number; saldo: number; vence: string | null; vencida: boolean }
export interface AbonoRow { id: string; fecha: string; monto: number; formaPago: string; venta: string; usuario: string | null; notas: string | null }

/** Estado de cuenta de un cliente: ventas fiadas con saldo y últimos abonos. */
export async function cuentaClienteAction(clienteId: string): Promise<
  { success: true; cliente: { nombre: string; identificacion: string }; pendientes: VentaPendiente[]; abonos: AbonoRow[] } | { error: string }
> {
  const sesion = await requerirTenant()
  const cliente = await prisma.cliente.findFirst({ where: { id: clienteId, tenantId: sesion.tenantId }, select: { nombre: true, identificacion: true } })
  if (!cliente) return { error: 'Cliente no encontrado' }
  const [ventas, abonos] = await Promise.all([
    prisma.venta.findMany({
      where: { tenantId: sesion.tenantId, clienteId, estado: 'COMPLETADA', saldoPendiente: { gt: 0 } },
      orderBy: { fecha: 'asc' },
      select: { id: true, numero: true, fecha: true, total: true, saldoPendiente: true, diasCredito: true },
    }),
    prisma.abonoVenta.findMany({
      where: { tenantId: sesion.tenantId, clienteId },
      orderBy: { createdAt: 'desc' }, take: 50,
      include: { venta: { select: { numero: true } } },
    }),
  ])
  const ahora = Date.now()
  return {
    success: true,
    cliente,
    pendientes: ventas.map((v) => {
      const vence = v.diasCredito != null ? new Date(v.fecha.getTime() + v.diasCredito * 86400000) : null
      return {
        id: v.id, numero: v.numero, fecha: v.fecha.toISOString(), total: Number(v.total), saldo: Number(v.saldoPendiente),
        vence: vence?.toISOString() ?? null, vencida: !!vence && vence.getTime() < ahora,
      }
    }),
    abonos: abonos.map((a) => ({
      id: a.id, fecha: a.createdAt.toISOString(), monto: Number(a.monto), formaPago: a.formaPago,
      venta: a.venta.numero, usuario: a.usuarioNombre, notas: a.notas,
    })),
  }
}

const abonoSchema = z.object({
  clienteId: z.string().min(1),
  monto: z.coerce.number().positive('El monto debe ser mayor a cero').max(1000000),
  formaPago: z.enum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA']),
  notas: z.string().trim().max(200).optional().or(z.literal('')),
})

/**
 * Registra un cobro del cliente y lo reparte entre sus ventas fiadas pendientes,
 * de la más antigua a la más nueva. Cada descuento del saldo es condicional y
 * atómico (updateMany con saldo ≥ monto): dos cobros simultáneos no dejan saldos
 * negativos. El efectivo cobrado entra al arqueo de caja del período.
 */
export async function registrarAbonoAction(data: { clienteId: string; monto: number; formaPago: string; notas?: string }) {
  const sesion = await requerirTenant()
  {
    const bloqueo = await bloqueoPorSuscripcion(sesion.tenantId)
    if (bloqueo) return { error: bloqueo }
  }
  const parsed = abonoSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  const d = parsed.data
  const monto = redondear2(d.monto)

  const cliente = await prisma.cliente.findFirst({ where: { id: d.clienteId, tenantId: sesion.tenantId }, select: { nombre: true } })
  if (!cliente) return { error: 'Cliente no encontrado' }

  try {
    const aplicados = await prisma.$transaction(async (tx) => {
      const ventas = await tx.venta.findMany({
        where: { tenantId: sesion.tenantId, clienteId: d.clienteId, estado: 'COMPLETADA', saldoPendiente: { gt: 0 } },
        orderBy: { fecha: 'asc' },
        select: { id: true, numero: true, saldoPendiente: true },
      })
      const deuda = redondear2(ventas.reduce((s, v) => s + Number(v.saldoPendiente), 0))
      if (deuda <= 0) throw new ErrorNegocio('El cliente no tiene saldo pendiente')
      if (monto > deuda) throw new ErrorNegocio(`El monto supera la deuda del cliente ($${deuda.toFixed(2)})`)

      let restante = monto
      const detalle: string[] = []
      for (const v of ventas) {
        if (restante <= 0) break
        const aplicar = redondear2(Math.min(restante, Number(v.saldoPendiente)))
        const r = await tx.venta.updateMany({
          where: { id: v.id, tenantId: sesion.tenantId, saldoPendiente: { gte: aplicar } },
          data: { saldoPendiente: { decrement: aplicar } },
        })
        if (r.count === 0) throw new ErrorNegocio('El saldo cambió mientras se registraba el cobro. Intenta de nuevo.')
        await tx.abonoVenta.create({
          data: {
            tenantId: sesion.tenantId, ventaId: v.id, clienteId: d.clienteId, monto: aplicar, formaPago: d.formaPago,
            notas: d.notas || null, usuarioId: sesion.sub, usuarioNombre: sesion.nombre,
          },
        })
        detalle.push(`${v.numero}: ${aplicar.toFixed(2)}`)
        restante = redondear2(restante - aplicar)
      }
      return { detalle, saldoRestante: redondear2(deuda - monto) }
    })
    await registrarLog('AUDIT', 'COBROS', `Cobro de ${monto.toFixed(2)} (${d.formaPago}) a ${cliente.nombre} — ${aplicados.detalle.join(', ')}`, undefined, sesion.tenantId)
    revalidatePath('/cobros')
    revalidatePath('/caja')
    return { success: true, saldoRestante: aplicados.saldoRestante }
  } catch (error: any) {
    if (error instanceof ErrorNegocio) return { error: error.message }
    await registrarLog('ERROR', 'COBROS', `Error registrando cobro: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo registrar el cobro' }
  }
}

class ErrorNegocio extends Error {}
