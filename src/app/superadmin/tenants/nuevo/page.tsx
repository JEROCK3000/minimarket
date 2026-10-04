import type { Metadata } from 'next'
import { prisma } from '@/lib/db/prisma'
import { requerirSuperadmin } from '@/lib/auth/session'
import { NuevoTenantForm } from './NuevoTenantForm'

export const metadata: Metadata = { title: 'Nuevo minimarket' }

export default async function NuevoTenantPage() {
  await requerirSuperadmin()
  const planes = await prisma.planSuscripcion.findMany({ where: { activo: true }, orderBy: { orden: 'asc' }, select: { id: true, nombre: true, precioMensual: true, diasPrueba: true } })
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">Nuevo minimarket</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Crea el negocio y su usuario administrador. El administrador configura después su emisor SRI y su firma electrónica.</p>
      </div>
      <NuevoTenantForm planes={planes.map((p) => ({ id: p.id, nombre: p.nombre, precioMensual: Number(p.precioMensual), diasPrueba: p.diasPrueba }))} />
    </div>
  )
}
