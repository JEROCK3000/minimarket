'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { descifrarSecreto } from '@/lib/security/crypto'
import { consultarRucSRI } from '@/lib/sri/consulta-ruc'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { redondear2 } from '@/lib/ventas/totales'

const proveedorSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es requerido').max(150),
  identificacion: z.string().trim().max(15).regex(/^[0-9A-Za-z-]*$/, 'Identificación inválida').optional().or(z.literal('')),
  telefono: z.string().trim().max(20).optional().or(z.literal('')),
  email: z.string().trim().max(150).email('Correo inválido').optional().or(z.literal('')),
  direccion: z.string().trim().max(300).optional().or(z.literal('')),
})
export type ProveedorValues = z.infer<typeof proveedorSchema>

export async function guardarProveedorAction(id: string | null, data: ProveedorValues) {
  const sesion = await requerirTenant('ADMIN')
  const parsed = proveedorSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  const d = parsed.data
  const campos = {
    nombre: d.nombre, identificacion: d.identificacion || null, telefono: d.telefono || null,
    email: d.email || null, direccion: d.direccion || null,
  }
  try {
    if (id) {
      const actual = await prisma.proveedor.findFirst({ where: { id, tenantId: sesion.tenantId }, select: { id: true } })
      if (!actual) return { error: 'Proveedor no encontrado' }
      await prisma.proveedor.update({ where: { id }, data: campos })
    } else {
      await prisma.proveedor.create({ data: { tenantId: sesion.tenantId, ...campos } })
    }
    await registrarLog('AUDIT', 'PROVEEDORES', `Proveedor ${id ? 'actualizado' : 'creado'}: ${d.nombre}`, undefined, sesion.tenantId)
    revalidatePath('/proveedores')
    revalidatePath('/compras')
    return { success: true }
  } catch (error: any) {
    await registrarLog('ERROR', 'PROVEEDORES', `Error guardando proveedor: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo guardar el proveedor' }
  }
}

/** Desactivar oculta al proveedor en nuevas compras; su historial se conserva. */
export async function cambiarEstadoProveedorAction(id: string, activo: boolean) {
  const sesion = await requerirTenant('ADMIN')
  const p = await prisma.proveedor.findFirst({ where: { id, tenantId: sesion.tenantId }, select: { nombre: true } })
  if (!p) return { error: 'Proveedor no encontrado' }
  await prisma.proveedor.update({ where: { id }, data: { activo: Boolean(activo) } })
  await registrarLog('AUDIT', 'PROVEEDORES', `Proveedor ${activo ? 'activado' : 'desactivado'}: ${p.nombre}`, undefined, sesion.tenantId)
  revalidatePath('/proveedores')
  revalidatePath('/compras')
  return { success: true }
}

export interface CompraDeProveedor { id: string; numero: string; numFactura: string | null; fecha: string; total: number; estado: string }

/** Historial de compras de un proveedor (últimas 100). */
export async function comprasDeProveedorAction(id: string): Promise<{ success: true; compras: CompraDeProveedor[] } | { error: string }> {
  const sesion = await requerirTenant('ADMIN')
  const p = await prisma.proveedor.findFirst({ where: { id, tenantId: sesion.tenantId }, select: { id: true } })
  if (!p) return { error: 'Proveedor no encontrado' }
  const compras = await prisma.compra.findMany({
    where: { tenantId: sesion.tenantId, proveedorId: id },
    orderBy: { fecha: 'desc' }, take: 100,
    select: { id: true, numero: true, numFactura: true, fecha: true, total: true, estado: true },
  })
  return { success: true, compras: compras.map((c) => ({ ...c, fecha: c.fecha.toISOString(), total: Number(c.total) })) }
}

/** Autocompletar el proveedor por su RUC (apiruc, con la key de Configuración). */
export async function consultarRucProveedorAction(ruc: string) {
  const sesion = await requerirTenant('ADMIN')
  const clean = ruc.replace(/\D/g, '')
  if (!/^\d{13}$/.test(clean)) return { error: 'El RUC debe tener 13 dígitos' }
  try {
    const conf = await prisma.config.findFirst({ where: { tenantId: sesion.tenantId, clave: 'ruc_api_key' } })
    const r = await consultarRucSRI(clean, conf?.valor ? descifrarSecreto(conf.valor) : undefined)
    if (!r) return { error: 'RUC no encontrado en el SRI' }
    return { success: true, nombre: r.nombre, direccion: r.direccion }
  } catch (error: any) {
    await registrarLog('WARN', 'PROVEEDORES', `Consulta de RUC fallida: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo consultar el RUC en este momento' }
  }
}

// ─── Cuentas por pagar (compras a crédito) ────────────────────────────────────
export interface CompraPorPagar { id: string; numero: string; numFactura: string | null; fecha: string; total: number; saldo: number; venceEl: string | null; vencida: boolean }
export interface PagoRow { id: string; fecha: string; monto: number; formaPago: string; compra: string; usuario: string | null; notas: string | null }

export async function cuentaProveedorAction(proveedorId: string): Promise<{ success: true; pendientes: CompraPorPagar[]; pagos: PagoRow[] } | { error: string }> {
  const sesion = await requerirTenant('ADMIN')
  const p = await prisma.proveedor.findFirst({ where: { id: proveedorId, tenantId: sesion.tenantId }, select: { id: true } })
  if (!p) return { error: 'Proveedor no encontrado' }
  const [compras, pagos] = await Promise.all([
    prisma.compra.findMany({
      where: { tenantId: sesion.tenantId, proveedorId, estado: 'ACTIVA', saldoPendiente: { gt: 0 } },
      orderBy: { fecha: 'asc' },
      select: { id: true, numero: true, numFactura: true, fecha: true, total: true, saldoPendiente: true, venceEl: true },
    }),
    prisma.pagoCompra.findMany({
      where: { tenantId: sesion.tenantId, proveedorId }, orderBy: { createdAt: 'desc' }, take: 50,
      include: { compra: { select: { numero: true } } },
    }),
  ])
  const ahora = Date.now()
  return {
    success: true,
    pendientes: compras.map((c) => ({
      id: c.id, numero: c.numero, numFactura: c.numFactura, fecha: c.fecha.toISOString(), total: Number(c.total),
      saldo: Number(c.saldoPendiente), venceEl: c.venceEl?.toISOString() ?? null, vencida: !!c.venceEl && c.venceEl.getTime() < ahora,
    })),
    pagos: pagos.map((x) => ({
      id: x.id, fecha: x.createdAt.toISOString(), monto: Number(x.monto), formaPago: x.formaPago,
      compra: x.compra.numero, usuario: x.usuarioNombre, notas: x.notas,
    })),
  }
}

const pagoSchema = z.object({
  proveedorId: z.string().min(1),
  monto: z.coerce.number().positive('El monto debe ser mayor a cero').max(10000000),
  formaPago: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'CHEQUE']),
  notas: z.string().trim().max(200).optional().or(z.literal('')),
})

