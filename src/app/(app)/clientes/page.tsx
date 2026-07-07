import type { Metadata } from 'next'
import { requerirTenant } from '@/lib/auth/tenant'
import { prisma } from '@/lib/db/prisma'
import { ClientesClient } from './ClientesClient'

export const metadata: Metadata = { title: 'Clientes' }

export default async function ClientesPage() {
  const sesion = await requerirTenant()

  const clientes = await prisma.cliente.findMany({
    where: { tenantId: sesion.tenantId, activo: true },
    include: { _count: { select: { ventas: true } } },
    orderBy: { nombre: 'asc' },
  })

  const planos = clientes.map((c) => ({
    id: c.id,
    tipoIdentificacion: c.tipoIdentificacion,
    identificacion: c.identificacion,
    nombre: c.nombre,
    telefono: c.telefono,
    email: c.email,
    direccion: c.direccion,
    compras: c._count.ventas,
  }))

  const puedeEliminar = sesion.rol === 'ADMIN' || sesion.rol === 'SUPERADMIN'

  return <ClientesClient clientes={planos} puedeEliminar={puedeEliminar} />
}
