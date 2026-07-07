import type { Metadata } from 'next'
import { requerirTenant } from '@/lib/auth/tenant'
import { prisma } from '@/lib/db/prisma'
import { VentasClient } from './VentasClient'

export const metadata: Metadata = { title: 'Ventas' }

export default async function VentasPage() {
  const sesion = await requerirTenant()

  const ventas = await prisma.venta.findMany({
    where: { tenantId: sesion.tenantId },
    include: {
      cliente: { select: { nombre: true, identificacion: true } },
      factura: { select: { estado: true, numeroAutorizacion: true } },
      _count: { select: { items: true } },
    },
    orderBy: { fecha: 'desc' },
    take: 100,
  })

  const ventasPlanas = ventas.map((v) => ({
    id: v.id,
    numero: v.numero,
    cliente: v.cliente?.nombre ?? 'Consumidor final',
    items: v._count.items,
    total: Number(v.total),
    formaPago: v.formaPago,
    requiereFactura: v.requiereFactura,
    facturaEstado: v.factura?.estado ?? null,
    estado: v.estado,
    fecha: v.fecha.toISOString(),
  }))

  const hayEmisor = !!(await prisma.emisorSRI.findUnique({ where: { tenantId: sesion.tenantId }, select: { id: true } }))
  const puedeAnular = sesion.rol === 'ADMIN' || sesion.rol === 'SUPERADMIN'

  return <VentasClient ventas={ventasPlanas} hayEmisor={hayEmisor} puedeAnular={puedeAnular} />
}