/**
 * Registra un pago al proveedor y lo reparte entre sus compras a crédito
 * pendientes, de la más antigua a la más nueva (descuento atómico y condicional
 * del saldo). Los pagos en efectivo salen de la caja del período.
 */
export async function pagarProveedorAction(data: { proveedorId: string; monto: number; formaPago: string; notas?: string }) {
  const sesion = await requerirTenant('ADMIN')
  const parsed = pagoSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  const d = parsed.data
  const monto = redondear2(d.monto)
  const prov = await prisma.proveedor.findFirst({ where: { id: d.proveedorId, tenantId: sesion.tenantId }, select: { nombre: true } })
  if (!prov) return { error: 'Proveedor no encontrado' }
  try {
    const r = await prisma.$transaction(async (tx) => {
      const compras = await tx.compra.findMany({
        where: { tenantId: sesion.tenantId, proveedorId: d.proveedorId, estado: 'ACTIVA', saldoPendiente: { gt: 0 } },
        orderBy: { fecha: 'asc' }, select: { id: true, numero: true, saldoPendiente: true },
      })
      const deuda = redondear2(compras.reduce((s, c) => s + Number(c.saldoPendiente), 0))
      if (deuda <= 0) throw new ErrorNegocio('No hay compras pendientes de pago a este proveedor')
      if (monto > deuda) throw new ErrorNegocio(`El monto supera lo que se debe al proveedor ($${deuda.toFixed(2)})`)
      let restante = monto
      const detalle: string[] = []
      for (const c of compras) {
        if (restante <= 0) break
        const aplicar = redondear2(Math.min(restante, Number(c.saldoPendiente)))
        const u = await tx.compra.updateMany({
          where: { id: c.id, tenantId: sesion.tenantId, saldoPendiente: { gte: aplicar } },
          data: { saldoPendiente: { decrement: aplicar } },
        })
        if (u.count === 0) throw new ErrorNegocio('El saldo cambió mientras se registraba el pago. Intenta de nuevo.')
        await tx.pagoCompra.create({
          data: {
            tenantId: sesion.tenantId, compraId: c.id, proveedorId: d.proveedorId, monto: aplicar, formaPago: d.formaPago,
            notas: d.notas || null, usuarioId: sesion.sub, usuarioNombre: sesion.nombre,
          },
        })
        detalle.push(`${c.numero}: ${aplicar.toFixed(2)}`)
        restante = redondear2(restante - aplicar)
      }
      return { detalle, saldoRestante: redondear2(deuda - monto) }
    })
    await registrarLog('AUDIT', 'PROVEEDORES', `Pago de ${monto.toFixed(2)} (${d.formaPago}) a ${prov.nombre} — ${r.detalle.join(', ')}`, undefined, sesion.tenantId)
    revalidatePath('/proveedores')
    revalidatePath('/caja')
    return { success: true, saldoRestante: r.saldoRestante }
  } catch (error: any) {
    if (error instanceof ErrorNegocio) return { error: error.message }
    await registrarLog('ERROR', 'PROVEEDORES', `Error registrando pago: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo registrar el pago' }
  }
}

class ErrorNegocio extends Error {}
