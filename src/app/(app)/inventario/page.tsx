import type { Metadata } from 'next'
import { requerirTenant } from '@/lib/auth/tenant'
import { prisma } from '@/lib/db/prisma'
import { TomasClient } from './TomasClient'

export const metadata: Metadata = { title: 'Toma de inventario' }

export default async function TomasPage() {
  const sesion = await requerirTenant()
  const [tomas, categorias] = await Promise.all([
    prisma.tomaInventario.findMany({
      where: { tenantId: sesion.tenantId }, orderBy: { createdAt: 'desc' }, take: 100,
      include: { _count: { select: { items: true } } },
    }),
    prisma.categoria.findMany({ where: { tenantId: sesion.tenantId }, orderBy: { nombre: 'asc' }, select: { id: true, nombre: true } }),
  ])
  return (
    <TomasClient
      esAdmin={sesion.rol === 'ADMIN'}
      categorias={categorias}
      tomas={tomas.map((t) => ({
        id: t.id, numero: t.numero, alcance: t.categoriaNombre ?? 'Todos los productos', estado: t.estado,
        creadaPor: t.creadaPor, fecha: t.createdAt.toISOString(), aplicadaAt: t.aplicadaAt?.toISOString() ?? null,
        contados: t._count.items, faltante: Number(t.valorFaltante), sobrante: Number(t.valorSobrante),
      }))}
    />
  )
}
