'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { revalidatePath } from 'next/cache'
import { compradorDeVenta } from '@/lib/ventas/comprador'
import { calcularVenta } from '@/lib/ventas/totales'
import { emitirNotaCreditoSri } from '@/lib/sri/emitir-nc'
import { moverStock } from '@/lib/inventario/movimientos'
import { bloqueoPorSuscripcion } from '@/lib/saas/suscripcion'
import { descripcionItem } from '@/lib/ventas/presentaciones'

/**
 * Emite una Nota de Crédito que anula por completo una factura autorizada.
 * Al autorizarse, revierte el stock de los productos al inventario.
 * (Las devoluciones parciales van por ventas/devolucion-actions.ts.)
 */
export async function emitirNotaCreditoAction(ventaId: string, motivo: string) {
  const sesion = await requerirTenant('ADMIN') // solo el dueño emite NC
  {
    const bloqueo = await bloqueoPorSuscripcion(sesion.tenantId)
    if (bloqueo) return { error: bloqueo }
  }

  const motivoLimpio = (motivo || '').trim()
  if (motivoLimpio.length < 3) return { error: 'Indica el motivo de la nota de crédito' }
  if (motivoLimpio.length > 300) return { error: 'El motivo es demasiado largo' }

  try {
    const venta = await prisma.venta.findFirst({
      where: { id: ventaId, tenantId: sesion.tenantId },
      include: { cliente: true, items: { include: { producto: true } }, factura: true, notasCredito: { where: { tipo: 'TOTAL' } } },
    })
    if (!venta) return { error: 'Venta no encontrada' }
    if (!venta.factura || venta.factura.estado !== 'AUTORIZADA') {
      return { error: 'Solo se puede emitir nota de crédito sobre una factura AUTORIZADA' }
    }
    const ncTotal = venta.notasCredito[0] ?? null // NC que anula toda la factura (si ya se intentó)
    if (ncTotal?.estado === 'AUTORIZADA') {
      return { error: 'Esta factura ya tiene una nota de crédito autorizada' }
    }
    if (Number(venta.totalDevuelto) > 0) {
      return { error: 'Esta factura ya tiene devoluciones parciales: usa "Devolver productos" para devolver lo que queda' }
    }
    if (!venta.cliente) return { error: 'La factura no tiene cliente asignado' }
    // Mismo comprador que la factura original, aunque el cliente haya cambiado después.
    const comprador = compradorDeVenta(venta)!

    // Mismo cálculo que la factura original (tarifa de IVA por producto).
    const calculo = calcularVenta(
      venta.items.map((it) => ({
        cantidad: Number(it.cantidad), precioUnitario: Number(it.precioUnitario), ivaPorcentaje: Number(it.producto.ivaPorcentaje),
      })),
      Number(venta.descuento),
    )
    const total = calculo.total

    const r = await emitirNotaCreditoSri({
      tenantId: sesion.tenantId, claveFactura: venta.factura.claveAcceso, fechaFactura: venta.fecha,
      comprador: { tipoIdentificacion: comprador.tipoIdentificacion, identificacion: comprador.identificacion, razonSocial: venta.cliente.nombre },
      motivo: motivoLimpio, base: calculo.base, total, porTarifa: calculo.porTarifa,
      detalles: venta.items.map((it, i) => {
        const l = calculo.lineas[i]
        return {
          codigoInterno: it.productoId.slice(-6), descripcion: descripcionItem(it.producto.nombre, it.presentacion), cantidad: Number(it.cantidad), precioUnitario: Number(it.precioUnitario),
          descuento: l.descuento, base: l.base, ivaPorcentaje: l.ivaPorcentaje, iva: l.iva,
        }
      }),
    })
    if ('error' in r) return { error: r.error }

    // Guarda/actualiza la NC total de la venta (una sola por venta, sin devolución asociada).
    const guardar = (tx: typeof prisma | Parameters<Parameters<typeof prisma.$transaction>[0]>[0], datos: Record<string, unknown>) =>
      ncTotal
        ? tx.notaCredito.update({ where: { id: ncTotal.id }, data: datos })
        : tx.notaCredito.create({ data: { tenantId: sesion.tenantId, ventaId, tipo: 'TOTAL', ...datos } as any })

    if (r.estado === 'PENDIENTE') {
      await guardar(prisma, { claveAcceso: r.claveAcceso, estado: 'PENDIENTE', motivo: motivoLimpio, valorModificacion: total, mensajeError: 'El SRI está demorando. Reintenta en unos minutos.' })
      revalidatePath('/ventas')
      return { error: 'El SRI está demorando en procesar la nota de crédito (quedó PENDIENTE). Reintenta en unos minutos.' }
    }

    if (r.estado === 'AUTORIZADA') {
      // Guardar NC, marcar venta anulada y revertir stock (en transacción)
      await prisma.$transaction(async (tx) => {
        await guardar(tx, { claveAcceso: r.claveAcceso, numeroAutorizacion: r.numeroAutorizacion, estado: 'AUTORIZADA', motivo: motivoLimpio, valorModificacion: total, xmlFirmado: r.xml, fechaAutorizacion: r.fechaAutorizacion, mensajeError: null })
        await tx.venta.update({ where: { id: ventaId }, data: { estado: 'ANULADA', saldoPendiente: 0 } })
        for (const it of venta.items) {
          await moverStock(tx, {
            tenantId: sesion.tenantId, productoId: it.productoId, cantidad: Number(it.cantidad) * Number(it.factor), tipo: 'AJUSTE',
            motivo: `Nota de crédito ${r.numDocModificado}`, usuarioNombre: sesion.nombre,
          })
        }
      })
      await registrarLog('AUDIT', 'VENTAS', `Nota de crédito AUTORIZADA para factura ${r.numDocModificado} (${r.claveAcceso})`, undefined, sesion.tenantId)
      revalidatePath('/ventas'); revalidatePath('/productos'); revalidatePath('/dashboard')
      return { success: true, numeroAutorizacion: r.numeroAutorizacion }
    }

    await guardar(prisma, { claveAcceso: r.claveAcceso, estado: 'RECHAZADA', motivo: motivoLimpio, valorModificacion: total, mensajeError: r.mensaje })
    await registrarLog('ERROR', 'VENTAS', `Nota de crédito RECHAZADA: ${r.mensaje}`, undefined, sesion.tenantId)
    revalidatePath('/ventas')
    return { error: `SRI Autorización Rechazada: ${r.mensaje}` }
  } catch (error: any) {
    await registrarLog('ERROR', 'VENTAS', `Error emitiendo nota de crédito: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'Error al emitir la nota de crédito' }
  }
}
