'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { descifrarSecreto } from '@/lib/security/crypto'
import { consultarRucSRI } from '@/lib/sri/consulta-ruc'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

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
