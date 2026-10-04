import type { Metadata } from 'next'
import Link from 'next/link'
import { prisma } from '@/lib/db/prisma'
import { requerirSuperadmin } from '@/lib/auth/session'
import { leerConfigGlobal, CLAVE_RUC_PROVEEDOR } from '@/lib/config/global'
import { calcularEstado, type EstadoSuscripcion } from '@/lib/saas/suscripcion'
import { EstadoBadge } from './EstadoBadge'
import { AlertTriangle, Plus, Eye } from 'lucide-react'

export const metadata: Metadata = { title: 'Panel Solinteec' }

export default async function SuperadminPage() {
  await requerirSuperadmin()
  const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0)
  const [tenants, ruc, emisores, pendientes, ingresosMes] = await Promise.all([
    prisma.tenant.findMany({
      orderBy: { nombre: 'asc' },
      select: {
        id: true, nombre: true, ruc: true, estado: true, suspendidoManual: true, fechaExpiracion: true, createdAt: true,
        plan: { select: { nombre: true } },
        _count: { select: { usuarios: true, productos: true, ventas: true } },
      },
    }),
    leerConfigGlobal(CLAVE_RUC_PROVEEDOR),
    prisma.emisorSRI.findMany({ select: { tenantId: true, ruc: true, ambiente: true } }),
    prisma.solicitudRegistro.count({ where: { estado: { in: ['PENDIENTE', 'PAGO_VERIFICADO'] } } }),
    prisma.pagoSuscripcion.aggregate({ where: { createdAt: { gte: inicioMes } }, _sum: { monto: true } }),
  ])
  const emisorDe = new Map(emisores.map((e) => [e.tenantId, e]))
  const filas = tenants.map((t) => ({ ...t, efectivo: calcularEstado(t) }))
  const cuenta = (e: EstadoSuscripcion) => filas.filter((f) => f.efectivo.estado === e).length
  const kpis = [
    { n: 'Minimarkets activos', v: cuenta('ACTIVO') + cuenta('PRUEBA') },
    { n: 'En gracia / suspendidos', v: `${cuenta('GRACIA')} / ${cuenta('SUSPENDIDO')}` },
    { n: 'Solicitudes por revisar', v: pendientes, href: '/superadmin/solicitudes' },
    { n: 'Cobrado este mes', v: `$${Number(ingresosMes._sum.monto ?? 0).toFixed(2)}` },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Minimarkets</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Negocios suscritos a la plataforma.</p>
        </div>
        <Link href="/superadmin/tenants/nuevo" className="btn-primary"><Plus size={16} /> Nuevo minimarket</Link>
      </div>

      {!ruc && (
        <div className="card flex items-start gap-3 border-amber-400/40 bg-amber-50/60 dark:bg-amber-500/5 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <p>No hay <strong>RUC Proveedor</strong> configurado (Res. SRI NAC-DGERCGC26-00000027). <Link href="/superadmin/configuracion" className="underline font-semibold">Configurarlo</Link></p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => {
          const contenido = (<><p className="text-xs text-gray-500">{k.n}</p><p className="text-2xl font-black text-gray-900 dark:text-white">{k.v}</p></>)
          return k.href ? <Link key={k.n} href={k.href} className="card hover:border-brand-500 transition">{contenido}</Link> : <div key={k.n} className="card">{contenido}</div>
        })}
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/5 text-left text-xs text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 font-semibold">Minimarket</th>
                <th className="px-4 py-3 font-semibold">Plan</th>
                <th className="px-4 py-3 font-semibold">Vence</th>
                <th className="px-4 py-3 font-semibold">Emisor SRI</th>
                <th className="px-4 py-3 font-semibold text-center">Usuarios / Ventas</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">Aún no hay minimarkets.</td></tr>}
              {filas.map((t) => {
                const e = emisorDe.get(t.id)
                return (
                  <tr key={t.id} className="border-b border-gray-50 dark:border-white/5">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900 dark:text-white">{t.nombre}</p>
                      <p className="text-xs text-gray-400">{t.ruc ? <span className="font-mono">{t.ruc}</span> : 'sin RUC'} · desde {t.createdAt.toLocaleDateString('es-EC')}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{t.plan?.nombre ?? <span className="text-gray-400">Sin plan</span>}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">{t.fechaExpiracion ? t.fechaExpiracion.toLocaleDateString('es-EC') : <span className="text-gray-400">No vence</span>}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">{e ? <>{e.ambiente === 2 ? 'Producción' : 'Pruebas'}</> : <span className="text-gray-400">Sin configurar</span>}</td>
                    <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-300">{t._count.usuarios} / {t._count.ventas}</td>
                    <td className="px-4 py-3"><EstadoBadge estado={t.efectivo.estado} /></td>
                    <td className="px-4 py-3 text-right"><Link href={`/superadmin/tenants/${t.id}`} className="btn-ghost h-8 px-2.5 text-xs"><Eye size={14} /> Ver</Link></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
