import type { Metadata } from 'next'
import { requerirTenant } from '@/lib/auth/tenant'
import { prisma } from '@/lib/db/prisma'
import { obtenerEstadoCaja } from '@/lib/caja/estado'
import { CajaClient } from './CajaClient'

export const metadata: Metadata = { title: 'Cierre de Caja' }

export default async function CajaPage() {
  const sesion = await requerirTenant()

  const estado = await obtenerEstadoCaja(sesion.tenantId)

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

  return (
    <CajaClient
      resumen={estado.resumen}
      desde={estado.desde.toISOString()}
      origenDesde={estado.origenDesde}
      apertura={estado.apertura}
      cierres={cierresPlanos}
    />
  )
}
