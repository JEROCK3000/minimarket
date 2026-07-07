'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const ventaSchema = z.object({
  clienteId: z.string().optional().or(z.literal('')),
  formaPago: z.enum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA']),
  requiereFactura: z.boolean(),
  pagoCon: z.coerce.number().min(0).optional(),
  descuento: z.coerce.number().min(0).default(0),
  items: z.array(z.object({
    productoId: z.string().min(1),
    cantidad: z.coerce.number().positive(),
  })).min(1, 'El carrito está vacío'),
})

export interface VentaFormValues {
  clienteId?: string
  formaPago: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA'
  requiereFactura: boolean
  pagoCon?: number
  descuento?: number
  items: { productoId: string; cantidad: number }[]
}

export async function registrarVentaAction(data: VentaFormValues) {
  // Cajeros (USER) también venden: requiere sesión con tenant, sin exigir ADMIN
  const sesion = await requerirTenant()
  const parsed = ventaSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  const d = parsed.data

  try {
    // Cargar productos del tenant y validar stock
    const ids = d.items.map((i) => i.productoId)
    const productos = await prisma.producto.findMany({
      where: { id: { in: ids }, tenantId: sesion.tenantId, activo: true },
    })
    if (productos.length !== new Set(ids).size) return { error: 'Uno o más productos no son válidos' }
    const mapProd = new Map(productos.map((p) => [p.id, p]))

    for (const it of d.items) {
      const prod = mapProd.get(it.productoId)!
      if (Number(prod.stock) < it.cantidad) {
        return { error: `Stock insuficiente de "${prod.nombre}" (disponible: ${Number(prod.stock)})` }
      }
    }

    // Si requiere factura, exige un cliente identificado
    if (d.requiereFactura && !d.clienteId) {
      return { error: 'Para emitir factura electrónica selecciona un cliente' }
    }

    // Totales (IVA incluido por producto)
    let subtotal = 0
    let iva = 0
    for (const it of d.items) {
      const prod = mapProd.get(it.productoId)!
      const base = it.cantidad * Number(prod.precioVenta)
      subtotal += base
      iva += base * (Number(prod.ivaPorcentaje) / 100)
    }
    const descuento = d.descuento || 0
    const total = subtotal - descuento + iva

    const count = await prisma.venta.count({ where: { tenantId: sesion.tenantId } })
    const numero = `VEN-${String(count + 1).padStart(6, '0')}`

    const venta = await prisma.$transaction(async (tx) => {
      const v = await tx.venta.create({
        data: {
          tenantId: sesion.tenantId,
          clienteId: d.clienteId || null,
          usuarioId: sesion.sub,
          numero,
          formaPago: d.formaPago,
          subtotal,
          descuento,
          iva,
          total,
          pagoCon: d.pagoCon ?? null,
          requiereFactura: d.requiereFactura,
          items: {
            create: d.items.map((it) => {
              const prod = mapProd.get(it.productoId)!
              return {
                productoId: it.productoId,
                cantidad: it.cantidad,
                precioUnitario: Number(prod.precioVenta),
                subtotal: it.cantidad * Number(prod.precioVenta),
              }
            }),
          },
        },
      })

      // Descontar stock + kardex
      for (const it of d.items) {
        const prod = mapProd.get(it.productoId)!
        const stockPrevio = Number(prod.stock)
        const stockNuevo = stockPrevio - it.cantidad
        await tx.producto.update({ where: { id: it.productoId }, data: { stock: stockNuevo } })
        await tx.movimientoInventario.create({
          data: {
            tenantId: sesion.tenantId,
            productoId: it.productoId,
            tipo: 'VENTA',
            cantidad: -it.cantidad,
            stockPrevio,
            stockNuevo,
            motivo: `Venta ${numero}`,
          },
        })
      }
      return v
    })

    await registrarLog('AUDIT', 'VENTAS', `Venta ${numero} (${total.toFixed(2)}, ${d.requiereFactura ? 'con factura' : 'ticket'})`, undefined, sesion.tenantId)
    revalidatePath('/pos')
    revalidatePath('/ventas')
    revalidatePath('/productos')

    return {
      success: true,
      venta: {
        id: venta.id,
        numero,
        subtotal,
        descuento,
        iva,
        total,
        pagoCon: d.pagoCon ?? null,
        vuelto: d.pagoCon ? Math.max(0, d.pagoCon - total) : null,
        requiereFactura: d.requiereFactura,
      },
    }
  } catch (error: any) {
    await registrarLog('ERROR', 'VENTAS', `Error registrando venta: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo registrar la venta' }
  }
}

// ─── Buscar/crear cliente rápido en el POS ────────────────────────────────────
export async function buscarClienteAction(identificacion: string) {
  const sesion = await requerirTenant()
  const clean = identificacion.trim()
  if (!clean) return { error: 'Ingresa una identificación' }
  const cliente = await prisma.cliente.findFirst({
    where: { tenantId: sesion.tenantId, identificacion: clean },
    select: { id: true, nombre: true, identificacion: true },
  })
  if (!cliente) return { error: 'Cliente no encontrado' }
  return { success: true, cliente }
}

export async function crearClienteRapidoAction(data: {
  identificacion: string; nombre: string; tipoIdentificacion: string; telefono?: string; email?: string
}) {
  const sesion = await requerirTenant()
  const schema = z.object({
    identificacion: z.string().trim().min(3).max(15),
    nombre: z.string().trim().min(1).max(200),
    tipoIdentificacion: z.enum(['CEDULA', 'RUC', 'PASAPORTE', 'CONSUMIDOR_FINAL']),
    telefono: z.string().trim().max(20).optional().or(z.literal('')),
    email: z.string().trim().max(150).optional().or(z.literal('')),
  })
  const parsed = schema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  const d = parsed.data
  try {
    const cliente = await prisma.cliente.create({
      data: {
        tenantId: sesion.tenantId,
        identificacion: d.identificacion,
        nombre: d.nombre,
        tipoIdentificacion: d.tipoIdentificacion,
        telefono: d.telefono || null,
        email: d.email || null,
      },
      select: { id: true, nombre: true, identificacion: true },
    })
    return { success: true, cliente }
  } catch (error: any) {
    if (error.code === 'P2002') return { error: 'Ya existe un cliente con esa identificación' }
    return { error: 'No se pudo crear el cliente' }
  }
}
