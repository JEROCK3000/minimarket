import type { Metadata } from 'next'
import { requerirTenant } from '@/lib/auth/tenant'
import { prisma } from '@/lib/db/prisma'
import { POSClient } from './POSClient'

export const metadata: Metadata = { title: 'Punto de Venta' }

export default async function POSPage() {
  const sesion = await requerirTenant()

  const [productos, categorias] = await Promise.all([
    prisma.producto.findMany({
      where: { tenantId: sesion.tenantId, activo: true, vendible: true },
      include: { categoria: { select: { nombre: true } } },
      orderBy: { nombre: 'asc' },
    }),
    prisma.categoria.findMany({
      where: { tenantId: sesion.tenantId, activo: true },
      orderBy: { nombre: 'asc' },
      select: { id: true, nombre: true, icono: true },
    }),
  ])

  const productosPlanos = productos.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    codigoBarras: p.codigoBarras,
    categoriaNombre: p.categoria?.nombre ?? null,
    precioVenta: Number(p.precioVenta),
    ivaPorcentaje: Number(p.ivaPorcentaje),
    stock: Number(p.stock),
    unidad: p.unidad,
  }))

  return (
    <POSClient
      productos={productosPlanos}
      categorias={categorias.map((c) => ({ id: c.id, nombre: c.nombre, icono: c.icono }))}
    />
  )
}
