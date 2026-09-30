import type { Metadata } from 'next'
import { requerirTenant } from '@/lib/auth/tenant'
import { prisma } from '@/lib/db/prisma'
import { ProveedoresClient } from './ProveedoresClient'

export const metadata: Metadata = { title: 'Proveedores' }

export default async function ProveedoresPage() {
  const sesion = await requerirTenant('ADMIN')
  const [proveedores, totales, deudas] = await Promise.all([
    prisma.proveedor.findMany({ where: { tenantId: sesion.tenantId }, orderBy: [{ activo: 'desc' }, { nombre: 'asc' }] }),
    prisma.compra.groupBy({
      by: ['proveedorId'],
      where: { tenantId: sesion.tenantId, estado: 'ACTIVA', proveedorId: { not: null } },
      _sum: { total: true }, _count: { _all: true }, _max: { fecha: true },
    }),
    prisma.compra.findMany({
      where: { tenantId: sesion.tenantId, estado: 'ACTIVA', saldoPendiente: { gt: 0 }, proveedorId: { not: null } },
      select: { proveedorId: true, saldoPendiente: true, venceEl: true },
    }),
  ])
  const ahora = Date.now()
  const deudaPor = new Map<string, { saldo: number; vencido: number }>()
  for (const d of deudas) {
    const x = deudaPor.get(d.proveedorId!) ?? { saldo: 0, vencido: 0 }
    x.saldo += Number(d.saldoPendiente)
    if (d.venceEl && d.venceEl.getTime() < ahora) x.vencido += Number(d.saldoPendiente)
    deudaPor.set(d.proveedorId!, x)
  }
  const porProveedor = new Map(totales.map((t) => [t.proveedorId, t]))
  return (
    <ProveedoresClient
      proveedores={proveedores.map((p) => {
        const t = porProveedor.get(p.id)
        return {
          id: p.id, nombre: p.nombre, identificacion: p.identificacion, telefono: p.telefono, email: p.email,
          direccion: p.direccion, activo: p.activo,
          compras: t?._count._all ?? 0, totalComprado: Number(t?._sum.total ?? 0), ultimaCompra: t?._max.fecha?.toISOString() ?? null,
          porPagar: deudaPor.get(p.id)?.saldo ?? 0, vencido: deudaPor.get(p.id)?.vencido ?? 0,
        }
      })}
    />
  )
}
