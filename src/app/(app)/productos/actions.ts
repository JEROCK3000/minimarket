'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { guardarImagenProducto, eliminarArchivo, ErrorImagen } from '@/lib/productos/imagenes'
import { bloqueoPorSuscripcion, limiteDelPlan } from '@/lib/saas/suscripcion'

const productoSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es requerido').max(150),
  codigoBarras: z.string().trim().max(50).optional().or(z.literal('')),
  codigoBalanza: z.string().trim().regex(/^\d{1,6}$/, 'El código de balanza son de 1 a 6 dígitos').optional().or(z.literal('')),
  categoriaId: z.string().trim().optional().or(z.literal('')),
  precioCompra: z.coerce.number().min(0, 'No puede ser negativo').max(999999),
  precioVenta: z.coerce.number().min(0, 'No puede ser negativo').max(999999),
  // Solo tarifas que el SRI acepta (ver lib/sri/impuestos.ts)
  ivaPorcentaje: z.coerce.number().refine((v) => [0, 5, 12, 13, 14, 15].includes(v), 'Tarifa de IVA no válida para el SRI'),
  stock: z.coerce.number().min(0).max(9999999),
  stockMinimo: z.coerce.number().min(0).max(9999999),
  unidad: z.string().trim().max(20).default('unidad'),
})

