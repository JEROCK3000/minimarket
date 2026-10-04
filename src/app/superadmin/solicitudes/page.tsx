import type { Metadata } from 'next'
import Link from 'next/link'
import { prisma } from '@/lib/db/prisma'
import { requerirSuperadmin } from '@/lib/auth/session'
import { EstadoSolicitud } from './EstadoSolicitud'
import { Paperclip, Inbox } from 'lucide-react'
import type { Prisma } from '@prisma/client'

export const metadata: Metadata = { title: 'Solicitudes de registro' }

const FILTROS: { k: string; t: string; w: Prisma.SolicitudRegistroWhereInput }[] = [
  { k: 'abiertas', t: 'Por revisar', w: { estado: { in: ['PENDIENTE', 'PAGO_VERIFICADO'] } } },
  { k: 'APROBADO', t: 'Aprobadas', w: { estado: 'APROBADO' } },
  { k: 'RECHAZADO', t: 'Rechazadas', w: { estado: 'RECHAZADO' } },
  { k: 'todas', t: 'Todas', w: {} },
]

export default async function SolicitudesPage({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  await requerirSuperadmin()
  const sp = await searchParams
  const filtro = FILTROS.find((x) => x.k === sp.f) ?? FILTROS[0]
  const q = (sp.q ?? '').trim().slice(0, 100)
  const solicitudes = await prisma.solicitudRegistro.findMany({
    where: { ...filtro.w, ...(q ? { OR: [{ nombreNegocio: { contains: q } }, { ruc: { contains: q } }, { adminEmail: { contains: q } }] } : {}) },
    orderBy: { createdAt: 'desc' }, take: 200,
    select: { id: true, nombreNegocio: true, ruc: true, adminEmail: true, cicloFacturacion: true, estado: true, comprobantePath: true, createdAt: true, plan: { select: { nombre: true } } },
  })
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">Solicitudes de registro</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Negocios que se registraron desde <span className="font-mono">/registro</span>.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((x) => (
          <Link key={x.k} href={`/superadmin/solicitudes?f=${x.k}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${x.k === filtro.k ? 'bg-brand-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5'}`}>{x.t}</Link>
        ))}
        <form className="ml-auto w-full sm:w-64"><input type="hidden" name="f" value={filtro.k} />
          <input name="q" defaultValue={q} placeholder="Buscar negocio, RUC o correo" className="input h-9 text-sm" />
        </form>
      </div>
      <div className="card p-0 overflow-x-auto">
        {solicitudes.length === 0 ? (
          <div className="py-14 text-center text-sm text-gray-500"><Inbox className="mx-auto mb-2 text-gray-300" />No hay solicitudes en esta vista.</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-white/5">
              <th className="px-4 py-3 font-semibold">Negocio</th><th className="px-4 py-3 font-semibold">Plan</th>
              <th className="px-4 py-3 font-semibold">Recibida</th><th className="px-4 py-3 font-semibold">Estado</th>
            </tr></thead>
            <tbody>
              {solicitudes.map((s) => (
                <tr key={s.id} className="border-b border-gray-50 dark:border-white/5 last:border-0 hover:bg-gray-50 dark:hover:bg-white/5">
                  <td className="px-4 py-3">
                    <Link href={`/superadmin/solicitudes/${s.id}`} className="font-semibold text-gray-900 dark:text-white hover:text-brand-600">{s.nombreNegocio}</Link>
                    <p className="text-xs text-gray-500"><span className="font-mono">{s.ruc}</span> · {s.adminEmail}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{s.plan.nombre} <span className="text-xs text-gray-400">{s.cicloFacturacion === 'ANUAL' ? 'anual' : 'mensual'}</span></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{s.createdAt.toLocaleDateString('es-EC')}</td>
                  <td className="px-4 py-3"><div className="flex items-center gap-2"><EstadoSolicitud estado={s.estado} />{s.comprobantePath && <Paperclip size={14} className="text-gray-400" aria-label="Con comprobante" />}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
