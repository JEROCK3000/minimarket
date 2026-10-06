'use server'

import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { moverStock } from '@/lib/inventario/movimientos'
import { bloqueoPorSuscripcion } from '@/lib/saas/suscripcion'
import { calcularDevolucion, type YaDevuelto, type TotalesDevolucion } from '@/lib/ventas/devolucion'
import { compradorDeVenta } from '@/lib/ventas/comprador'
import { emitirNotaCreditoSri, consultarAutorizacionNC, numeroDesdeClave } from '@/lib/sri/emitir-nc'
import { ENDPOINTS_SRI } from '@/lib/sri/helpers'
import { usaControlCaja } from '@/lib/config/negocio'
import { aperturaDeUsuario, obtenerEstadoCaja } from '@/lib/caja/estado'
import { descripcionItem } from '@/lib/ventas/presentaciones'

/**
 * Devoluciones parciales (solo ADMIN). Ticket → devolución interna. Factura
 * autorizada → nota de crédito PARCIAL al SRI y la devolución se aplica al
 * autorizarse (si queda PENDIENTE, se aplica al consultar). Efectos: stock
 * (o merma si volvió dañado), caja (reembolso en efectivo), fiado (SALDO) y
 * Venta.totalDevuelto. No se puede devolver más de lo vendido.
 */
class ErrorNegocio extends Error {}
const EPS = 0.0005
const REEMBOLSOS = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'SALDO'] as const
type Reembolso = (typeof REEMBOLSOS)[number]

const ventaInclude = {
  cliente: true,
  factura: { select: { estado: true, claveAcceso: true } },
  items: { include: { producto: { select: { nombre: true, unidad: true, ivaPorcentaje: true } } } },
  notasCredito: { where: { tipo: 'PARCIAL', estado: 'PENDIENTE' }, select: { id: true } },
} as const

async function cargarVenta(tenantId: string, ventaId: string) {
  const venta = await prisma.venta.findFirst({ where: { id: ventaId, tenantId }, include: ventaInclude })
  if (!venta) throw new ErrorNegocio('Venta no encontrada')
  return venta
}

/** Lo ya devuelto por línea de la venta. */
async function yaDevuelto(ventaId: string, tx: Pick<typeof prisma, 'devolucionItem'> = prisma) {
  const filas = await tx.devolucionItem.findMany({ where: { devolucion: { ventaId } }, select: { ventaItemId: true, cantidad: true, descuento: true, base: true, iva: true } })
  const m = new Map<string, YaDevuelto>()
  for (const f of filas) {
    const p = m.get(f.ventaItemId) ?? { cantidad: 0, descuento: 0, base: 0, iva: 0 }
    m.set(f.ventaItemId, { cantidad: p.cantidad + Number(f.cantidad), descuento: p.descuento + Number(f.descuento), base: p.base + Number(f.base), iva: p.iva + Number(f.iva) })
  }
  return m
}

const lineasOriginales = (venta: Awaited<ReturnType<typeof cargarVenta>>) =>
  venta.items.map((it) => ({ id: it.id, cantidad: Number(it.cantidad), precioUnitario: Number(it.precioUnitario), ivaPorcentaje: Number(it.producto.ivaPorcentaje) }))

