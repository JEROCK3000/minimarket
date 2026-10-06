/**
 * Cálculo del estado de caja (solo servidor). NO es un archivo 'use server':
 * estas funciones reciben tenantId y no deben exponerse como server actions
 * (el navegador podría invocarlas con el tenantId de otro minimarket). Las
 * llaman las páginas y acciones después de requerirTenant().
 */
import { prisma } from '@/lib/db/prisma'

/**
 * Varias cajas: si el negocio definió cajas (Configuración → Operación), cada
 * usuario abre la suya y todo lo que registra (ventas, gastos, cobros, pagos,
 * devoluciones, retiros) queda con el `aperturaId` de su caja. Sin cajas
 * definidas funciona como siempre: una sola caja para todos.
 */
export async function usaVariasCajas(tenantId: string) {
  return (await prisma.caja.count({ where: { tenantId, activa: true } })) > 0
}

/**
 * Filtro de registros de una caja: los que llevan su aperturaId y, en modo una
 * sola caja, también los anteriores a esta función (sin aperturaId) del período.
 */
function filtroCaja(aperturaId: string | null, campoFecha: 'fecha' | 'createdAt', desde: Date, hasta: Date, incluirSinCaja: boolean) {
  const rango = { [campoFecha]: { gte: desde, lte: hasta } }
  if (!aperturaId) return rango
  return incluirSinCaja ? { OR: [{ aperturaId }, { aperturaId: null, ...rango }] } : { aperturaId }
}

/**
 * Calcula el resumen de caja de un período (o de una apertura), sumando el
 * fondo inicial al efectivo esperado.
 */
export async function obtenerResumenCaja(tenantId: string, desde: Date, hasta: Date, fondoInicial = 0, aperturaId: string | null = null, incluirSinCaja = true) {
  const fv = filtroCaja(aperturaId, 'fecha', desde, hasta, incluirSinCaja)
  const fc = filtroCaja(aperturaId, 'createdAt', desde, hasta, incluirSinCaja)
  const [ventas, gastos, abonos, pagosProv, movimientos, devoluciones] = await Promise.all([
    prisma.venta.findMany({
      where: { tenantId, estado: 'COMPLETADA', ...fv },
      select: { formaPago: true, total: true },
    }),
    prisma.gasto.aggregate({
      where: { tenantId, ...fv },
      _sum: { monto: true },
    }),
    // Cobros de fiado recibidos en el período (el efectivo entra a la caja).
    prisma.abonoVenta.groupBy({
      by: ['formaPago'],
      where: { tenantId, ...fc },
      _sum: { monto: true },
    }),
    // Pagos a proveedores en efectivo (compras a crédito): salen de la caja.
    prisma.pagoCompra.aggregate({
      where: { tenantId, formaPago: 'EFECTIVO', ...fc },
      _sum: { monto: true },
    }),
    // Retiros e ingresos de efectivo durante el turno.
    prisma.movimientoCaja.findMany({
      where: { tenantId, ...fc },
      orderBy: { createdAt: 'asc' },
      select: { id: true, tipo: true, monto: true, motivo: true, usuarioNombre: true, createdAt: true },
    }),
    // Devoluciones a clientes en el período (el efectivo sale de la caja).
    prisma.devolucion.groupBy({
      by: ['formaReembolso'],
      where: { tenantId, ...fc },
      _sum: { total: true },
    }),
  ])

  let efectivo = 0, tarjeta = 0, transfer = 0, credito = 0
  for (const v of ventas) {
    const t = Number(v.total)
    if (v.formaPago === 'EFECTIVO') efectivo += t
    else if (v.formaPago === 'TARJETA') tarjeta += t
    else if (v.formaPago === 'CREDITO') credito += t // fiado: no entra dinero ahora
    else transfer += t
  }
  const totalVendido = efectivo + tarjeta + transfer + credito
  const abonosEfectivo = Number(abonos.find((a) => a.formaPago === 'EFECTIVO')?._sum.monto ?? 0)
  const pagosProveedorEfectivo = Number(pagosProv._sum.monto ?? 0)
  const abonosOtros = abonos.filter((a) => a.formaPago !== 'EFECTIVO').reduce((s, a) => s + Number(a._sum.monto ?? 0), 0)
  const gastosEfectivo = Number(gastos._sum.monto ?? 0)
  const sumaMov = (t: string) => movimientos.filter((m) => m.tipo === t).reduce((s, m) => s + Number(m.monto), 0)
  const ingresosEfectivo = sumaMov('INGRESO')
  const retirosEfectivo = sumaMov('RETIRO')
  const devolucionesEfectivo = Number(devoluciones.find((d) => d.formaReembolso === 'EFECTIVO')?._sum.total ?? 0)
  const devolucionesTotal = devoluciones.reduce((s, d) => s + Number(d._sum.total ?? 0), 0)

  return {
    totalVentas: ventas.length,
    ventasEfectivo: efectivo,
    ventasTarjeta: tarjeta,
    ventasTransfer: transfer,
    ventasCredito: credito,
    totalVendido,
    abonosEfectivo,
    abonosOtros,
    pagosProveedorEfectivo,
    gastosEfectivo,
    fondoInicial,
    ingresosEfectivo,
    retirosEfectivo,
    devolucionesEfectivo,
    devolucionesTotal,
    movimientos: movimientos.map((m) => ({ id: m.id, tipo: m.tipo, monto: Number(m.monto), motivo: m.motivo, usuario: m.usuarioNombre, fecha: m.createdAt.toISOString() })),
    efectivoEsperado: fondoInicial + efectivo + abonosEfectivo + ingresosEfectivo - gastosEfectivo - pagosProveedorEfectivo - retirosEfectivo - devolucionesEfectivo,
  }
}

