import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requerirTenant } from '@/lib/auth/tenant'
import { prisma } from '@/lib/db/prisma'
import { calcularPedidoSugerido } from '@/lib/compras/pedido-sugerido'
import { PedidoClient } from './PedidoClient'

export const metadata: Metadata = { title: 'Pedido sugerido' }

const entero = (v: string | undefined, def: number, min: number, max: number) => Math.min(max, Math.max(min, parseInt(v ?? '', 10) || def))

export default async function PedidoPage({ searchParams }: { searchParams: Promise<{ proveedor?: string; dias?: string; cobertura?: string }> }) {
  const sesion = await requerirTenant()
  if (sesion.rol !== 'ADMIN') redirect('/compras')
  const sp = await searchParams
  const dias = entero(sp.dias, 30, 7, 180)
  const cobertura = entero(sp.cobertura, 15, 1, 90)
  const [proveedores, tenant] = await Promise.all([
    prisma.proveedor.findMany({ where: { tenantId: sesion.tenantId, activo: true }, orderBy: { nombre: 'asc' }, select: { id: true, nombre: true, telefono: true } }),
    prisma.tenant.findUnique({ where: { id: sesion.tenantId }, select: { nombre: true } }),
  ])
  const proveedorId = proveedores.some((p) => p.id === sp.proveedor) ? sp.proveedor! : ''
  const lineas = (await calcularPedidoSugerido(sesion.tenantId, { proveedorId: proveedorId || undefined, dias, cobertura })) ?? []
  return (
    <PedidoClient
      key={`${proveedorId}-${dias}-${cobertura}`}
      negocio={tenant?.nombre ?? 'MiniMarket'} proveedores={proveedores} proveedorId={proveedorId} dias={dias} cobertura={cobertura} lineas={lineas}
    />
  )
}
