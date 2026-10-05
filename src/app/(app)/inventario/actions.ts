'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { moverStock } from '@/lib/inventario/movimientos'
import { bloqueoPorSuscripcion } from '@/lib/saas/suscripcion'

/**
 * Toma de inventario físico. ADMIN crea, aplica o cancela; cualquier usuario
 * del minimarket puede registrar conteos. Una sola toma en curso por negocio.
 */
class ErrorNegocio extends Error {}
const EPS = 0.0005
const revalidar = (id?: string) => { revalidatePath('/inventario'); if (id) revalidatePath(`/inventario/${id}`); revalidatePath('/productos') }

async function tomaEnCurso(tenantId: string, tomaId: string) {
  const toma = await prisma.tomaInventario.findFirst({ where: { id: tomaId, tenantId }, select: { id: true, numero: true, estado: true, categoriaId: true } })
  if (!toma) throw new ErrorNegocio('Toma de inventario no encontrada')
  if (toma.estado !== 'EN_CURSO') throw new ErrorNegocio('Esta toma ya fue cerrada')
  return toma
}

const crearSchema = z.object({
  categoriaId: z.string().trim().max(40).optional().or(z.literal('')),
  notas: z.string().trim().max(300).optional().or(z.literal('')),
})

export async function crearTomaAction(data: z.infer<typeof crearSchema>) {
  const sesion = await requerirTenant('ADMIN')
  const bloqueo = await bloqueoPorSuscripcion(sesion.tenantId)
  if (bloqueo) return { error: bloqueo }
  const parsed = crearSchema.safeParse(data)
  if (!parsed.success) return { error: 'Datos inválidos' }
  const d = parsed.data
  try {
    const abierta = await prisma.tomaInventario.findFirst({ where: { tenantId: sesion.tenantId, estado: 'EN_CURSO' }, select: { numero: true } })
    if (abierta) return { error: `Ya hay una toma en curso (${abierta.numero}): termínala o cancélala primero` }
    let categoriaNombre: string | null = null
    if (d.categoriaId) {
      const cat = await prisma.categoria.findFirst({ where: { id: d.categoriaId, tenantId: sesion.tenantId }, select: { nombre: true } })
      if (!cat) return { error: 'Categoría no válida' }
      categoriaNombre = cat.nombre
    }
    const n = await prisma.tomaInventario.count({ where: { tenantId: sesion.tenantId } })
    const toma = await prisma.tomaInventario.create({
      data: {
        tenantId: sesion.tenantId, numero: `TI-${String(n + 1).padStart(5, '0')}`,
        categoriaId: d.categoriaId || null, categoriaNombre, notas: d.notas || null, creadaPor: sesion.nombre,
      },
    })
    await registrarLog('AUDIT', 'INVENTARIO', `Toma de inventario ${toma.numero} iniciada (${categoriaNombre ?? 'todos los productos'}) por ${sesion.email}`, undefined, sesion.tenantId)
    revalidar()
    return { success: true, id: toma.id }
  } catch (error: any) {
    await registrarLog('ERROR', 'INVENTARIO', `Error creando toma: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo iniciar la toma de inventario' }
  }
}

const conteoSchema = z.object({
  tomaId: z.string().min(1).max(40),
  productoId: z.string().min(1).max(40),
  cantidad: z.coerce.number().min(0, 'La cantidad no puede ser negativa').max(9999999),
  sumar: z.boolean().default(false), // true: suma a lo ya contado (lector, una lectura por unidad)
})

/** Registra (o suma a) el conteo de un producto. Guarda el stock del sistema en ese momento. */
export async function registrarConteoAction(data: z.infer<typeof conteoSchema>) {
  const sesion = await requerirTenant()
  const bloqueo = await bloqueoPorSuscripcion(sesion.tenantId)
  if (bloqueo) return { error: bloqueo }
  const parsed = conteoSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  const d = parsed.data
  try {
    const toma = await tomaEnCurso(sesion.tenantId, d.tomaId)
    const producto = await prisma.producto.findFirst({
      where: { id: d.productoId, tenantId: sesion.tenantId, activo: true },
      select: { stock: true, categoriaId: true, nombre: true },
    })
    if (!producto) return { error: 'Producto no encontrado' }
    if (toma.categoriaId && producto.categoriaId !== toma.categoriaId) return { error: `${producto.nombre} no pertenece a la categoría de esta toma` }
    const previo = await prisma.tomaInventarioItem.findUnique({ where: { tomaId_productoId: { tomaId: toma.id, productoId: d.productoId } }, select: { cantidadContada: true } })
    const cantidad = d.sumar ? Number(previo?.cantidadContada ?? 0) + d.cantidad : d.cantidad
    const datos = { cantidadContada: cantidad, stockAlContar: producto.stock, contadoPor: sesion.nombre, contadoAt: new Date() }
    await prisma.tomaInventarioItem.upsert({
      where: { tomaId_productoId: { tomaId: toma.id, productoId: d.productoId } },
      create: { tomaId: toma.id, productoId: d.productoId, ...datos },
      update: datos,
    })
    return { success: true, cantidad, stockSistema: Number(producto.stock) }
  } catch (error: any) {
    if (error instanceof ErrorNegocio) return { error: error.message }
    await registrarLog('ERROR', 'INVENTARIO', `Error registrando conteo: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo guardar el conteo' }
  }
}

export async function quitarConteoAction(tomaId: string, productoId: string) {
  const sesion = await requerirTenant()
  try {
    const toma = await tomaEnCurso(sesion.tenantId, String(tomaId))
    await prisma.tomaInventarioItem.deleteMany({ where: { tomaId: toma.id, productoId: String(productoId) } })
    return { success: true }
  } catch (error: any) {
    if (error instanceof ErrorNegocio) return { error: error.message }
    await registrarLog('ERROR', 'INVENTARIO', `Error quitando conteo: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo quitar el conteo' }
  }
}

/**
 * Aplica la toma: ajusta cada producto contado en (contado − stock al contar),
 * con kardex (los faltantes quedan como pérdida "Faltante en conteo"). Con
 * `noContadosEnCero`, los productos del alcance que no se contaron y tienen
 * stock pasan a 0 (úsalo solo si contaste TODO lo que hay en el local).
 */
export async function aplicarTomaAction(tomaId: string, noContadosEnCero: boolean) {
  const sesion = await requerirTenant('ADMIN')
  const bloqueo = await bloqueoPorSuscripcion(sesion.tenantId)
  if (bloqueo) return { error: bloqueo }
  try {
    const toma = await tomaEnCurso(sesion.tenantId, String(tomaId))
    const items = await prisma.tomaInventarioItem.findMany({ where: { tomaId: toma.id }, select: { productoId: true, cantidadContada: true, stockAlContar: true } })
    if (items.length === 0) return { error: 'No hay productos contados en esta toma' }
    const motivo = `Toma de inventario ${toma.numero}`
    const resultado = await prisma.$transaction(async (tx) => {
      // Marcar primero (condicionado): dos clics simultáneos no ajustan dos veces.
      const marcada = await tx.tomaInventario.updateMany({ where: { id: toma.id, estado: 'EN_CURSO' }, data: { estado: 'APLICADA' } })
      if (marcada.count === 0) throw new ErrorNegocio('Esta toma ya fue aplicada')
      let faltante = 0, sobrante = 0, ajustados = 0
      const ajustar = async (productoId: string, delta: number) => {
        const r = await moverStock(tx, { tenantId: sesion.tenantId, productoId, cantidad: delta, tipo: 'AJUSTE', motivo, categoria: delta < 0 ? 'FALTANTE' : undefined, usuarioNombre: sesion.nombre })
        const costo = await tx.producto.findUniqueOrThrow({ where: { id: productoId }, select: { precioCompra: true } })
        if (delta < 0) faltante += -delta * Number(costo.precioCompra); else sobrante += delta * Number(costo.precioCompra)
        ajustados++
        return r
      }
      for (const it of items) {
        const delta = Number(it.cantidadContada) - Number(it.stockAlContar)
        if (Math.abs(delta) > EPS) await ajustar(it.productoId, delta)
      }
      if (noContadosEnCero) {
        const contados = items.map((i) => i.productoId)
        const pendientes = await tx.producto.findMany({
          where: { tenantId: sesion.tenantId, activo: true, stock: { gt: 0 }, id: { notIn: contados }, ...(toma.categoriaId ? { categoriaId: toma.categoriaId } : {}) },
          select: { id: true, stock: true },
        })
        for (const p of pendientes) await ajustar(p.id, -Number(p.stock))
      }
      await tx.tomaInventario.update({
        where: { id: toma.id },
        data: { aplicadaPor: sesion.nombre, aplicadaAt: new Date(), valorFaltante: Math.round(faltante * 100) / 100, valorSobrante: Math.round(sobrante * 100) / 100 },
      })
      return { faltante, sobrante, ajustados }
    }, { timeout: 120000, maxWait: 10000 })
    await registrarLog('AUDIT', 'INVENTARIO', `Toma ${toma.numero} aplicada por ${sesion.email}: ${resultado.ajustados} ajuste(s), faltante $${resultado.faltante.toFixed(2)}, sobrante $${resultado.sobrante.toFixed(2)}${noContadosEnCero ? ' (no contados en 0)' : ''}`, undefined, sesion.tenantId)
    revalidar(toma.id)
    return { success: true, ...resultado }
  } catch (error: any) {
    if (error instanceof ErrorNegocio) return { error: error.message }
    await registrarLog('ERROR', 'INVENTARIO', `Error aplicando toma: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo aplicar la toma de inventario' }
  }
}

export async function cancelarTomaAction(tomaId: string) {
  const sesion = await requerirTenant('ADMIN')
  try {
    const toma = await tomaEnCurso(sesion.tenantId, String(tomaId))
    await prisma.tomaInventario.update({ where: { id: toma.id }, data: { estado: 'CANCELADA', aplicadaPor: sesion.nombre, aplicadaAt: new Date() } })
    await registrarLog('AUDIT', 'INVENTARIO', `Toma ${toma.numero} cancelada por ${sesion.email}`, undefined, sesion.tenantId)
    revalidar(toma.id)
    return { success: true }
  } catch (error: any) {
    if (error instanceof ErrorNegocio) return { error: error.message }
    await registrarLog('ERROR', 'INVENTARIO', `Error cancelando toma: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo cancelar la toma' }
  }
}
