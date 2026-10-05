'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { diasHasta, hoyLocalISO } from '@/lib/utils/fechas'
import { moverStock } from '@/lib/inventario/movimientos'
import { bloqueoPorSuscripcion, limiteDelPlan } from '@/lib/saas/suscripcion'

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
  condicionPago: z.enum(['CONTADO', 'CREDITO']).default('CONTADO'),
  diasPlazo: z.coerce.number().int().min(1).max(365).default(30),
  items: z.array(z.object({
    productoId: z.string().optional().or(z.literal('')),
    // Producto nuevo (desde el XML): se crea al registrar la compra, con stock 0 antes del ingreso.
    nuevo: z.object({
      nombre: z.string().trim().min(1, 'Nombre del producto nuevo requerido').max(150),
      codigoBarras: z.string().trim().max(50).optional().or(z.literal('')),
      precioVenta: z.coerce.number().positive('Indica el precio de venta de los productos nuevos').max(999999),
      ivaPorcentaje: z.coerce.number().refine((v) => [0, 5, 12, 13, 14, 15].includes(v), 'Tarifa de IVA no válida para el SRI'),
    }).optional(),
    cantidad: z.coerce.number().positive('Cantidad inválida'),
    precioUnitario: z.coerce.number().min(0),
    fechaVencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de vencimiento inválida').optional().or(z.literal('')),
    // Solo compras cargadas desde XML: código del artículo en el proveedor y unidades por empaque.
    codigoProveedor: z.string().trim().max(50).optional(),
    factor: z.coerce.number().positive().max(100000).optional(),
  }).refine((it) => !!it.productoId || !!it.nuevo, 'Elige un producto en cada línea')).min(1, 'Agrega al menos un producto').max(500),
  claveAcceso: z.string().regex(/^\d{49}$/).optional().or(z.literal('')),
  // Proveedor leído del XML que aún no está registrado: se crea al guardar la compra.
  proveedorNuevo: z.object({
    ruc: z.string().regex(/^\d{13}$/, 'RUC del proveedor inválido'),
    nombre: z.string().trim().min(1).max(150),
    direccion: z.string().trim().max(300).optional().or(z.literal('')),
  }).optional(),
})
export interface CompraFormValues {
  proveedorId?: string
  numFactura?: string
  notas?: string
  condicionPago?: 'CONTADO' | 'CREDITO'
  diasPlazo?: number
  items: {
    productoId?: string; cantidad: number; precioUnitario: number; fechaVencimiento?: string; codigoProveedor?: string; factor?: number
    nuevo?: { nombre: string; codigoBarras?: string; precioVenta: number; ivaPorcentaje: number }
  }[]
  claveAcceso?: string
  proveedorNuevo?: { ruc: string; nombre: string; direccion?: string }
}

