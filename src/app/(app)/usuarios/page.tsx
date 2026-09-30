import type { Metadata } from 'next'
import { requerirTenant } from '@/lib/auth/tenant'
import { prisma } from '@/lib/db/prisma'
import { UsuariosClient } from './UsuariosClient'

export const metadata: Metadata = { title: 'Usuarios' }

export default async function UsuariosPage() {
  const sesion = await requerirTenant('ADMIN')
  const usuarios = await prisma.usuario.findMany({
    where: { tenantId: sesion.tenantId, rol: { not: 'SUPERADMIN' } },
    select: { id: true, nombre: true, email: true, rol: true, activo: true, createdAt: true, _count: { select: { ventas: true } } },
    orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
  })
  return (
    <UsuariosClient
      yoId={sesion.sub}
      usuarios={usuarios.map((u) => ({
        id: u.id, nombre: u.nombre, email: u.email, rol: u.rol as 'USER' | 'ADMIN', activo: u.activo,
        creado: u.createdAt.toISOString(), ventas: u._count.ventas,
      }))}
    />
  )
}
