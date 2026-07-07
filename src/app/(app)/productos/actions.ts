'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const productoSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es requerido').max(150),
  codigoBarras: z.string().trim().max(50).optional().or(z.literal('')),
  categoriaId: z.string().trim().optional().or(z.literal('')),
  precioCompra: z.coerce.number().min(0, 'No puede ser negativo').max(999999),
  precioVenta: z.coerce.number().min(0, 'No puede ser negativo').max(999999),
  ivaPorcentaje: z.coerce.number().min(0).max(100),
  stock: z.coerce.number().min(0).max(9999999),
  stockMinimo: z.coerce.number().min(0).max(9999999),
  unidad: z.string().trim().max(20).default('unidad'),
})

// El formulario envía todos los campos como strings; zod los coacciona.
export interface ProductoFormValues {
  nombre: string
  codigoBarras?: string
  categoriaId?: string
  precioCompra: string
  precioVenta: string
  ivaPorcentaje: string
  stock: string
  stockMinimo: string
  unidad?: string
}

// ─── Crear ────────────────────────────────────────────────────────────────────
export async function crearProductoAction(data: ProductoFormValues) {
  const sesion = await requerirTenant('ADMIN')
  const parsed = productoSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  }
  const d = parsed.data

  try {
    const producto = await prisma.producto.create({
      data: {
        tenantId: sesion.tenantId,
        nombre: d.nombre,
        codigoBarras: d.codigoBarras || null,
        categoriaId: d.categoriaId || null,
        precioCompra: d.precioCompra,
        precioVenta: d.precioVenta,
        ivaPorcentaje: d.ivaPorcentaje,
        stock: d.stock,
        stockMinimo: d.stockMinimo,
        unidad: d.unidad,
      },
    })

    // Kardex: stock inicial como movimiento de ajuste
    if (d.stock > 0) {
      await prisma.movimientoInventario.create({
        data: {
          tenantId: sesion.tenantId,
          productoId: producto.id,
          tipo: 'AJUSTE',
          cantidad: d.stock,
          stockPrevio: 0,
          stockNuevo: d.stock,
          motivo: 'Stock inicial',
        },
      })
    }

    await registrarLog('AUDIT', 'PRODUCTOS', `Producto creado: ${d.nombre}`, undefined, sesion.tenantId)
    revalidatePath('/productos')
    return { success: true }
  } catch (error: any) {
    if (error.code === 'P2002') return { error: 'Ya existe un producto con ese código de barras' }
    await registrarLog('ERROR', 'PRODUCTOS', `Error creando producto: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo crear el producto' }
  }
}

// ─── Actualizar ─────────────────────────────────────────────────────────────
export async function actualizarProductoAction(id: string, data: ProductoFormValues) {
  const sesion = await requerirTenant('ADMIN')
  const parsed = productoSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  }
  const d = parsed.data

  try {
    // Verificar propiedad: el producto debe pertenecer al tenant de la sesión
    const actual = await prisma.producto.findFirst({
      where: { id, tenantId: sesion.tenantId },
    })
    if (!actual) return { error: 'Producto no encontrado' }

    // Si cambió el stock manualmente, registrar ajuste en kardex
    const stockPrevio = Number(actual.stock)
    if (stockPrevio !== d.stock) {
      await prisma.movimientoInventario.create({
        data: {
          tenantId: sesion.tenantId,
          productoId: id,
          tipo: 'AJUSTE',
          cantidad: d.stock - stockPrevio,
          stockPrevio,
          stockNuevo: d.stock,
          motivo: 'Ajuste manual de stock',
        },
      })
    }

    await prisma.producto.update({
      where: { id },
      data: {
        nombre: d.nombre,
        codigoBarras: d.codigoBarras || null,
        categoriaId: d.categoriaId || null,
        precioCompra: d.precioCompra,
        precioVenta: d.precioVenta,
        ivaPorcentaje: d.ivaPorcentaje,
        stock: d.stock,
        stockMinimo: d.stockMinimo,
        unidad: d.unidad,
      },
    })

    await registrarLog('AUDIT', 'PRODUCTOS', `Producto actualizado: ${d.nombre}`, undefined, sesion.tenantId)
    revalidatePath('/productos')
    return { success: true }
  } catch (error: any) {
    if (error.code === 'P2002') return { error: 'Ya existe un producto con ese código de barras' }
    await registrarLog('ERROR', 'PRODUCTOS', `Error actualizando producto: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo actualizar el producto' }
  }
}

// ─── Desactivar (soft delete) ─────────────────────────────────────────────────
export async function desactivarProductoAction(id: string) {
  const sesion = await requerirTenant('ADMIN')
  try {
    const actual = await prisma.producto.findFirst({ where: { id, tenantId: sesion.tenantId } })
    if (!actual) return { error: 'Producto no encontrado' }

    await prisma.producto.update({ where: { id }, data: { activo: false } })
    await registrarLog('AUDIT', 'PRODUCTOS', `Producto desactivado: ${actual.nombre}`, undefined, sesion.tenantId)
    revalidatePath('/productos')
    return { success: true }
  } catch (error: any) {
    await registrarLog('ERROR', 'PRODUCTOS', `Error desactivando producto: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo desactivar el producto' }
  }
}

// ─── Crear categoría (rápida, desde el formulario de producto) ────────────────
export async function crearCategoriaAction(nombre: string) {
  const sesion = await requerirTenant('ADMIN')
  const limpio = nombre.trim()
  if (!limpio || limpio.length > 100) return { error: 'Nombre de categoría inválido' }
  try {
    const cat = await prisma.categoria.create({
      data: { tenantId: sesion.tenantId, nombre: limpio },
    })
    revalidatePath('/productos')
    return { success: true, id: cat.id, nombre: cat.nombre }
  } catch (error: any) {
    if (error.code === 'P2002') return { error: 'Esa categoría ya existe' }
    return { error: 'No se pudo crear la categoría' }
  }
}
