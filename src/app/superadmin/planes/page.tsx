import type { Metadata } from 'next'
import { prisma } from '@/lib/db/prisma'
import { requerirSuperadmin } from '@/lib/auth/session'
import { PlanesClient } from './PlanesClient'

export const metadata: Metadata = { title: 'Planes' }

export default async function PlanesPage() {
  await requerirSuperadmin()
  const planes = await prisma.planSuscripcion.findMany({ orderBy: { orden: 'asc' }, include: { _count: { select: { tenants: true } } } })
  return (
    <PlanesClient planes={planes.map((p) => ({
      id: p.id, codigo: p.codigo, nombre: p.nombre, descripcion: p.descripcion ?? '', precioMensual: Number(p.precioMensual), precioAnual: Number(p.precioAnual),
      maxUsuarios: p.maxUsuarios, maxProductos: p.maxProductos, maxFacturasMes: p.maxFacturasMes, diasPrueba: p.diasPrueba, orden: p.orden, activo: p.activo, tenants: p._count.tenants,
    }))} />
  )
}
