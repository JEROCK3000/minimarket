/**
 * Cálculo del estado de caja (solo servidor). NO es un archivo 'use server':
 * estas funciones reciben tenantId y no deben exponerse como server actions
 * (el navegador podría invocarlas con el tenantId de otro minimarket). Las
 * llaman las páginas y acciones después de requerirTenant().
 */
import { prisma } from '@/lib/db/prisma'

/** Calcula el resumen de caja de un período, sumando el fondo inicial al efectivo esperado. */
export async function obtenerResumenCaja(tenantId: string, desde: Date, hasta: Date, fondoInicial = 0) {
  const [ventas, gastos, abonos, pagosProv] = await Promise.all([
    prisma.venta.findMany({
      where: { tenantId, estado: 'COMPLETADA', fecha: { gte: desde, lte: hasta } },
      select: { formaPago: true, total: true },
    }),
    prisma.gasto.aggregate({
      where: { tenantId, fecha: { gte: desde, lte: hasta } },
      _sum: { monto: true },
    }),
    // Cobros de fiado recibidos en el período (el efectivo entra a la caja).
    prisma.abonoVenta.groupBy({
      by: ['formaPago'],
      where: { tenantId, createdAt: { gte: desde, lte: hasta } },
      _sum: { monto: true },
    }),
    // Pagos a proveedores en efectivo (compras a crédito): salen de la caja.
    prisma.pagoCompra.aggregate({
      where: { tenantId, formaPago: 'EFECTIVO', createdAt: { gte: desde, lte: hasta } },
      _sum: { monto: true },
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
    efectivoEsperado: fondoInicial + efectivo + abonosEfectivo - gastosEfectivo - pagosProveedorEfectivo,
  }
}

/**
 * Período de caja actual:
 *   - desde la apertura abierta (con su fondo inicial), si la hay;
 *   - si no, desde el último cierre (así dos cierres el mismo día no cuentan dos veces);
 *   - si nunca hubo cierre, desde el inicio de hoy.
 */
export async function obtenerEstadoCaja(tenantId: string) {
  const [apertura, ultimoCierre] = await Promise.all([
    prisma.aperturaCaja.findFirst({ where: { tenantId, cerradaAt: null }, orderBy: { abiertaAt: 'desc' } }),
    prisma.cierreCaja.findFirst({ where: { tenantId }, orderBy: { hasta: 'desc' }, select: { hasta: true } }),
  ])
  const inicioHoy = new Date(); inicioHoy.setHours(0, 0, 0, 0)
  const desde = apertura?.abiertaAt ?? ultimoCierre?.hasta ?? inicioHoy
  const fondo = apertura ? Number(apertura.fondoInicial) : 0
  const resumen = await obtenerResumenCaja(tenantId, desde, new Date(), fondo)
  return {
    desde,
    origenDesde: apertura ? 'APERTURA' as const : ultimoCierre ? 'ULTIMO_CIERRE' as const : 'HOY' as const,
    apertura: apertura
      ? { id: apertura.id, usuario: apertura.usuarioNombre ?? '—', fondoInicial: fondo, abiertaAt: apertura.abiertaAt.toISOString() }
      : null,
    resumen,
  }
}