// El formulario envía todos los campos como strings; zod los coacciona.
export interface ProductoFormValues {
  nombre: string
  codigoBarras?: string
  codigoBalanza?: string
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
  {
    const bloqueo = (await bloqueoPorSuscripcion(sesion.tenantId)) ?? (await limiteDelPlan(sesion.tenantId, 'productos'))
    if (bloqueo) return { error: bloqueo }
  }
  const parsed = productoSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  }
  const d = parsed.data
  if (d.codigoBarras && await codigoEnPresentacion(sesion.tenantId, d.codigoBarras)) return { error: 'Ese código de barras ya es de una presentación (six-pack, caja…)' }

  try {
    const producto = await prisma.producto.create({
      data: {
        tenantId: sesion.tenantId,
        nombre: d.nombre,
        codigoBarras: d.codigoBarras || null,
        codigoBalanza: d.codigoBalanza ? d.codigoBalanza.replace(/^0+(?=\d)/, '') : null, // sin ceros a la izquierda: '00123' = '123'
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
    return { success: true, id: producto.id }
  } catch (error: any) {
    if (error.code === 'P2002') return { error: String(error.meta?.target ?? '').includes('Balanza') ? 'Ya existe un producto con ese código de balanza' : 'Ya existe un producto con ese código de barras' }
    await registrarLog('ERROR', 'PRODUCTOS', `Error creando producto: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo crear el producto' }
  }
}

// ─── Actualizar ─────────────────────────────────────────────────────────────
export async function actualizarProductoAction(id: string, data: ProductoFormValues) {
  const sesion = await requerirTenant('ADMIN')
  {
    const bloqueo = await bloqueoPorSuscripcion(sesion.tenantId)
    if (bloqueo) return { error: bloqueo }
  }
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
    if (d.codigoBarras && await codigoEnPresentacion(sesion.tenantId, d.codigoBarras)) return { error: 'Ese código de barras ya es de una presentación (six-pack, caja…)' }

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

    // Historial de precios: solo si cambió el precio de venta.
    if (Math.abs(Number(actual.precioVenta) - d.precioVenta) > 0.00005) {
      await prisma.historialPrecio.create({
        data: { tenantId: sesion.tenantId, productoId: id, precioAnterior: actual.precioVenta, precioNuevo: d.precioVenta, origen: 'EDICION', usuarioNombre: sesion.nombre },
      })
    }
    await prisma.producto.update({
      where: { id },
      data: {
        nombre: d.nombre,
        codigoBarras: d.codigoBarras || null,
        codigoBalanza: d.codigoBalanza ? d.codigoBalanza.replace(/^0+(?=\d)/, '') : null, // sin ceros a la izquierda: '00123' = '123'
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
    if (error.code === 'P2002') return { error: String(error.meta?.target ?? '').includes('Balanza') ? 'Ya existe un producto con ese código de balanza' : 'Ya existe un producto con ese código de barras' }
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

// ─── Gestión de categorías ────────────────────────────────────────────────────
export interface CategoriaAdmin { id: string; nombre: string; icono: string | null; activo: boolean; productos: number }

export async function listarCategoriasAction(): Promise<CategoriaAdmin[]> {
  const sesion = await requerirTenant('ADMIN')
  const cats = await prisma.categoria.findMany({
    where: { tenantId: sesion.tenantId },
    include: { _count: { select: { productos: { where: { activo: true } } } } },
    orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
  })
  return cats.map((c) => ({ id: c.id, nombre: c.nombre, icono: c.icono, activo: c.activo, productos: c._count.productos }))
}

const categoriaSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es requerido').max(100),
  icono: z.string().trim().max(8).optional().or(z.literal('')),
  activo: z.boolean(),
})

export async function actualizarCategoriaAction(id: string, data: { nombre: string; icono?: string; activo: boolean }) {
  const sesion = await requerirTenant('ADMIN')
  const parsed = categoriaSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  const cat = await prisma.categoria.findFirst({ where: { id, tenantId: sesion.tenantId }, select: { id: true } })
  if (!cat) return { error: 'Categoría no encontrada' }
  try {
    await prisma.categoria.update({
      where: { id },
      data: { nombre: parsed.data.nombre, icono: parsed.data.icono || null, activo: parsed.data.activo },
    })
    await registrarLog('AUDIT', 'PRODUCTOS', `Categoría actualizada: ${parsed.data.nombre}${parsed.data.activo ? '' : ' (desactivada)'}`, undefined, sesion.tenantId)
    revalidatePath('/productos')
    return { success: true }
  } catch (error: any) {
    if (error.code === 'P2002') return { error: 'Ya existe una categoría con ese nombre' }
    return { error: 'No se pudo actualizar la categoría' }
  }
}

// ─── Imagen del producto ──────────────────────────────────────────────────────
/** Sube (o reemplaza) la imagen de un producto. Solo ADMIN. Validación y re-codificación en lib/productos/imagenes.ts. */
export async function subirImagenProductoAction(productoId: string, formData: FormData) {
  const sesion = await requerirTenant('ADMIN')
  const archivo = formData.get('imagen')
  if (!(archivo instanceof File)) return { error: 'Selecciona una imagen' }
  const producto = await prisma.producto.findFirst({ where: { id: productoId, tenantId: sesion.tenantId }, select: { id: true, nombre: true, imagen: true } })
  if (!producto) return { error: 'Producto no encontrado' }
  try {
    const nombre = await guardarImagenProducto(sesion.tenantId, producto.id, Buffer.from(await archivo.arrayBuffer()), producto.imagen)
    await prisma.producto.update({ where: { id: producto.id }, data: { imagen: nombre } })
    await registrarLog('AUDIT', 'PRODUCTOS', `Imagen actualizada: ${producto.nombre}`, undefined, sesion.tenantId)
    revalidatePath('/productos')
    revalidatePath('/pos')
    return { success: true, imagen: nombre }
  } catch (error: any) {
    if (error instanceof ErrorImagen) return { error: error.message }
    await registrarLog('ERROR', 'PRODUCTOS', `Error subiendo imagen: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo guardar la imagen' }
  }
}

export async function quitarImagenProductoAction(productoId: string) {
  const sesion = await requerirTenant('ADMIN')
  const producto = await prisma.producto.findFirst({ where: { id: productoId, tenantId: sesion.tenantId }, select: { id: true, imagen: true } })
  if (!producto) return { error: 'Producto no encontrado' }
  if (producto.imagen) await eliminarArchivo(sesion.tenantId, producto.imagen)
  await prisma.producto.update({ where: { id: producto.id }, data: { imagen: null } })
  revalidatePath('/productos')
  revalidatePath('/pos')
  return { success: true }
}

/** ¿El código de barras ya lo usa una presentación activa del negocio? */
async function codigoEnPresentacion(tenantId: string, codigo: string) {
  return !!(await prisma.productoPresentacion.findFirst({ where: { tenantId, codigoBarras: codigo, activo: true }, select: { id: true } }))
}
