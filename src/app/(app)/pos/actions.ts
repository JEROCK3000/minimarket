'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { calcularVenta } from '@/lib/ventas/totales'
import { moverStock } from '@/lib/inventario/movimientos'
import { DIAS_CREDITO } from '@/lib/sri/impuestos'
import { CONSUMIDOR_FINAL } from '@/lib/clientes/identificacion'
import { aperturaDeUsuario } from '@/lib/caja/estado'
import { usaControlCaja } from '@/lib/config/negocio'
import { bloqueoPorSuscripcion, limiteDelPlan } from '@/lib/saas/suscripcion'
import { precioUnitarioPara } from '@/lib/ventas/presentaciones'
import { aplicarPromociones } from '@/lib/ventas/promociones'
import { promocionesDeHoy } from '@/lib/ventas/promociones-db'

const ventaSchema = z.object({
  clienteId: z.string().optional().or(z.literal('')),
  formaPago: z.enum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'CREDITO']),
  requiereFactura: z.boolean(),
  pagoCon: z.coerce.number().min(0).optional(),
  descuento: z.coerce.number().min(0).default(0),
  items: z.array(z.object({
    productoId: z.string().min(1),
    cantidad: z.coerce.number().positive(),
    presentacionId: z.string().max(40).optional().or(z.literal('')),
  })).min(1, 'El carrito está vacío').max(500),
})

export interface VentaFormValues {
  clienteId?: string
  formaPago: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'CREDITO'
  requiereFactura: boolean
  pagoCon?: number
  descuento?: number
  items: { productoId: string; cantidad: number; presentacionId?: string }[]
}