/**
 * Apertura (caja abierta) que corresponde a un usuario:
 *   - varias cajas: la que ESE usuario abrió;
 *   - una sola caja: la apertura abierta del negocio (cualquiera la abrió).
 */
export async function aperturaDeUsuario(tenantId: string, usuarioId: string) {
  const varias = await usaVariasCajas(tenantId)
  return prisma.aperturaCaja.findFirst({
    where: { tenantId, cerradaAt: null, ...(varias ? { usuarioId } : {}) },
    orderBy: { abiertaAt: 'desc' },
  })
}

/**
 * Estado de una caja para el arqueo:
 *   - con `aperturaId`: esa apertura (varias cajas, el ADMIN revisando otra);
 *   - si no, la del usuario (o la única, en modo una caja);
 *   - una sola caja sin apertura: desde el último cierre o desde hoy.
 */
export async function obtenerEstadoCaja(tenantId: string, usuarioId?: string, aperturaId?: string) {
  const varias = await usaVariasCajas(tenantId)
  const apertura = aperturaId
    ? await prisma.aperturaCaja.findFirst({ where: { id: aperturaId, tenantId, cerradaAt: null } })
    : usuarioId ? await aperturaDeUsuario(tenantId, usuarioId)
    : await prisma.aperturaCaja.findFirst({ where: { tenantId, cerradaAt: null, ...(varias ? { id: '__ninguna__' } : {}) }, orderBy: { abiertaAt: 'desc' } })
  const ultimoCierre = apertura || varias ? null : await prisma.cierreCaja.findFirst({ where: { tenantId }, orderBy: { hasta: 'desc' }, select: { hasta: true } })
  const inicioHoy = new Date(); inicioHoy.setHours(0, 0, 0, 0)
  const desde = apertura?.abiertaAt ?? ultimoCierre?.hasta ?? inicioHoy
  const fondo = apertura ? Number(apertura.fondoInicial) : 0
  // Varias cajas sin caja propia abierta: resumen vacío (no mezclar las de otros)
  const resumen = await obtenerResumenCaja(tenantId, desde, new Date(), fondo, apertura?.id ?? (varias ? '__sin_caja__' : null), !varias)
  return {
    desde,
    varias,
    origenDesde: apertura ? 'APERTURA' as const : ultimoCierre ? 'ULTIMO_CIERRE' as const : 'HOY' as const,
    apertura: apertura
      ? { id: apertura.id, usuario: apertura.usuarioNombre ?? '—', usuarioId: apertura.usuarioId, caja: apertura.cajaNombre, fondoInicial: fondo, abiertaAt: apertura.abiertaAt.toISOString() }
      : null,
    resumen,
  }
}

/** Apertura de caja vigente para vender: la del usuario (varias cajas) o la única. */
export async function cajaAbierta(tenantId: string, usuarioId?: string) {
  if (usuarioId) return aperturaDeUsuario(tenantId, usuarioId)
  return prisma.aperturaCaja.findFirst({
    where: { tenantId, cerradaAt: null },
    orderBy: { abiertaAt: 'desc' },
    select: { id: true, usuarioNombre: true, fondoInicial: true, abiertaAt: true },
  })
}
