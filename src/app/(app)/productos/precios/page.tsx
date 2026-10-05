import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requerirTenant } from '@/lib/auth/tenant'
import { prisma } from '@/lib/db/prisma'
import { PreciosClient } from './PreciosClient'

export const metadata: Metadata = { title: 'Cambio de precios' }

export default async function PreciosPage() {
  const sesion = await requerirTenant()
  if (sesion.rol !== 'ADMIN') redirect('/productos')
  const t = sesion.tenantId
  const [productos, categorias, proveedores, compraItems] = await Promise.all([
    prisma.producto.findMany({
      where: { tenantId: t, activo: true }, orderBy: { nombre: 'asc' },
      select: { id: true, nombre: true, categoriaId: true, precioCompra: true, precioVenta: true, ivaPorcentaje: true },
    }),
    prisma.categoria.findMany({ where: { tenantId: t, activo: true }, orderBy: { nombre: 'asc' }, select: { id: true, nombre: true } }),
    prisma.proveedor.findMany({ where: { tenantId: t, activo: true }, orderBy: { nombre: 'asc' }, select: { id: true, nombre: true } }),
    // Qué productos le compras a cada proveedor (compras activas)
    prisma.compraItem.findMany({
      where: { compra: { tenantId: t, estado: 'ACTIVA', proveedorId: { not: null } } },
      select: { productoId: true, compra: { select: { proveedorId: true } } }, distinct: ['productoId', 'compraId'],
    }),
  ])
  const proveedoresDe = new Map<string, Set<string>>()
  for (const ci of compraItems) {
    const set = proveedoresDe.get(ci.productoId) ?? new Set<string>()
    set.add(ci.compra.proveedorId!)
    proveedoresDe.set(ci.productoId, set)
  }
  return (
    <PreciosClient
      categorias={categorias} proveedores={proveedores}
      productos={productos.map((p) => ({
        id: p.id, nombre: p.nombre, categoriaId: p.categoriaId, costo: Number(p.precioCompra), precioVenta: Number(p.precioVenta),
        iva: Number(p.ivaPorcentaje), proveedores: [...(proveedoresDe.get(p.id) ?? [])],
      }))}
    />
  )
}
