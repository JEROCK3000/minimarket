import type { Metadata } from 'next'
import { requerirTenant } from '@/lib/auth/tenant'
import { prisma } from '@/lib/db/prisma'
import { obtenerSuscripcion } from '@/lib/saas/suscripcion'
import { ConfigTabs } from '../ConfigTabs'

export const metadata: Metadata = { title: 'Mi suscripción' }

const ETIQUETA: Record<string, { t: string; c: string }> = {
  ACTIVO: { t: 'Activa', c: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' },
  PRUEBA: { t: 'En prueba', c: 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400' },
  GRACIA: { t: 'Vencida (gracia)', c: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' },
  SUSPENDIDO: { t: 'Suspendida', c: 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400' },
  CANCELADO: { t: 'Cancelada', c: 'bg-gray-100 text-gray-600' },
}

/** Estado de la suscripción del minimarket (solo lectura; la gestiona Solinteec). */
export default async function SuscripcionPage() {
  const sesion = await requerirTenant('ADMIN')
  const t = sesion.tenantId
  const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0)
  const [s, tenant, usuarios, productos, facturasMes, pagos] = await Promise.all([
    obtenerSuscripcion(t),
    prisma.tenant.findUnique({ where: { id: t }, select: { cicloFacturacion: true, plan: { select: { precioMensual: true, precioAnual: true } } } }),
    prisma.usuario.count({ where: { tenantId: t, activo: true } }),
    prisma.producto.count({ where: { tenantId: t, activo: true } }),
    prisma.facturaSRI.count({ where: { tenantId: t, estado: 'AUTORIZADA', fechaAutorizacion: { gte: inicioMes } } }),
    prisma.pagoSuscripcion.findMany({ where: { tenantId: t }, orderBy: { createdAt: 'desc' }, take: 12 }),
  ])
  const e = ETIQUETA[s.estado]
  const fecha = (d: Date | null) => (d ? d.toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
  const uso = [
    { n: 'Usuarios activos', v: usuarios, m: s.plan?.maxUsuarios },
    { n: 'Productos', v: productos, m: s.plan?.maxProductos },
    { n: 'Facturas este mes', v: facturasMes, m: s.plan?.maxFacturasMes },
  ]
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">Configuración</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Ajustes del sistema</p>
      </div>
      <ConfigTabs />
      <div className="card space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-gray-500">Plan</p>
            <p className="text-xl font-black text-gray-900 dark:text-white">{s.plan?.nombre ?? 'Sin plan asignado'}</p>
            {tenant?.plan && (
              <p className="text-xs text-gray-500 mt-0.5">
                {tenant.cicloFacturacion === 'ANUAL' ? `$${Number(tenant.plan.precioAnual).toFixed(2)} / año` : `$${Number(tenant.plan.precioMensual).toFixed(2)} / mes`}
              </p>
            )}
          </div>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${e.c}`}>{e.t}</span>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {s.fechaExpiracion ? <>Vence el <strong>{fecha(s.fechaExpiracion)}</strong>{s.diasRestantes !== null && s.diasRestantes >= 0 ? ` (en ${s.diasRestantes} día(s))` : ''}.</> : 'Sin fecha de vencimiento.'}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {uso.map((u) => (
            <div key={u.n} className="rounded-xl bg-gray-50 dark:bg-white/5 p-3">
              <p className="text-xs text-gray-500">{u.n}</p>
              <p className="font-bold text-gray-900 dark:text-white">{u.v}<span className="text-gray-400 font-normal"> / {u.m ?? '∞'}</span></p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-400">Para renovar o cambiar de plan, comunícate con Solinteec.</p>
      </div>
      <div className="card">
        <h2 className="font-bold text-gray-900 dark:text-white text-sm mb-3">Pagos registrados</h2>
        {pagos.length === 0 ? <p className="text-sm text-gray-400">Aún no hay pagos registrados.</p> : (
          <table className="w-full text-sm"><tbody>
            {pagos.map((p) => (
              <tr key={p.id} className="border-b border-gray-50 dark:border-white/5 last:border-0">
                <td className="py-2 text-gray-500">{fecha(p.createdAt)}</td>
                <td className="py-2 text-gray-600 dark:text-gray-300">{fecha(p.periodoDesde)} → {fecha(p.periodoHasta)}</td>
                <td className="py-2 text-xs text-gray-500">{p.tipo}</td>
                <td className="py-2 text-right font-semibold text-gray-900 dark:text-white">${Number(p.monto).toFixed(2)}</td>
              </tr>
            ))}
          </tbody></table>
        )}
      </div>
    </div>
  )
}
