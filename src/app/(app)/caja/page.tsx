import type { Metadata } from 'next'
import { requerirTenant } from '@/lib/auth/tenant'
import { prisma } from '@/lib/db/prisma'
import { obtenerResumenCaja } from './actions'
import { CajaClient } from './CajaClient'

export const metadata: Metadata = { title: 'Cierre de Caja' }

export default async function CajaPage() {
  const sesion = await requerirTenant()

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const ahora = new Date()
  const resumen = await obtenerResumenCaja(sesion.tenantId, hoy, ahora)

  const cierres = await prisma.cierreCaja.findMany({
    where: { tenantId: sesion.tenantId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })
  const cierresPlanos = cierres.map((c) => ({
    id: c.id,
    fecha: c.createdAt.toISOString(),
    usuario: c.usuarioNombre ?? '—',
    totalVendido: Number(c.totalVendido),
    efectivoEsperado: Number(c.efectivoEsperado),
    efectivoContado: Number(c.efectivoContado),
    diferencia: Number(c.diferencia),
  }))

  return <CajaClient resumen={resumen} cierres={cierresPlanos} />
}
