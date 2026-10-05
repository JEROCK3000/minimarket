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
      cliente: { select: { nombre: true, identificacion: true, email: true } },
      factura: { select: { estado: true, numeroAutorizacion: true } },
      notasCredito: { select: { id: true, tipo: true, estado: true, claveAcceso: true, valorModificacion: true, devolucionId: true }, orderBy: { createdAt: 'asc' } },
      devoluciones: { select: { numero: true, total: true }, orderBy: { createdAt: 'asc' } },
      _count: { select: { items: true } },
    },
    orderBy: { fecha: 'desc' },
    take: 100,
  })

  const ventasPlanas = ventas.map((v) => ({
    id: v.id,
    numero: v.numero,
    cliente: v.cliente?.nombre ?? 'Consumidor final',
    clienteEmail: v.cliente?.email ?? '',
    items: v._count.items,
    total: Number(v.total),
    formaPago: v.formaPago,
    saldoPendiente: Number(v.saldoPendiente),
    requiereFactura: v.requiereFactura,
    facturaEstado: v.factura?.estado ?? null,
    notaCreditoEstado: v.notasCredito.find((n) => n.tipo === 'TOTAL')?.estado ?? null,
    totalDevuelto: Number(v.totalDevuelto),
    devoluciones: v.devoluciones.map((d) => ({ numero: d.numero, total: Number(d.total) })),
    // NC parciales: autorizadas (para el RIDE) y pendientes (para consultar al SRI)
    ncParciales: v.notasCredito.filter((n) => n.tipo === 'PARCIAL' && n.estado !== 'RECHAZADA').map((n) => ({
      id: n.id, estado: n.estado, numero: `${n.claveAcceso.substring(24, 27)}-${n.claveAcceso.substring(27, 30)}-${n.claveAcceso.substring(30, 39)}`, valor: Number(n.valorModificacion),
    })),
    estado: v.estado,
    fecha: v.fecha.toISOString(),
  }))

  const hayEmisor = !!(await prisma.emisorSRI.findUnique({ where: { tenantId: sesion.tenantId }, select: { id: true } }))
  const puedeAnular = sesion.rol === 'ADMIN' || sesion.rol === 'SUPERADMIN'

  return <VentasClient ventas={ventasPlanas} hayEmisor={hayEmisor} puedeAnular={puedeAnular} />
}
