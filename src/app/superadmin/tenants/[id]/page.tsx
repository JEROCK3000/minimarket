import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import { requerirSuperadmin } from '@/lib/auth/session'
import { calcularEstado } from '@/lib/saas/suscripcion'
import { EstadoBadge } from '../../EstadoBadge'
import { TenantAdmin } from './TenantAdmin'
import { ArrowLeft } from 'lucide-react'

export const metadata: Metadata = { title: 'Minimarket' }

export default async function TenantDetallePage({ params }: { params: Promise<{ id: string }> }) {
  await requerirSuperadmin()
  const { id } = await params
  const t = await prisma.tenant.findUnique({ where: { id }, include: { plan: true } })
  if (!t) notFound()
  const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0)
  const [usuarios, pagos, planes, ventas, facturasMes, productos, clientes, emisor] = await Promise.all([
    prisma.usuario.findMany({ where: { tenantId: id }, orderBy: [{ rol: 'asc' }, { nombre: 'asc' }], select: { id: true, nombre: true, email: true, rol: true, activo: true } }),
    prisma.pagoSuscripcion.findMany({ where: { tenantId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.planSuscripcion.findMany({ orderBy: { orden: 'asc' }, select: { id: true, nombre: true, activo: true } }),
    prisma.venta.aggregate({ where: { tenantId: id, estado: 'COMPLETADA' }, _sum: { total: true }, _count: true }),
    prisma.facturaSRI.count({ where: { tenantId: id, estado: 'AUTORIZADA', fechaAutorizacion: { gte: inicioMes } } }),
    prisma.producto.count({ where: { tenantId: id, activo: true } }),
    prisma.cliente.count({ where: { tenantId: id, activo: true } }),
    prisma.emisorSRI.findUnique({ where: { tenantId: id }, select: { ruc: true, razonSocial: true, ambiente: true } }),
  ])
  const est = calcularEstado(t)
  const kpis = [
    { n: 'Total vendido', v: `$${Number(ventas._sum.total ?? 0).toFixed(2)}` },
    { n: 'Ventas', v: ventas._count },
    { n: 'Facturas este mes', v: `${facturasMes}${t.plan?.maxFacturasMes ? ` / ${t.plan.maxFacturasMes}` : ''}` },
    { n: 'Productos', v: `${productos}${t.plan?.maxProductos ? ` / ${t.plan.maxProductos}` : ''}` },
    { n: 'Clientes', v: clientes },
    { n: 'Usuarios activos', v: `${usuarios.filter((u) => u.activo).length}${t.plan?.maxUsuarios ? ` / ${t.plan.maxUsuarios}` : ''}` },
  ]
  return (
    <div className="space-y-6">
      <Link href="/superadmin" className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white inline-flex items-center gap-1"><ArrowLeft size={14} /> Minimarkets</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">{t.nombre}</h1>
        <EstadoBadge estado={est.estado} />
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 -mt-4">
        {emisor ? <>Emisor SRI: <span className="font-mono">{emisor.ruc}</span> · {emisor.razonSocial} · {emisor.ambiente === 2 ? 'Producción' : 'Pruebas'}</> : 'Emisor SRI sin configurar'}
      </p>
      <TenantAdmin
        tenant={{
          id: t.id, nombre: t.nombre, ruc: t.ruc, emailContacto: t.emailContacto, telefono: t.telefono, notasAdmin: t.notasAdmin,
          planId: t.planId, cicloFacturacion: t.cicloFacturacion as 'MENSUAL' | 'ANUAL', estadoGuardado: t.estado, suspendidoManual: t.suspendidoManual,
          fechaExpiracion: t.fechaExpiracion?.toISOString() ?? null, estado: est.estado, diasRestantes: est.diasRestantes, slug: t.slug, creado: t.createdAt.toISOString(),
        }}
        kpis={kpis}
        usuarios={usuarios}
        pagos={pagos.map((p) => ({ id: p.id, fecha: p.createdAt.toISOString(), tipo: p.tipo, monto: Number(p.monto), referencia: p.referencia, desde: p.periodoDesde.toISOString(), hasta: p.periodoHasta.toISOString() }))}
        planes={planes}
      />
    </div>
  )
}