export async function crearCompraAction(data: CompraFormValues) {
  const sesion = await requerirTenant('ADMIN')
  {
    const bloqueo = await bloqueoPorSuscripcion(sesion.tenantId)
    if (bloqueo) return { error: bloqueo }
  }
  const parsed = compraSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  const d = parsed.data
  // Un producto que ya venció no se ingresa como compra (suele ser un error al elegir la fecha).
  if (d.items.some((it) => it.fechaVencimiento && diasHasta(it.fechaVencimiento) < 0)) {
    return { error: 'Hay una fecha de vencimiento anterior a hoy: revisa las fechas' }
  }

  try {
    // Validar que todos los productos pertenecen al tenant
    const nuevos = d.items.filter((i) => !i.productoId && i.nuevo).length
    if (nuevos > 0) {
      const limite = await limiteDelPlan(sesion.tenantId, 'productos', nuevos)
      if (limite) return { error: limite }
    }
    const ids = d.items.filter((i) => i.productoId).map((i) => i.productoId!)
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
      const tarifa = it.productoId ? Number(mapProd.get(it.productoId)!.ivaPorcentaje) : it.nuevo!.ivaPorcentaje
      const sub = it.cantidad * it.precioUnitario
      subtotal += sub
      iva += sub * (tarifa / 100)
    }
    const total = subtotal + iva
    let rucProveedor: string | null = null
    if (d.proveedorId) {
      const prov = await prisma.proveedor.findFirst({ where: { id: d.proveedorId, tenantId: sesion.tenantId }, select: { id: true, identificacion: true } })
      if (!prov) return { error: 'Proveedor no válido' }
      rucProveedor = prov.identificacion
    } else if (d.proveedorNuevo) {
      // Proveedor del XML: se reutiliza si ya existe con ese RUC, si no se crea.
      const existente = await prisma.proveedor.findFirst({ where: { tenantId: sesion.tenantId, identificacion: d.proveedorNuevo.ruc }, select: { id: true } })
      d.proveedorId = existente?.id ?? (await prisma.proveedor.create({
        data: { tenantId: sesion.tenantId, nombre: d.proveedorNuevo.nombre, identificacion: d.proveedorNuevo.ruc, direccion: d.proveedorNuevo.direccion || null },
      })).id
      if (!existente) await registrarLog('AUDIT', 'COMPRAS', `Proveedor creado desde XML: ${d.proveedorNuevo.nombre} (${d.proveedorNuevo.ruc})`, undefined, sesion.tenantId)
      rucProveedor = d.proveedorNuevo.ruc
    }
    const aCredito = d.condicionPago === 'CREDITO'
    if (aCredito && !d.proveedorId) return { error: 'Una compra a crédito necesita un proveedor' }

    // La misma factura no se registra dos veces (por clave de acceso o proveedor + nº).
    if (d.claveAcceso || (d.proveedorId && d.numFactura)) {
      const previa = await prisma.compra.findFirst({
        where: {
          tenantId: sesion.tenantId, estado: 'ACTIVA',
          OR: [
            ...(d.claveAcceso ? [{ claveAcceso: d.claveAcceso }] : []),
            ...(d.proveedorId && d.numFactura ? [{ proveedorId: d.proveedorId, numFactura: d.numFactura }] : []),
          ],
        },
        select: { numero: true },
      })
      if (previa) return { error: `Esta factura del proveedor ya está registrada en la compra ${previa.numero}` }
    }

    // Transacción: compra + items + actualización de stock + kardex + precio compra
    const codigosUsados = new Set<string>()
    await prisma.$transaction(async (tx) => {
      // Productos nuevos del XML (un código de barras repetido o ya usado se omite).
      for (const it of d.items) {
        if (it.productoId || !it.nuevo) continue
        let codigoBarras = it.nuevo.codigoBarras || null
        if (codigoBarras && (codigosUsados.has(codigoBarras) ||
          await tx.producto.findFirst({ where: { tenantId: sesion.tenantId, codigoBarras }, select: { id: true } }))) codigoBarras = null
        if (codigoBarras) codigosUsados.add(codigoBarras)
        const p = await tx.producto.create({
          data: {
            tenantId: sesion.tenantId, nombre: it.nuevo.nombre, codigoBarras,
            precioCompra: it.precioUnitario, precioVenta: it.nuevo.precioVenta, ivaPorcentaje: it.nuevo.ivaPorcentaje, stock: 0,
          },
          select: { id: true },
        })
        it.productoId = p.id
      }

      const compra = await tx.compra.create({
        data: {
          tenantId: sesion.tenantId,
          proveedorId: d.proveedorId || null,
          numero,
          numFactura: d.numFactura || null,
          claveAcceso: d.claveAcceso || null,
          notas: d.notas || null,
          condicionPago: d.condicionPago,
          saldoPendiente: aCredito ? total : 0,
          venceEl: aCredito ? new Date(Date.now() + d.diasPlazo * 86400000) : null,
          subtotal,
          iva,
          total,
          items: {
            create: d.items.map((it) => ({
              productoId: it.productoId!,
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
          tenantId: sesion.tenantId, productoId: it.productoId!,
          cantidad: it.cantidad, tipo: 'COMPRA', motivo: `Compra ${compra.numero}`,
          precioCompra: it.precioUnitario,
        })
      }
    })

    // Aprender equivalencias código del proveedor → producto (y unidades por empaque).
    if (rucProveedor && /^\d{13}$/.test(rucProveedor)) {
      for (const it of d.items) {
        if (!it.codigoProveedor) continue
        const factor = it.factor ?? 1
        await prisma.productoCodigoProveedor.upsert({
          where: { tenantId_proveedorRuc_codigo: { tenantId: sesion.tenantId, proveedorRuc: rucProveedor, codigo: it.codigoProveedor } },
          create: { tenantId: sesion.tenantId, proveedorRuc: rucProveedor, codigo: it.codigoProveedor, productoId: it.productoId!, factor },
          update: { productoId: it.productoId!, factor },
        }).catch((e) => registrarLog('WARN', 'COMPRAS', `No se guardó la equivalencia ${it.codigoProveedor}: ${e.message || e}`, undefined, sesion.tenantId))
      }
    }

    await registrarLog('AUDIT', 'COMPRAS', `Compra registrada: ${numero} (total ${total.toFixed(2)})${d.claveAcceso ? ' desde XML' : ''}${nuevos ? `, ${nuevos} producto(s) nuevo(s)` : ''}`, undefined, sesion.tenantId)
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
  items: { id: string; productoId: string; nombre: string; unidad: string; cantidad: number; precioUnitario: number; subtotal: number; ivaPorcentaje: number; fechaVencimiento: string | null }[]
  subtotal: number
  iva: number
  total: number
  condicionPago: string
  saldoPendiente: number
  venceEl: string | null
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
        id: it.id, productoId: it.productoId, nombre: it.producto.nombre, unidad: it.producto.unidad,
        cantidad: Number(it.cantidad), precioUnitario: Number(it.precioUnitario), subtotal: Number(it.subtotal),
        ivaPorcentaje: Number(it.producto.ivaPorcentaje),
        fechaVencimiento: it.fechaVencimiento ? it.fechaVencimiento.toISOString().slice(0, 10) : null,
      })),
      subtotal: Number(c.subtotal), iva: Number(c.iva), total: Number(c.total),
      condicionPago: c.condicionPago, saldoPendiente: Number(c.saldoPendiente), venceEl: c.venceEl?.toISOString() ?? null,
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
    include: { items: { include: { producto: { select: { nombre: true } } } }, _count: { select: { pagos: true } } },
  })
  if (!compra) return { error: 'Compra no encontrada' }
  if (compra.estado === 'ANULADA') return { error: 'La compra ya está anulada' }
  if (compra._count.pagos > 0) return { error: 'No se puede anular: esta compra a crédito ya tiene pagos registrados al proveedor' }

  try {
    await prisma.$transaction(async (tx) => {
      // Marcar primero, condicionado: dos anulaciones simultáneas no restan dos veces.
      const marcada = await tx.compra.updateMany({
        where: { id, tenantId: sesion.tenantId, estado: 'ACTIVA' },
        data: { estado: 'ANULADA', anuladaAt: new Date(), motivoAnulacion: parsed.data.motivo, saldoPendiente: 0 },
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

/**
 * Corrige la fecha de vencimiento de un ítem de compra (no mueve stock, por eso
 * no hace falta anular la compra). Solo ADMIN, compra activa del tenant.
 */
export async function actualizarVencimientoItemAction(compraId: string, itemId: string, fecha: string | null) {
  const sesion = await requerirTenant('ADMIN')
  if (fecha !== null && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: 'Fecha inválida' }
  if (fecha && diasHasta(fecha) < 0) return { error: 'La fecha de vencimiento no puede ser anterior a hoy' }
  try {
    const item = await prisma.compraItem.findFirst({
      where: { id: itemId, compraId, compra: { tenantId: sesion.tenantId } },
      select: { fechaVencimiento: true, producto: { select: { nombre: true } }, compra: { select: { numero: true, estado: true } } },
    })
    if (!item) return { error: 'Ítem no encontrado' }
    if (item.compra.estado === 'ANULADA') return { error: 'La compra está anulada' }
    await prisma.compraItem.update({ where: { id: itemId }, data: { fechaVencimiento: fecha ? new Date(`${fecha}T12:00:00Z`) : null } })
    const antes = item.fechaVencimiento ? item.fechaVencimiento.toISOString().slice(0, 10) : 'sin fecha'
    await registrarLog('AUDIT', 'COMPRAS', `Vencimiento corregido en compra ${item.compra.numero} (${item.producto.nombre}): ${antes} → ${fecha ?? 'sin fecha'} el ${hoyLocalISO()}`, { usuarioId: sesion.sub }, sesion.tenantId)
    revalidatePath('/compras'); revalidatePath('/productos')
    return { success: true }
  } catch (error: any) {
    await registrarLog('ERROR', 'COMPRAS', `Error corrigiendo vencimiento: ${error.message || error}`, { usuarioId: sesion.sub }, sesion.tenantId)
    return { error: 'No se pudo guardar la fecha' }
  }
}