export async function registrarVentaAction(data: VentaFormValues) {
  // Cajeros (USER) también venden: requiere sesión con tenant, sin exigir ADMIN
  const sesion = await requerirTenant()
  {
    const bloqueo = await bloqueoPorSuscripcion(sesion.tenantId)
    if (bloqueo) return { error: bloqueo }
  }
  const parsed = ventaSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  const d = parsed.data

  // Con control de caja activo (Configuración → Operación), solo se vende con la
  // caja abierta: el arqueo depende de la apertura.
  // Varias cajas: la venta va a la caja que abrió este usuario.
  const apertura = await aperturaDeUsuario(sesion.tenantId, sesion.sub)
  if ((await usaControlCaja(sesion.tenantId)) && !apertura) {
    return { error: 'La caja está cerrada. Ábrela para poder vender.', cajaCerrada: true }
  }

  try {
    // Cargar productos del tenant y validar stock
    const ids = d.items.map((i) => i.productoId)
    const productos = await prisma.producto.findMany({
      where: { id: { in: ids }, tenantId: sesion.tenantId, activo: true },
      include: { preciosEscala: { select: { desde: true, precioVenta: true } } },
    })
    if (productos.length !== new Set(ids).size) return { error: 'Uno o más productos no son válidos' }
    const mapProd = new Map(productos.map((p) => [p.id, p]))

    // Presentaciones (six-pack, caja…): del mismo producto y del tenant
    const presIds = d.items.map((i) => i.presentacionId).filter((x): x is string => !!x)
    const presentaciones = presIds.length
      ? await prisma.productoPresentacion.findMany({ where: { id: { in: presIds }, tenantId: sesion.tenantId, activo: true } })
      : []
    const mapPres = new Map(presentaciones.map((p) => [p.id, p]))
    for (const it of d.items) {
      if (it.presentacionId && mapPres.get(it.presentacionId)?.productoId !== it.productoId) return { error: 'Presentación no válida' }
    }
    const factorDe = (it: (typeof d.items)[number]) => (it.presentacionId ? Number(mapPres.get(it.presentacionId)!.factor) : 1)
    // Precio por línea: el de la presentación, o el de la escala por mayor alcanzada.
    const precioDe = (it: (typeof d.items)[number]) => {
      const prod = mapProd.get(it.productoId)!
      if (it.presentacionId) return Number(mapPres.get(it.presentacionId)!.precioVenta)
      return precioUnitarioPara(Number(prod.precioVenta), prod.preciosEscala.map((e) => ({ desde: Number(e.desde), precioVenta: Number(e.precioVenta) })), it.cantidad)
    }

    // Stock en unidades del producto (suma de todas sus líneas y presentaciones)
    const necesario = new Map<string, number>()
    for (const it of d.items) necesario.set(it.productoId, (necesario.get(it.productoId) ?? 0) + it.cantidad * factorDe(it))
    for (const [id, cant] of necesario) {
      const prod = mapProd.get(id)!
      if (Number(prod.stock) + 1e-9 < cant) {
        return { error: `Stock insuficiente de "${prod.nombre}" (disponible: ${Number(prod.stock)})` }
      }
    }

    // Factura sin cliente elegido = factura a CONSUMIDOR FINAL (9999999999999):
    // se usa (o se crea una sola vez) ese cliente del tenant.
    let clienteId = d.clienteId || null
    if (d.requiereFactura && !clienteId) clienteId = (await clienteConsumidorFinal(sesion.tenantId)).id

    // El cliente debe ser del tenant; su identificación se congela en la venta
    // (puede facturar otro día con cédula o RUC sin alterar esta venta).
    const comprador = clienteId
      ? await prisma.cliente.findFirst({
          where: { id: clienteId, tenantId: sesion.tenantId },
          select: { tipoIdentificacion: true, identificacion: true },
        })
      : null
    if (clienteId && !comprador) return { error: 'Cliente no encontrado' }

    // Fiado: solo a un cliente identificado (se le cobra después).
    const esFiado = d.formaPago === 'CREDITO'
    if (esFiado && (!comprador || comprador.identificacion === '9999999999999')) {
      return { error: 'Para vender fiado selecciona un cliente registrado (no consumidor final)' }
    }

    // Totales con el cálculo único (IVA por tarifa de cada producto, sobre la
    // base con descuento): los mismos que usará la factura electrónica.
    // Promociones vigentes (2x1, %…): descuento propio de cada línea, decidido aquí.
    const promos = aplicarPromociones(
      d.items.map((it, i) => ({
        key: String(i), productoId: it.productoId, categoriaId: mapProd.get(it.productoId)!.categoriaId,
        cantidad: it.cantidad, precioUnitario: precioDe(it), conPresentacion: !!it.presentacionId,
      })),
      await promocionesDeHoy(sesion.tenantId),
    )
    const calculo = calcularVenta(
      d.items.map((it, i) => {
        const prod = mapProd.get(it.productoId)!
        return { cantidad: it.cantidad, precioUnitario: precioDe(it), ivaPorcentaje: Number(prod.ivaPorcentaje), descuentoLinea: promos.get(String(i))?.descuento ?? 0 }
      }),
      d.descuento || 0,
    )
    const { subtotal, descuento, iva, total } = calculo

    // Normativa SRI: no se emite factura a Consumidor Final por más de USD 50.
    if (d.requiereFactura && comprador?.identificacion === CONSUMIDOR_FINAL && total > LIMITE_CONSUMIDOR_FINAL) {
      return { error: `El total ($${total.toFixed(2)}) supera $${LIMITE_CONSUMIDOR_FINAL}: el SRI no permite facturar a Consumidor Final. Identifica al cliente.` }
    }

    const count = await prisma.venta.count({ where: { tenantId: sesion.tenantId } })
    const numero = `VEN-${String(count + 1).padStart(6, '0')}`

    const venta = await prisma.$transaction(async (tx) => {
      const v = await tx.venta.create({
        data: {
          tenantId: sesion.tenantId,
          clienteId,
          tipoIdentificacionComprador: comprador?.tipoIdentificacion ?? null,
          identificacionComprador: comprador?.identificacion ?? null,
          usuarioId: sesion.sub,
          aperturaId: apertura?.id ?? null,
          numero,
          formaPago: d.formaPago,
          subtotal,
          descuento,
          iva,
          total,
          pagoCon: esFiado ? null : d.pagoCon ?? null,
          saldoPendiente: esFiado ? total : 0,
          diasCredito: esFiado ? DIAS_CREDITO : null,
          requiereFactura: d.requiereFactura,
          items: {
            create: d.items.map((it, i) => ({
              productoId: it.productoId,
              cantidad: it.cantidad,
              precioUnitario: calculo.lineas[i].precioUnitario,
              subtotal: calculo.lineas[i].subtotal,
              // costo por presentación (unidades × costo unitario) para la utilidad
              costoUnitario: Number(mapProd.get(it.productoId)!.precioCompra) * factorDe(it),
              presentacionId: it.presentacionId || null,
              presentacion: it.presentacionId ? mapPres.get(it.presentacionId)!.nombre : null,
              factor: factorDe(it),
              descuento: promos.get(String(i))?.descuento ?? 0,
              promocion: promos.get(String(i))?.promocion ?? null,
            })),
          },
        },
      })

      // Descontar stock + kardex (atómico)
      for (const it of d.items) {
        await moverStock(tx, {
          tenantId: sesion.tenantId, productoId: it.productoId,
          cantidad: -it.cantidad * factorDe(it), tipo: 'VENTA', motivo: `Venta ${numero}`,
        })
      }
      return v
    })

    await registrarLog('AUDIT', 'VENTAS', `Venta ${numero} (${total.toFixed(2)}${descuento > 0 ? `, descuento ${descuento.toFixed(2)}` : ''}, ${d.requiereFactura ? 'con factura' : 'ticket'})`, undefined, sesion.tenantId)
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
        vuelto: !esFiado && d.pagoCon ? Math.max(0, d.pagoCon - total) : null,
        requiereFactura: d.requiereFactura,
        formaPago: d.formaPago,
      },
    }
  } catch (error: any) {
    await registrarLog('ERROR', 'VENTAS', `Error registrando venta: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo registrar la venta' }
  }
}

// ─── Crear/actualizar cliente rápido en el POS ────────────────────────────────
// (la búsqueda la hace consultarIdentificacionAction de clientes/actions)
const clienteRapidoSchema = z.object({
  identificacion: z.string().trim().min(3).max(15),
  nombre: z.string().trim().min(1).max(200),
  tipoIdentificacion: z.enum(['CEDULA', 'RUC', 'PASAPORTE', 'CONSUMIDOR_FINAL']),
  telefono: z.string().trim().max(20).optional().or(z.literal('')),
  email: z.string().trim().max(150).optional().or(z.literal('')),
  direccion: z.string().trim().max(300).optional().or(z.literal('')),
})
export interface ClienteRapidoValues {
  identificacion: string; nombre: string; tipoIdentificacion: string
  telefono?: string; email?: string; direccion?: string
}

export async function crearClienteRapidoAction(data: ClienteRapidoValues) {
  const sesion = await requerirTenant()
  const parsed = clienteRapidoSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  const d = parsed.data
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return { error: 'Correo electrónico inválido' }
  try {
    const cliente = await prisma.cliente.create({
      data: {
        tenantId: sesion.tenantId,
        identificacion: d.identificacion,
        nombre: d.nombre,
        tipoIdentificacion: d.tipoIdentificacion,
        telefono: d.telefono || null,
        email: d.email || null,
        direccion: d.direccion || null,
      },
      select: { id: true, nombre: true, identificacion: true, telefono: true, email: true, direccion: true },
    })
    return { success: true, cliente }
  } catch (error: any) {
    if (error.code === 'P2002') return { error: 'Ya existe un cliente con esa identificación' }
    return { error: 'No se pudo crear el cliente' }
  }
}

/** Actualiza los datos de un cliente existente desde el POS (corrección en caliente). */
export async function actualizarClienteRapidoAction(id: string, data: ClienteRapidoValues) {
  const sesion = await requerirTenant()
  const parsed = clienteRapidoSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  const d = parsed.data
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return { error: 'Correo electrónico inválido' }
  try {
    const actual = await prisma.cliente.findFirst({ where: { id, tenantId: sesion.tenantId } })
    if (!actual) return { error: 'Cliente no encontrado' }
    const cliente = await prisma.cliente.update({
      where: { id },
      data: {
        identificacion: d.identificacion,
        nombre: d.nombre,
        tipoIdentificacion: d.tipoIdentificacion,
        telefono: d.telefono || null,
        email: d.email || null,
        direccion: d.direccion || null,
      },
      select: { id: true, nombre: true, identificacion: true, telefono: true, email: true, direccion: true },
    })
    return { success: true, cliente }
  } catch (error: any) {
    if (error.code === 'P2002') return { error: 'Ya existe un cliente con esa identificación' }
    return { error: 'No se pudo actualizar el cliente' }
  }
}

/** Límite SRI para facturar a Consumidor Final (USD). */
const LIMITE_CONSUMIDOR_FINAL = 50

/** Cliente "CONSUMIDOR FINAL" del tenant (se crea la primera vez que se necesita). */
async function clienteConsumidorFinal(tenantId: string) {
  return prisma.cliente.upsert({
    where: { tenantId_identificacion: { tenantId, identificacion: CONSUMIDOR_FINAL } },
    update: {},
    create: { tenantId, identificacion: CONSUMIDOR_FINAL, nombre: 'CONSUMIDOR FINAL', tipoIdentificacion: 'CONSUMIDOR_FINAL' },
    select: { id: true },
  })
}
