import type { Metadata } from 'next'
import { requerirTenant } from '@/lib/auth/tenant'
import { prisma } from '@/lib/db/prisma'
import { ComprasClient } from './ComprasClient'

export const metadata: Metadata = { title: 'Compras' }

export default async function ComprasPage() {
  const sesion = await requerirTenant()

  const [compras, proveedores, productos] = await Promise.all([
    prisma.compra.findMany({
      where: { tenantId: sesion.tenantId },
      include: { proveedor: { select: { nombre: true } }, _count: { select: { items: true } } },
      orderBy: { fecha: 'desc' },
      take: 100,
    }),
    prisma.proveedor.findMany({
      where: { tenantId: sesion.tenantId, activo: true },
      orderBy: { nombre: 'asc' },
    }),
    prisma.producto.findMany({
      where: { tenantId: sesion.tenantId, activo: true },
      orderBy: { nombre: 'asc' },
      select: { id: true, nombre: true, precioCompra: true, stock: true, unidad: true },
    }),
  ])

  const comprasPlanas = compras.map((c) => ({
    id: c.id,
    numero: c.numero,
    numFactura: c.numFactura,
    proveedor: c.proveedor?.nombre ?? 'Sin proveedor',
    items: c._count.items,
    total: Number(c.total),
    fecha: c.fecha.toISOString(),
  }))
  const productosPlanos = productos.map((p) => ({
    id: p.id, nombre: p.nombre, precioCompra: Number(p.precioCompra), stock: Number(p.stock), unidad: p.unidad,
  }))

  const puedeEditar = sesion.rol === 'ADMIN' || sesion.rol === 'SUPERADMIN'

  return (
    <ComprasClient
      compras={comprasPlanas}
      proveedores={proveedores.map((p) => ({ id: p.id, nombre: p.nombre }))}
      productos={productosPlanos}
      puedeEditar={puedeEditar}
    />
  )
}
