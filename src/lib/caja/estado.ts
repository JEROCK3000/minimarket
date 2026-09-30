/**
 * Cálculo del estado de caja (solo servidor). NO es un archivo 'use server':
 * estas funciones reciben tenantId y no deben exponerse como server actions
 * (el navegador podría invocarlas con el tenantId de otro minimarket). Las
 * llaman las páginas y acciones después de requerirTenant().
 */
import { prisma } from '@/lib/db/prisma'

/** Calcula el resumen de caja de un período, sumando el fondo inicial al efectivo esperado. */
export async function obtenerResumenCaja(tenantId: string, desde: Date, hasta: Date, fondoInicial = 0) {
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
    fondoInicial,
    efectivoEsperado: fondoInicial + efectivo - gastosEfectivo,
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
