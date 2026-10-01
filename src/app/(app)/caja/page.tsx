import type { Metadata } from 'next'
import { requerirTenant } from '@/lib/auth/tenant'
import { prisma } from '@/lib/db/prisma'
import { obtenerEstadoCaja } from '@/lib/caja/estado'
import { CajaClient } from './CajaClient'
import { usaControlCaja } from '@/lib/config/negocio'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Cierre de Caja' }

export default async function CajaPage() {
  const sesion = await requerirTenant()

  if (!(await usaControlCaja(sesion.tenantId))) {
    return (
      <div className="card max-w-lg space-y-2">
        <h1 className="text-lg font-black text-gray-900 dark:text-white">El control de caja está desactivado</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Este negocio vende sin apertura ni cierre de caja. Un administrador puede activarlo en{' '}
          <Link href="/configuracion/operacion" className="text-brand-600 dark:text-brand-400 hover:underline">Configuración → Operación</Link>.
        </p>
      </div>
    )
  }

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
