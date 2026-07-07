import type { Metadata } from 'next'
import { requerirTenant } from '@/lib/auth/tenant'
import { prisma } from '@/lib/db/prisma'
import Link from 'next/link'
import {
  DollarSign, ShoppingCart, Package, AlertTriangle, TrendingUp, Wallet, ArrowRight,
} from 'lucide-react'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const sesion = await requerirTenant()
  const t = sesion.tenantId

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0)

  const [ventasHoy, ventasMes, totalProductos, productosBajoStock, gastosMes, topProductos] = await Promise.all([
    prisma.venta.aggregate({ where: { tenantId: t, fecha: { gte: hoy }, estado: 'COMPLETADA' }, _sum: { total: true }, _count: true }),
    prisma.venta.aggregate({ where: { tenantId: t, fecha: { gte: inicioMes }, estado: 'COMPLETADA' }, _sum: { total: true }, _count: true }),
    prisma.producto.count({ where: { tenantId: t, activo: true } }),
    prisma.producto.findMany({
      where: { tenantId: t, activo: true },
      select: { id: true, nombre: true, stock: true, stockMinimo: true, unidad: true },
    }),
    prisma.gasto.aggregate({ where: { tenantId: t, fecha: { gte: inicioMes } }, _sum: { monto: true } }),
    prisma.ventaItem.groupBy({
      by: ['productoId'],
      where: { venta: { tenantId: t, fecha: { gte: inicioMes } } },
      _sum: { cantidad: true, subtotal: true },
      orderBy: { _sum: { subtotal: 'desc' } },
      take: 5,
    }),
  ])

  const bajoStock = productosBajoStock.filter((p) => Number(p.stock) <= Number(p.stockMinimo))

  const topIds = topProductos.map((tp) => tp.productoId)
  const nombres = topIds.length
    ? await prisma.producto.findMany({ where: { id: { in: topIds } }, select: { id: true, nombre: true } })
    : []
  const mapNombre = new Map(nombres.map((n) => [n.id, n.nombre]))

  const money = (n: number) => `$${n.toFixed(2)}`
  const totalVentasMes = Number(ventasMes._sum.total ?? 0)
  const totalGastosMes = Number(gastosMes._sum.monto ?? 0)

  const kpis = [
    { label: 'Ventas de hoy', valor: money(Number(ventasHoy._sum.total ?? 0)), sub: `${ventasHoy._count} venta(s)`, icon: DollarSign, color: 'text-green-600 bg-green-50 dark:bg-green-500/10' },
    { label: 'Ventas del mes', valor: money(totalVentasMes), sub: `${ventasMes._count} venta(s)`, icon: ShoppingCart, color: 'text-brand-600 bg-brand-50 dark:bg-brand-500/10' },
    { label: 'Gastos del mes', valor: money(totalGastosMes), sub: 'egresos', icon: Wallet, color: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10' },
    { label: 'Balance del mes', valor: money(totalVentasMes - totalGastosMes), sub: 'ventas − gastos', icon: TrendingUp, color: 'text-purple-600 bg-purple-50 dark:bg-purple-500/10' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">Hola, {sesion.nombre.split(' ')[0]} 👋</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Resumen de tu minimarket</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="card">
            <div className={`w-9 h-9 rounded-xl grid place-items-center mb-3 ${k.color}`}><k.icon size={17} /></div>
            <p className="text-xl font-black text-gray-900 dark:text-white">{k.valor}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{k.label}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-bold text-gray-900 dark:text-white text-sm mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-brand-600" /> Más vendidos del mes
          </h3>
          {topProductos.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">Aún no hay ventas este mes.</p>
          ) : (
            <div className="space-y-3">
              {topProductos.map((tp, i) => (
                <div key={tp.productoId} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-lg bg-gray-100 dark:bg-white/10 grid place-items-center text-xs font-bold text-gray-500">{i + 1}</span>
                  <span className="flex-1 text-sm text-gray-900 dark:text-white truncate">{mapNombre.get(tp.productoId) ?? '—'}</span>
                  <span className="text-xs text-gray-400">{Number(tp._sum.cantidad ?? 0)} u.</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white w-16 text-right">{money(Number(tp._sum.subtotal ?? 0))}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="font-bold text-gray-900 dark:text-white text-sm mb-4 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" /> Reposición necesaria
            <span className="ml-auto text-xs text-gray-400">{totalProductos} productos</span>
          </h3>
          {bajoStock.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">Todo el inventario está sobre el mínimo. 👍</p>
          ) : (
            <div className="space-y-2">
              {bajoStock.slice(0, 6).map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-900 dark:text-white truncate">{p.nombre}</span>
                  <span className="text-amber-600 dark:text-amber-400 font-bold text-xs">
                    {Number(p.stock)} {p.unidad} <span className="text-gray-400 font-normal">/ mín {Number(p.stockMinimo)}</span>
                  </span>
                </div>
              ))}
              <Link href="/compras" className="inline-flex items-center gap-1 text-xs text-brand-600 font-semibold pt-2 hover:gap-2 transition-all">
                Registrar compra <ArrowRight size={13} />
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/pos" className="btn-primary"><ShoppingCart size={16} /> Ir al Punto de Venta</Link>
        <Link href="/productos" className="btn-ghost"><Package size={16} /> Productos</Link>
        <Link href="/reportes" className="btn-ghost"><TrendingUp size={16} /> Reportes</Link>
      </div>
    </div>
  )
}
