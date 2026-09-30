import type { Metadata } from 'next'
import { requerirTenant } from '@/lib/auth/tenant'
import { prisma } from '@/lib/db/prisma'
import { ProductosClient } from './ProductosClient'
import { vencimientosEnStock } from '@/lib/inventario/vencimientos'

export const metadata: Metadata = { title: 'Productos' }

export default async function ProductosPage() {
  const sesion = await requerirTenant()

  const [productos, categorias, vencimientos] = await Promise.all([
    prisma.producto.findMany({
      where: { tenantId: sesion.tenantId, activo: true },
      include: { categoria: { select: { nombre: true, icono: true } } },
      orderBy: { nombre: 'asc' },
    }),
    prisma.categoria.findMany({
      where: { tenantId: sesion.tenantId, activo: true },
      orderBy: { nombre: 'asc' },
    }),
    vencimientosEnStock(sesion.tenantId, 30),
  ])
  const vencePor = new Map(vencimientos.map((v) => [v.productoId, v]))

  // Serializar Decimal → number para el cliente
  const productosPlanos = productos.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    codigoBarras: p.codigoBarras,
    categoriaId: p.categoriaId,
    categoriaNombre: p.categoria?.nombre ?? null,
    categoriaIcono: p.categoria?.icono ?? null,
    precioCompra: Number(p.precioCompra),
    precioVenta: Number(p.precioVenta),
    ivaPorcentaje: Number(p.ivaPorcentaje),
    stock: Number(p.stock),
    stockMinimo: Number(p.stockMinimo),
    unidad: p.unidad,
    venceEnDias: vencePor.get(p.id)?.dias ?? null,
    fechaVencimiento: vencePor.get(p.id)?.fechaVencimiento.toISOString() ?? null,
  }))

  const categoriasPlanas = categorias.map((c) => ({ id: c.id, nombre: c.nombre, icono: c.icono }))

  const puedeEditar = sesion.rol === 'ADMIN' || sesion.rol === 'SUPERADMIN'

  return <ProductosClient productos={productosPlanos} categorias={categoriasPlanas} puedeEditar={puedeEditar} />
}
