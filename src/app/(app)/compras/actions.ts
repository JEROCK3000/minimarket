'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

// ─── Proveedores ──────────────────────────────────────────────────────────────
const proveedorSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es requerido').max(150),
  identificacion: z.string().trim().max(15).optional().or(z.literal('')),
  telefono: z.string().trim().max(20).optional().or(z.literal('')),
  email: z.string().trim().max(150).optional().or(z.literal('')),
  direccion: z.string().trim().max(300).optional().or(z.literal('')),
})
export type ProveedorFormValues = z.infer<typeof proveedorSchema>

export async function crearProveedorAction(data: ProveedorFormValues) {
  const sesion = await requerirTenant('ADMIN')
  const parsed = proveedorSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  const d = parsed.data
  try {
    const prov = await prisma.proveedor.create({
      data: {
        tenantId: sesion.tenantId,
        nombre: d.nombre,
        identificacion: d.identificacion || null,
        telefono: d.telefono || null,
        email: d.email || null,
        direccion: d.direccion || null,
      },
    })
    await registrarLog('AUDIT', 'COMPRAS', `Proveedor creado: ${d.nombre}`, undefined, sesion.tenantId)
    revalidatePath('/compras')
    return { success: true, id: prov.id, nombre: prov.nombre }
  } catch (error: any) {
    await registrarLog('ERROR', 'COMPRAS', `Error creando proveedor: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo crear el proveedor' }
  }
}

// ─── Compras ──────────────────────────────────────────────────────────────────
const compraSchema = z.object({
  proveedorId: z.string().trim().optional().or(z.literal('')),
  numFactura: z.string().trim().max(40).optional().or(z.literal('')),
  notas: z.string().trim().max(500).optional().or(z.literal('')),
  items: z.array(z.object({
    productoId: z.string().min(1),
    cantidad: z.coerce.number().positive('Cantidad inválida'),
    precioUnitario: z.coerce.number().min(0),
  })).min(1, 'Agrega al menos un producto'),
})
export interface CompraFormValues {
  proveedorId?: string
  numFactura?: string
  notas?: string
  items: { productoId: string; cantidad: number; precioUnitario: number }[]
}

export async function crearCompraAction(data: CompraFormValues) {
  const sesion = await requerirTenant('ADMIN')
  const parsed = compraSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  const d = parsed.data

  try {
    // Validar que todos los productos pertenecen al tenant
    const ids = d.items.map((i) => i.productoId)
    const productos = await prisma.producto.findMany({
      where: { id: { in: ids }, tenantId: sesion.tenantId },
    })
    if (productos.length !== new Set(ids).size) {
      return { error: 'Uno o más productos no son válidos' }
    }
    const mapProd = new Map(productos.map((p) => [p.id, p]))

    // Correlativo de compra
    const count = await prisma.compra.count({ where: { tenantId: sesion.tenantId } })
    const numero = `COM-${String(count + 1).padStart(5, '0')}`

    let subtotal = 0
    let iva = 0
    for (const it of d.items) {
      const prod = mapProd.get(it.productoId)!
      const sub = it.cantidad * it.precioUnitario
      subtotal += sub
      iva += sub * (Number(prod.ivaPorcentaje) / 100)
    }
    const total = subtotal + iva

    // Transacción: compra + items + actualización de stock + kardex + precio compra
    await prisma.$transaction(async (tx) => {
      const compra = await tx.compra.create({
        data: {
          tenantId: sesion.tenantId,
          proveedorId: d.proveedorId || null,
          numero,
          numFactura: d.numFactura || null,
          notas: d.notas || null,
          subtotal,
          iva,
          total,
          items: {
            create: d.items.map((it) => ({
              productoId: it.productoId,
              cantidad: it.cantidad,
              precioUnitario: it.precioUnitario,
              subtotal: it.cantidad * it.precioUnitario,
            })),
          },
        },
      })

      for (const it of d.items) {
        const prod = mapProd.get(it.productoId)!
        const stockPrevio = Number(prod.stock)
        const stockNuevo = stockPrevio + it.cantidad
        await tx.producto.update({
          where: { id: it.productoId },
          data: { stock: stockNuevo, precioCompra: it.precioUnitario },
        })
        await tx.movimientoInventario.create({
          data: {
            tenantId: sesion.tenantId,
            productoId: it.productoId,
            tipo: 'COMPRA',
            cantidad: it.cantidad,
            stockPrevio,
            stockNuevo,
            motivo: `Compra ${compra.numero}`,
          },
        })
      }
    })

    await registrarLog('AUDIT', 'COMPRAS', `Compra registrada: ${numero} (total ${total.toFixed(2)})`, undefined, sesion.tenantId)
    revalidatePath('/compras')
    revalidatePath('/productos')
    return { success: true, numero }
  } catch (error: any) {
    await registrarLog('ERROR', 'COMPRAS', `Error registrando compra: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo registrar la compra' }
  }
}