// ─── Datos para el formulario ─────────────────────────────────────────────────
export async function obtenerDatosDevolucionAction(ventaId: string) {
  const sesion = await requerirTenant('ADMIN')
  try {
    const venta = await cargarVenta(sesion.tenantId, String(ventaId))
    const devuelto = await yaDevuelto(venta.id)
    const conFactura = venta.requiereFactura
    const control = await usaControlCaja(sesion.tenantId)
    return {
      success: true as const,
      venta: {
        id: venta.id, numero: venta.numero, cliente: venta.cliente?.nombre ?? 'Consumidor final', total: Number(venta.total),
        totalDevuelto: Number(venta.totalDevuelto), formaPago: venta.formaPago, saldoPendiente: Number(venta.saldoPendiente),
        descuento: Number(venta.descuento), conFactura, facturaAutorizada: venta.factura?.estado === 'AUTORIZADA', estado: venta.estado,
        ncPendiente: venta.notasCredito.length > 0,
      },
      lineas: venta.items.map((it) => ({
        id: it.id, nombre: descripcionItem(it.producto.nombre, it.presentacion), unidad: it.presentacion ? 'presentación' : it.producto.unidad, cantidad: Number(it.cantidad),
        precioUnitario: Number(it.precioUnitario), ivaPorcentaje: Number(it.producto.ivaPorcentaje),
        devuelto: devuelto.get(it.id) ?? { cantidad: 0, descuento: 0, base: 0, iva: 0 },
      })),
      caja: { control, abierta: control ? !!(await aperturaDeUsuario(sesion.tenantId, sesion.sub)) : true },
    }
  } catch (error: any) {
    if (error instanceof ErrorNegocio) return { error: error.message }
    await registrarLog('ERROR', 'VENTAS', `Error cargando devolución: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo cargar la venta' }
  }
}

// ─── Registrar ────────────────────────────────────────────────────────────────
const devolucionSchema = z.object({
  ventaId: z.string().min(1).max(40),
  items: z.array(z.object({ ventaItemId: z.string().min(1).max(40), cantidad: z.coerce.number().positive().max(9999999) })).min(1, 'Elige al menos un producto').max(500),
  motivo: z.string().trim().min(3, 'Indica el motivo').max(300),
  formaReembolso: z.enum(REEMBOLSOS),
  reingresaStock: z.boolean(),
})
export type DevolucionValues = z.infer<typeof devolucionSchema>
type Pendiente = Omit<DevolucionValues, 'ventaId'>

/** Aplica la devolución en una transacción (re-valida cantidades dentro de ella). */
async function aplicarDevolucion(p: {
  tenantId: string; usuarioId: string; usuarioNombre: string; ventaId: string; ventaNumero: string; d: Pendiente
  nc?: { existenteId?: string; claveAcceso: string; numeroAutorizacion: string; xml: string; fechaAutorizacion: Date }
}) {
  return prisma.$transaction(async (tx) => {
    const venta = await tx.venta.findFirstOrThrow({ where: { id: p.ventaId, tenantId: p.tenantId }, include: { items: { include: { producto: { select: { ivaPorcentaje: true, nombre: true } } } } } })
    if (venta.estado !== 'COMPLETADA') throw new ErrorNegocio('La venta está anulada')
    let calc: TotalesDevolucion
    try {
      calc = calcularDevolucion(
        venta.items.map((it) => ({ id: it.id, cantidad: Number(it.cantidad), precioUnitario: Number(it.precioUnitario), ivaPorcentaje: Number(it.producto.ivaPorcentaje) })),
        Number(venta.descuento), await yaDevuelto(venta.id, tx), new Map(p.d.items.map((i) => [i.ventaItemId, i.cantidad])),
      )
    } catch (e: any) { throw new ErrorNegocio(e.message) }
    const apertura = await aperturaDeUsuario(p.tenantId, p.usuarioId) // caja de quien devuelve
    const n = await tx.devolucion.count({ where: { tenantId: p.tenantId } })
    const numero = `DEV-${String(n + 1).padStart(5, '0')}`
    const dev = await tx.devolucion.create({
      data: {
        tenantId: p.tenantId, ventaId: venta.id, aperturaId: apertura?.id ?? null, numero, motivo: p.d.motivo,
        subtotal: calc.subtotal, descuento: calc.descuento, iva: calc.iva, total: calc.total,
        formaReembolso: p.d.formaReembolso, reingresaStock: p.d.reingresaStock, usuarioNombre: p.usuarioNombre,
        items: { create: calc.lineas.map((l) => ({
          ventaItemId: l.ventaItemId, productoId: venta.items.find((i) => i.id === l.ventaItemId)!.productoId,
          cantidad: l.cantidad, precioUnitario: l.precioUnitario, descuento: l.descuento, base: l.base, ivaPorcentaje: l.ivaPorcentaje, iva: l.iva,
        })) },
      },
    })
    if (p.nc) {
      const datos = { tipo: 'PARCIAL', estado: 'AUTORIZADA', devolucionId: dev.id, claveAcceso: p.nc.claveAcceso, numeroAutorizacion: p.nc.numeroAutorizacion,
        xmlFirmado: p.nc.xml, fechaAutorizacion: p.nc.fechaAutorizacion, motivo: p.d.motivo, valorModificacion: calc.total, mensajeError: null }
      if (p.nc.existenteId) await tx.notaCredito.update({ where: { id: p.nc.existenteId }, data: { ...datos, datosPendientes: Prisma.DbNull } })
      else await tx.notaCredito.create({ data: { tenantId: p.tenantId, ventaId: venta.id, ...datos } })
    }
    for (const l of calc.lineas) {
      const it = venta.items.find((i) => i.id === l.ventaItemId)!
      const unidades = l.cantidad * Number(it.factor) // presentaciones: cajas → unidades
      await moverStock(tx, { tenantId: p.tenantId, productoId: it.productoId, cantidad: unidades, tipo: 'AJUSTE', motivo: `Devolución ${numero} (venta ${venta.numero})`, usuarioNombre: p.usuarioNombre })
      if (!p.d.reingresaStock) {
        await moverStock(tx, { tenantId: p.tenantId, productoId: it.productoId, cantidad: -unidades, tipo: 'MERMA', motivo: `Devolución ${numero}: volvió dañado`, categoria: 'DANADO', usuarioNombre: p.usuarioNombre })
      }
    }
    await tx.venta.update({ where: { id: venta.id }, data: { totalDevuelto: { increment: calc.total } } })
    if (p.d.formaReembolso === 'SALDO') {
      const r = await tx.venta.updateMany({ where: { id: venta.id, saldoPendiente: { gte: calc.total } }, data: { saldoPendiente: { decrement: calc.total } } })
      if (r.count === 0) throw new ErrorNegocio('El saldo pendiente es menor que la devolución: reembolsa la diferencia por otra vía')
    }
    return { numero, total: calc.total }
  }, { timeout: 30000 })
}

export async function registrarDevolucionAction(data: DevolucionValues) {
  const sesion = await requerirTenant('ADMIN')
  const bloqueo = await bloqueoPorSuscripcion(sesion.tenantId)
  if (bloqueo) return { error: bloqueo }
  const parsed = devolucionSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  const d = parsed.data
  try {
    const venta = await cargarVenta(sesion.tenantId, d.ventaId)
    if (venta.estado !== 'COMPLETADA') return { error: 'La venta está anulada' }
    if (venta.notasCredito.length > 0) return { error: 'Hay una nota de crédito pendiente en el SRI para esta venta: consúltala antes de otra devolución' }
    const conFactura = venta.requiereFactura
    if (conFactura && venta.factura?.estado !== 'AUTORIZADA') {
      return { error: 'La factura de esta venta no está autorizada: emítela primero o anula la venta completa' }
    }
    let calc: TotalesDevolucion
    try {
      calc = calcularDevolucion(lineasOriginales(venta), Number(venta.descuento), await yaDevuelto(venta.id), new Map(d.items.map((i) => [i.ventaItemId, i.cantidad])))
    } catch (e: any) { return { error: e.message } }
    if (calc.lineas.length === 0 || calc.total <= 0) return { error: 'Elige al menos un producto a devolver' }

    // Reembolso
    if (d.formaReembolso === 'SALDO' && !(venta.formaPago === 'CREDITO' && Number(venta.saldoPendiente) + EPS >= calc.total)) {
      return { error: 'Solo se descuenta del saldo en ventas fiadas con saldo suficiente' }
    }
    // Fiado con deuda: lo devuelto se descuenta de lo que debe (no se entrega dinero por algo no pagado).
    if (venta.formaPago === 'CREDITO' && d.formaReembolso !== 'SALDO' && Number(venta.saldoPendiente) + EPS >= calc.total) {
      return { error: 'Esta venta es fiada y el cliente aún debe: la devolución se descuenta de su saldo' }
    }
    if (d.formaReembolso === 'EFECTIVO' && await usaControlCaja(sesion.tenantId)) {
      if (!(await aperturaDeUsuario(sesion.tenantId, sesion.sub))) return { error: 'Para devolver efectivo tu caja debe estar abierta' }
      const { resumen } = await obtenerEstadoCaja(sesion.tenantId, sesion.sub)
      if (calc.total > resumen.efectivoEsperado + 0.005) return { error: `No hay suficiente efectivo en caja ($${resumen.efectivoEsperado.toFixed(2)}) para devolver $${calc.total.toFixed(2)}` }
    }

    const pendiente: Pendiente = { items: d.items, motivo: d.motivo, formaReembolso: d.formaReembolso, reingresaStock: d.reingresaStock }

    if (!conFactura) {
      const r = await aplicarDevolucion({ tenantId: sesion.tenantId, usuarioId: sesion.sub, usuarioNombre: sesion.nombre, ventaId: venta.id, ventaNumero: venta.numero, d: pendiente })
      await registrarLog('AUDIT', 'VENTAS', `Devolución ${r.numero} de la venta ${venta.numero}: $${r.total.toFixed(2)} (${d.formaReembolso}) por ${sesion.email}`, undefined, sesion.tenantId)
      revalidar()
      return { success: true, numero: r.numero, total: r.total }
    }

    // Factura autorizada → NC parcial al SRI
    if (!venta.cliente) return { error: 'La factura no tiene cliente asignado' }
    const comprador = compradorDeVenta(venta)!
    const nombres = new Map(venta.items.map((i) => [i.id, i]))
    const r = await emitirNotaCreditoSri({
      tenantId: sesion.tenantId, claveFactura: venta.factura!.claveAcceso, fechaFactura: venta.fecha,
      comprador: { tipoIdentificacion: comprador.tipoIdentificacion, identificacion: comprador.identificacion, razonSocial: venta.cliente.nombre },
      motivo: d.motivo, base: calc.base, total: calc.total, porTarifa: calc.porTarifa,
      detalles: calc.lineas.map((l) => {
        const it = nombres.get(l.ventaItemId)!
        return { codigoInterno: it.productoId.slice(-6), descripcion: descripcionItem(it.producto.nombre, it.presentacion), cantidad: l.cantidad, precioUnitario: l.precioUnitario, descuento: l.descuento, base: l.base, ivaPorcentaje: l.ivaPorcentaje, iva: l.iva }
      }),
    })
    if ('error' in r) return { error: r.error }
    if (r.estado === 'AUTORIZADA') {
      let ap: { numero: string; total: number }
      try {
        ap = await aplicarDevolucion({ tenantId: sesion.tenantId, usuarioId: sesion.sub, usuarioNombre: sesion.nombre, ventaId: venta.id, ventaNumero: venta.numero, d: pendiente,
          nc: { claveAcceso: r.claveAcceso, numeroAutorizacion: r.numeroAutorizacion, xml: r.xml, fechaAutorizacion: r.fechaAutorizacion } })
      } catch (e: any) {
        // El SRI ya la autorizó: no se pierde. Queda PENDIENTE de aplicar y "Consultar SRI" la aplica.
        await prisma.notaCredito.create({ data: { tenantId: sesion.tenantId, ventaId: venta.id, tipo: 'PARCIAL', claveAcceso: r.claveAcceso, estado: 'PENDIENTE', motivo: d.motivo,
          valorModificacion: calc.total, mensajeError: 'Autorizada por el SRI; falta aplicar la devolución', datosPendientes: pendiente as unknown as object } })
        await registrarLog('ERROR', 'VENTAS', `NC parcial AUTORIZADA (${r.claveAcceso}) pero la devolución no se aplicó: ${e.message || e}`, undefined, sesion.tenantId)
        revalidar()
        return { error: `La nota de crédito fue autorizada, pero la devolución no se pudo aplicar${e instanceof ErrorNegocio ? `: ${e.message}` : ''}. Usa "Consultar SRI" en la venta para reintentar.` }
      }
      await registrarLog('AUDIT', 'VENTAS', `Devolución ${ap.numero} con NC parcial AUTORIZADA (${r.claveAcceso}) sobre factura ${r.numDocModificado}: $${ap.total.toFixed(2)} por ${sesion.email}`, undefined, sesion.tenantId)
      revalidar()
      return { success: true, numero: ap.numero, total: ap.total, notaCredito: numeroDesdeClave(r.claveAcceso) }
    }
    await prisma.notaCredito.create({
      data: {
        tenantId: sesion.tenantId, ventaId: venta.id, tipo: 'PARCIAL', claveAcceso: r.claveAcceso, estado: r.estado, motivo: d.motivo, valorModificacion: calc.total,
        mensajeError: r.estado === 'RECHAZADA' ? r.mensaje : 'El SRI está demorando',
        datosPendientes: r.estado === 'PENDIENTE' ? (pendiente as unknown as object) : undefined,
      },
    })
    revalidar()
    if (r.estado === 'RECHAZADA') {
      await registrarLog('ERROR', 'VENTAS', `NC parcial RECHAZADA sobre factura ${r.numDocModificado}: ${r.mensaje}`, undefined, sesion.tenantId)
      return { error: `SRI rechazó la nota de crédito: ${r.mensaje}` }
    }
    await registrarLog('WARN', 'VENTAS', `NC parcial PENDIENTE en el SRI (${r.claveAcceso}) sobre factura ${r.numDocModificado}`, undefined, sesion.tenantId)
    return { error: 'El SRI está demorando: la nota de crédito quedó PENDIENTE. Usa "Consultar SRI" en la venta en unos minutos; la devolución se aplicará al autorizarse.' }
  } catch (error: any) {
    if (error instanceof ErrorNegocio) return { error: error.message }
    await registrarLog('ERROR', 'VENTAS', `Error registrando devolución: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo registrar la devolución' }
  }
}

/** Consulta una NC parcial PENDIENTE y, si el SRI ya la autorizó, aplica la devolución. */
export async function consultarDevolucionPendienteAction(ncId: string) {
  const sesion = await requerirTenant('ADMIN')
  try {
    const nc = await prisma.notaCredito.findFirst({ where: { id: String(ncId), tenantId: sesion.tenantId, tipo: 'PARCIAL', estado: 'PENDIENTE' }, include: { venta: { select: { id: true, numero: true } } } })
    if (!nc || !nc.datosPendientes) return { error: 'No hay una nota de crédito pendiente con ese identificador' }
    const emisor = await prisma.emisorSRI.findUnique({ where: { tenantId: sesion.tenantId }, select: { ambiente: true } })
    if (!emisor) return { error: 'Emisor SRI no configurado' }
    const aut = await consultarAutorizacionNC(nc.claveAcceso, (emisor.ambiente === 1 ? ENDPOINTS_SRI.pruebas : ENDPOINTS_SRI.produccion).autorizacion, 2)
    if (!aut) return { error: 'El SRI aún no responde. Intenta de nuevo en unos minutos.' }
    if (aut.estado === 'AUTORIZADO' || aut.estado === 'AUTORIZADA') {
      const ap = await aplicarDevolucion({ tenantId: sesion.tenantId, usuarioId: sesion.sub, usuarioNombre: sesion.nombre, ventaId: nc.venta.id, ventaNumero: nc.venta.numero, d: nc.datosPendientes as unknown as Pendiente,
        nc: { existenteId: nc.id, claveAcceso: nc.claveAcceso, numeroAutorizacion: aut.numeroAutorizacion, xml: aut.comprobante, fechaAutorizacion: new Date(aut.fechaAutorizacion) } })
      await registrarLog('AUDIT', 'VENTAS', `NC parcial autorizada al consultar (${nc.claveAcceso}): devolución ${ap.numero} $${ap.total.toFixed(2)}`, undefined, sesion.tenantId)
      revalidar()
      return { success: true, numero: ap.numero, total: ap.total }
    }
    const msgs = aut.mensajes?.mensaje || []
    const txt = Array.isArray(msgs) ? msgs.map((m: any) => m.mensaje).join(' | ') : `${msgs.mensaje || aut.estado}`
    await prisma.notaCredito.update({ where: { id: nc.id }, data: { estado: 'RECHAZADA', mensajeError: txt } })
    await registrarLog('ERROR', 'VENTAS', `NC parcial RECHAZADA al consultar (${nc.claveAcceso}): ${txt}`, undefined, sesion.tenantId)
    revalidar()
    return { error: `El SRI rechazó la nota de crédito: ${txt}. No se aplicó la devolución.` }
  } catch (error: any) {
    if (error instanceof ErrorNegocio) return { error: error.message }
    await registrarLog('ERROR', 'VENTAS', `Error consultando NC pendiente: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo consultar la nota de crédito' }
  }
}

function revalidar() {
  revalidatePath('/ventas'); revalidatePath('/productos'); revalidatePath('/dashboard'); revalidatePath('/caja'); revalidatePath('/cobros')
}
