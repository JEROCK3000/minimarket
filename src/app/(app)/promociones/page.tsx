import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requerirTenant } from '@/lib/auth/tenant'
import { prisma } from '@/lib/db/prisma'
import { aPromocion } from '@/lib/ventas/promociones-db'
import { PromocionesClient } from './PromocionesClient'

export const metadata: Metadata = { title: 'Promociones' }

export default async function PromocionesPage() {
  const sesion = await requerirTenant()
  if (sesion.rol !== 'ADMIN') redirect('/dashboard')
  const t = sesion.tenantId
  const desde = new Date(); desde.setDate(desde.getDate() - 30)
  const [promos, productos, categorias, usos] = await Promise.all([
    prisma.promocion.findMany({ where: { tenantId: t }, orderBy: [{ activa: 'desc' }, { hasta: 'desc' }] }),
    prisma.producto.findMany({ where: { tenantId: t, activo: true }, orderBy: { nombre: 'asc' }, select: { id: true, nombre: true } }),
    prisma.categoria.findMany({ where: { tenantId: t, activo: true }, orderBy: { nombre: 'asc' }, select: { id: true, nombre: true } }),
    // Descuento otorgado por cada promoción en los últimos 30 días (por nombre congelado en la venta)
    prisma.ventaItem.groupBy({ by: ['promocion'], where: { promocion: { not: null }, venta: { tenantId: t, estado: 'COMPLETADA', fecha: { gte: desde } } }, _sum: { descuento: true }, _count: true }),
  ])
  const usoPor = new Map(usos.map((u) => [u.promocion!, { descuento: Number(u._sum.descuento ?? 0), lineas: u._count }]))
  return (
    <PromocionesClient
      productos={productos} categorias={categorias}
      promociones={promos.map((p) => ({ ...aPromocion(p), activa: p.activa, uso: usoPor.get(p.nombre) ?? null }))}
    />
  )
}
