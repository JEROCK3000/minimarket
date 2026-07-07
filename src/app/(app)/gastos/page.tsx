import type { Metadata } from 'next'
import { requerirTenant } from '@/lib/auth/tenant'
import { prisma } from '@/lib/db/prisma'
import { GastosClient } from './GastosClient'

export const metadata: Metadata = { title: 'Gastos' }

export default async function GastosPage() {
  const sesion = await requerirTenant()

  // Gastos del mes actual
  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)

  const gastos = await prisma.gasto.findMany({
    where: { tenantId: sesion.tenantId },
    orderBy: { fecha: 'desc' },
    take: 200,
  })

  const gastosPlanos = gastos.map((g) => ({
    id: g.id,
    categoria: g.categoria,
    descripcion: g.descripcion,
    monto: Number(g.monto),
    fecha: g.fecha.toISOString(),
  }))

  const totalMes = gastos
    .filter((g) => g.fecha >= inicioMes)
    .reduce((s, g) => s + Number(g.monto), 0)

  const puedeEditar = sesion.rol === 'ADMIN' || sesion.rol === 'SUPERADMIN'

  return <GastosClient gastos={gastosPlanos} totalMes={totalMes} puedeEditar={puedeEditar} />
}
