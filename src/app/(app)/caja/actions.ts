'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { obtenerEstadoCaja, aperturaDeUsuario, usaVariasCajas } from '@/lib/caja/estado'
import { bloqueoPorSuscripcion } from '@/lib/saas/suscripcion'

const aperturaSchema = z.object({
  fondoInicial: z.coerce.number().min(0, 'El fondo no puede ser negativo').max(100000, 'Monto demasiado alto'),
  notas: z.string().trim().max(300).optional().or(z.literal('')),
  cajaId: z.string().max(40).optional().or(z.literal('')),
})

/**
 * Abre la caja con un fondo inicial en efectivo.
 *   - Una sola caja: una apertura abierta a la vez para todo el negocio.
 *   - Varias cajas: el usuario elige una caja libre; una caja abierta por usuario.
 */
export async function abrirCajaAction(data: { fondoInicial: number; notas?: string; cajaId?: string }) {
  const sesion = await requerirTenant()
  const parsed = aperturaSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  try {
    const varias = await usaVariasCajas(sesion.tenantId)
    let caja: { id: string; nombre: string } | null = null
    if (varias) {
      if (!parsed.data.cajaId) return { error: 'Elige qué caja vas a abrir' }
      caja = await prisma.caja.findFirst({ where: { id: parsed.data.cajaId, tenantId: sesion.tenantId, activa: true }, select: { id: true, nombre: true } })
      if (!caja) return { error: 'Caja no válida' }
    }
    const creada = await prisma.$transaction(async (tx) => {
      const abierta = await tx.aperturaCaja.findFirst({
        where: { tenantId: sesion.tenantId, cerradaAt: null, ...(varias ? { OR: [{ usuarioId: sesion.sub }, { cajaId: caja!.id }] } : {}) },
        select: { usuarioId: true, cajaNombre: true },
      })
      if (abierta) return { ocupada: abierta }
      return tx.aperturaCaja.create({
        data: {
          tenantId: sesion.tenantId, usuarioId: sesion.sub, usuarioNombre: sesion.nombre,
          fondoInicial: parsed.data.fondoInicial, notas: parsed.data.notas || null,
          cajaId: caja?.id ?? null, cajaNombre: caja?.nombre ?? null,
        },
      })
    })
    if ('ocupada' in creada) {
      if (!varias) return { error: 'La caja ya está abierta' }
      return { error: creada.ocupada.usuarioId === sesion.sub ? `Ya tienes abierta la ${creada.ocupada.cajaNombre ?? 'caja'}` : `La ${caja!.nombre} ya está abierta por otro usuario` }
    }
    await registrarLog('AUDIT', 'CAJA', `Apertura de ${caja?.nombre ?? 'caja'} con fondo ${parsed.data.fondoInicial.toFixed(2)} por ${sesion.nombre}`, undefined, sesion.tenantId)
    revalidatePath('/caja')
    return { success: true }
  } catch (error: any) {
    await registrarLog('ERROR', 'CAJA', `Error abriendo caja: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo abrir la caja' }
  }
}

const cierreSchema = z.object({
  efectivoContado: z.coerce.number().min(0, 'El efectivo contado no puede ser negativo').max(1000000),
  notas: z.string().trim().max(500).optional().or(z.literal('')),
})

/**
 * Cierre con arqueo. Varias cajas: cada usuario cierra la suya; el ADMIN puede
 * cerrar cualquiera indicando `aperturaId`.
 */
export async function registrarCierreAction(data: { efectivoContado: number; notas?: string; aperturaId?: string }) {
  const sesion = await requerirTenant()
  const parsed = cierreSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  const aperturaId = data.aperturaId ? String(data.aperturaId).slice(0, 40) : undefined
  if (aperturaId && sesion.rol !== 'ADMIN') {
    const propia = await prisma.aperturaCaja.findFirst({ where: { id: aperturaId, tenantId: sesion.tenantId, usuarioId: sesion.sub }, select: { id: true } })
    if (!propia) return { error: 'Solo el administrador puede cerrar la caja de otro usuario' }
  }

  const ahora = new Date()
  const estado = await obtenerEstadoCaja(sesion.tenantId, sesion.sub, aperturaId)
  if (estado.varias && !estado.apertura) return { error: 'No tienes una caja abierta para cerrar' }
  const r = estado.resumen
  const contado = parsed.data.efectivoContado
  const diferencia = contado - r.efectivoEsperado

  try {
    await prisma.$transaction(async (tx) => {
      await tx.cierreCaja.create({
        data: {
          tenantId: sesion.tenantId,
          usuarioId: sesion.sub,
          usuarioNombre: sesion.nombre,
          aperturaId: estado.apertura?.id ?? null,
          cajaNombre: estado.apertura?.caja ?? null,
          desde: estado.desde,
          hasta: ahora,
          fondoInicial: r.fondoInicial,
          totalVentas: r.totalVentas,
          ventasEfectivo: r.ventasEfectivo,
          ventasTarjeta: r.ventasTarjeta,
          ventasTransfer: r.ventasTransfer,
          totalVendido: r.totalVendido,
          gastosEfectivo: r.gastosEfectivo,
          abonosEfectivo: r.abonosEfectivo,
          pagosProveedorEfectivo: r.pagosProveedorEfectivo,
          ingresosEfectivo: r.ingresosEfectivo,
          retirosEfectivo: r.retirosEfectivo,
          devolucionesEfectivo: r.devolucionesEfectivo,
          efectivoEsperado: r.efectivoEsperado,
          efectivoContado: contado,
          diferencia,
          notas: parsed.data.notas || null,
        },
      })
      if (estado.apertura) {
        await tx.aperturaCaja.updateMany({
          where: { id: estado.apertura.id, tenantId: sesion.tenantId, cerradaAt: null },
          data: { cerradaAt: ahora },
        })
      }
    })
    await registrarLog('AUDIT', 'CAJA', `Cierre de ${estado.apertura?.caja ?? 'caja'} por ${sesion.nombre}: esperado ${r.efectivoEsperado.toFixed(2)}, contado ${contado.toFixed(2)}, diferencia ${diferencia.toFixed(2)}`, undefined, sesion.tenantId)
    revalidatePath('/caja')
    return { success: true, diferencia }
  } catch (error: any) {
    await registrarLog('ERROR', 'CAJA', `Error registrando cierre: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo registrar el cierre' }
  }
}

const movimientoSchema = z.object({
  tipo: z.enum(['RETIRO', 'INGRESO']),
  monto: z.coerce.number().positive('El monto debe ser mayor a cero').max(100000, 'Monto demasiado alto'),
  motivo: z.string().trim().min(3, 'Indica el motivo').max(200),
})

/**
 * Retiro o ingreso de efectivo con la caja abierta (cualquier usuario; queda
 * con su nombre). Un retiro no puede superar el efectivo que debería haber.
 * No se eliminan: un error se corrige con el movimiento contrario.
 */
export async function registrarMovimientoCajaAction(data: z.infer<typeof movimientoSchema>) {
  const sesion = await requerirTenant()
  const bloqueo = await bloqueoPorSuscripcion(sesion.tenantId)
  if (bloqueo) return { error: bloqueo }
  const parsed = movimientoSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  const d = parsed.data
  try {
    const apertura = await aperturaDeUsuario(sesion.tenantId, sesion.sub)
    if (!apertura) return { error: 'No tienes una caja abierta: ábrela para registrar movimientos de efectivo' }
    if (d.tipo === 'RETIRO') {
      const { resumen } = await obtenerEstadoCaja(sesion.tenantId, sesion.sub)
      if (d.monto > resumen.efectivoEsperado + 0.005) {
        return { error: `No puedes retirar más del efectivo que debería haber en caja ($${resumen.efectivoEsperado.toFixed(2)})` }
      }
    }
    await prisma.movimientoCaja.create({
      data: { tenantId: sesion.tenantId, aperturaId: apertura.id, tipo: d.tipo, monto: d.monto, motivo: d.motivo, usuarioId: sesion.sub, usuarioNombre: sesion.nombre },
    })
    await registrarLog('AUDIT', 'CAJA', `${d.tipo === 'RETIRO' ? 'Retiro' : 'Ingreso'} de efectivo $${d.monto.toFixed(2)} por ${sesion.nombre}: ${d.motivo}`, undefined, sesion.tenantId)
    revalidatePath('/caja')
    return { success: true }
  } catch (error: any) {
    await registrarLog('ERROR', 'CAJA', `Error registrando movimiento de caja: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo registrar el movimiento' }
  }
}
