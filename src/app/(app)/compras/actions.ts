'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { moverStock } from '@/lib/inventario/movimientos'

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
    fechaVencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de vencimiento inválida').optional().or(z.literal('')),
  })).min(1, 'Agrega al menos un producto'),
})
export interface CompraFormValues {
  proveedorId?: string
  numFactura?: string
  notas?: string
  items: { productoId: string; cantidad: number; precioUnitario: number; fechaVencimiento?: string }[]
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
              // Mediodía UTC: la columna es DATE y así no se corre de día por zona horaria.
              fechaVencimiento: it.fechaVencimiento ? new Date(`${it.fechaVencimiento}T12:00:00Z`) : null,
            })),
          },
        },
      })

      for (const it of d.items) {
        await moverStock(tx, {
          tenantId: sesion.tenantId, productoId: it.productoId,
          cantidad: it.cantidad, tipo: 'COMPRA', motivo: `Compra ${compra.numero}`,
          precioCompra: it.precioUnitario,
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

// ─── Detalle y anulación ──────────────────────────────────────────────────────
export interface CompraDetalle {
  id: string
  numero: string
  numFactura: string | null
  fecha: string
  estado: string
  anuladaAt: string | null
  motivoAnulacion: string | null
  notas: string | null
  proveedor: { nombre: string; identificacion: string | null; telefono: string | null } | null
  items: { productoId: string; nombre: string; unidad: string; cantidad: number; precioUnitario: number; subtotal: number; ivaPorcentaje: number; fechaVencimiento: string | null }[]
  subtotal: number
  iva: number
  total: number
}

export async function obtenerCompraAction(id: string): Promise<{ success: true; compra: CompraDetalle } | { error: string }> {
  const sesion = await requerirTenant()
  const c = await prisma.compra.findFirst({
    where: { id, tenantId: sesion.tenantId },
    include: {
      proveedor: { select: { nombre: true, identificacion: true, telefono: true } },
      items: { include: { producto: { select: { nombre: true, unidad: true, ivaPorcentaje: true } } } },
    },
  })
  if (!c) return { error: 'Compra no encontrada' }
  return {
    success: true,
    compra: {
      id: c.id, numero: c.numero, numFactura: c.numFactura, fecha: c.fecha.toISOString(),
      estado: c.estado, anuladaAt: c.anuladaAt?.toISOString() ?? null, motivoAnulacion: c.motivoAnulacion, notas: c.notas,
      proveedor: c.proveedor,
      items: c.items.map((it) => ({
        productoId: it.productoId, nombre: it.producto.nombre, unidad: it.producto.unidad,
        cantidad: Number(it.cantidad), precioUnitario: Number(it.precioUnitario), subtotal: Number(it.subtotal),
        ivaPorcentaje: Number(it.producto.ivaPorcentaje),
        fechaVencimiento: it.fechaVencimiento ? it.fechaVencimiento.toISOString().slice(0, 10) : null,
      })),
      subtotal: Number(c.subtotal), iva: Number(c.iva), total: Number(c.total),
    },
  }
}

const anularCompraSchema = z.object({
  id: z.string().min(1),
  motivo: z.string().trim().min(5, 'Indica el motivo (mínimo 5 caracteres)').max(300),
})

/**
 * Anula una compra registrada por error: retira del inventario lo que esa compra
 * ingresó (kardex AJUSTE) y la marca ANULADA (no se borra, queda la trazabilidad).
 * Si parte de la mercadería ya se vendió, el stock quedaría negativo: se bloquea
 * y se indica registrar un ajuste/merma en su lugar. El precio de compra de los
 * productos no se revierte (no se guarda el costo anterior).
 */
export async function anularCompraAction(id: string, motivo: string) {
  const sesion = await requerirTenant('ADMIN')
  const parsed = anularCompraSchema.safeParse({ id, motivo })
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }

  const compra = await prisma.compra.findFirst({
    where: { id, tenantId: sesion.tenantId },
    include: { items: { include: { producto: { select: { nombre: true } } } } },
  })
  if (!compra) return { error: 'Compra no encontrada' }
  if (compra.estado === 'ANULADA') return { error: 'La compra ya está anulada' }

  try {
    await prisma.$transaction(async (tx) => {
      // Marcar primero, condicionado: dos anulaciones simultáneas no restan dos veces.
      const marcada = await tx.compra.updateMany({
        where: { id, tenantId: sesion.tenantId, estado: 'ACTIVA' },
        data: { estado: 'ANULADA', anuladaAt: new Date(), motivoAnulacion: parsed.data.motivo },
      })
      if (marcada.count === 0) throw new ErrorNegocio('La compra ya está anulada')

      for (const it of compra.items) {
        const { stockNuevo } = await moverStock(tx, {
          tenantId: sesion.tenantId, productoId: it.productoId,
          cantidad: -Number(it.cantidad), tipo: 'AJUSTE', motivo: `Anulación compra ${compra.numero}`,
        })
        if (stockNuevo < 0) {
          throw new ErrorNegocio(
            `No se puede anular: de "${it.producto.nombre}" ya no queda todo lo que ingresó esta compra ` +
            `(el stock quedaría en ${stockNuevo}). Registra un ajuste o merma en su lugar.`,
          )
        }
      }
    })
  } catch (error: any) {
    if (error instanceof ErrorNegocio) return { error: error.message }
    await registrarLog('ERROR', 'COMPRAS', `Error anulando compra: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo anular la compra' }
  }

  await registrarLog('AUDIT', 'COMPRAS', `Compra ANULADA: ${compra.numero} — ${parsed.data.motivo}`, undefined, sesion.tenantId)
  revalidatePath('/compras')
  revalidatePath('/productos')
  return { success: true }
}

/** Error con mensaje apto para el usuario (reglas de negocio). */
class ErrorNegocio extends Error {}
