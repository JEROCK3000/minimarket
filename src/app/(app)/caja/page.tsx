import type { Metadata } from 'next'
import { requerirTenant } from '@/lib/auth/tenant'
import { prisma } from '@/lib/db/prisma'
import { obtenerEstadoCaja } from '@/lib/caja/estado'
import { CajaClient } from './CajaClient'
import { usaControlCaja } from '@/lib/config/negocio'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Cierre de Caja' }

export default async function CajaPage({ searchParams }: { searchParams: Promise<{ apertura?: string }> }) {
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

  const sp = await searchParams
  const esAdmin = sesion.rol === 'ADMIN'
  // El ADMIN puede revisar/cerrar la caja de otro usuario (?apertura=id)
  const estado = await obtenerEstadoCaja(sesion.tenantId, sesion.sub, esAdmin && sp.apertura ? String(sp.apertura).slice(0, 40) : undefined)
  const [abiertas, cajas] = estado.varias
    ? await Promise.all([
        prisma.aperturaCaja.findMany({ where: { tenantId: sesion.tenantId, cerradaAt: null }, orderBy: { abiertaAt: 'asc' }, select: { id: true, cajaId: true, cajaNombre: true, usuarioId: true, usuarioNombre: true, abiertaAt: true } }),
        prisma.caja.findMany({ where: { tenantId: sesion.tenantId, activa: true }, orderBy: { nombre: 'asc' }, select: { id: true, nombre: true } }),
      ])
    : [[], []]
  const ocupadas = new Set(abiertas.map((a) => a.cajaId))

  const cierres = await prisma.cierreCaja.findMany({
    where: { tenantId: sesion.tenantId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })
  const cierresPlanos = cierres.map((c) => ({
    id: c.id,
    fecha: c.createdAt.toISOString(),
    usuario: `${c.usuarioNombre ?? '—'}${c.cajaNombre ? ` · ${c.cajaNombre}` : ''}`,
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
      varias={estado.varias}
      esAdmin={esAdmin}
      cajasLibres={cajas.filter((c) => !ocupadas.has(c.id))}
      abiertas={(esAdmin ? abiertas : []).map((a) => ({ id: a.id, caja: a.cajaNombre ?? 'Caja', usuario: a.usuarioNombre ?? '—', propia: a.usuarioId === sesion.sub, abiertaAt: a.abiertaAt.toISOString() }))}
    />
  )
}
