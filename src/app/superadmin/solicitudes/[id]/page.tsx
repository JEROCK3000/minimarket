import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import { requerirSuperadmin } from '@/lib/auth/session'
import { EstadoSolicitud } from '../EstadoSolicitud'
import { RevisarSolicitud } from './RevisarSolicitud'
import { ArrowLeft, Paperclip } from 'lucide-react'

export const metadata: Metadata = { title: 'Solicitud de registro' }

export default async function SolicitudDetallePage({ params }: { params: Promise<{ id: string }> }) {
  await requerirSuperadmin()
  const { id } = await params
  const s = await prisma.solicitudRegistro.findUnique({ where: { id }, include: { plan: true } })
  if (!s) notFound()
  const monto = Number(s.cicloFacturacion === 'ANUAL' ? s.plan.precioAnual : s.plan.precioMensual)
  const fh = (d: Date) => d.toLocaleString('es-EC', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const lbl = 'text-[11px] font-semibold uppercase tracking-wide text-gray-400'
  const dato = (t: string, v: React.ReactNode) => <div><p className={lbl}>{t}</p><p className="text-sm text-gray-900 dark:text-white break-words">{v || '—'}</p></div>
  return (
    <div className="space-y-6 max-w-3xl">
      <Link href="/superadmin/solicitudes" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-600"><ArrowLeft size={15} /> Solicitudes</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">{s.nombreNegocio}</h1>
        <EstadoSolicitud estado={s.estado} />
      </div>
      <div className="card grid grid-cols-1 sm:grid-cols-2 gap-4">
        {dato('RUC', <span className="font-mono">{s.ruc}</span>)}
        {dato('Plan', `${s.plan.nombre} · ${s.cicloFacturacion === 'ANUAL' ? 'anual' : 'mensual'} · $${monto.toFixed(2)}`)}
        {dato('Correo de contacto', s.emailContacto)}
        {dato('Teléfono', s.telefono)}
        {dato('Dirección', s.direccion)}
        {dato('Administrador', `${s.adminNombre} · ${s.adminEmail}`)}
        {dato('Recibida', fh(s.createdAt))}
        {dato('Origen', <span className="text-xs text-gray-500">{s.ip ?? '—'}</span>)}
        {s.revisadoAt && dato('Revisada', `${fh(s.revisadoAt)} por ${s.revisadoPor ?? '—'}`)}
        {s.motivoRechazo && dato('Motivo del rechazo', s.motivoRechazo)}
      </div>
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-bold text-gray-900 dark:text-white text-sm">Comprobante de pago</p>
          <p className="text-xs text-gray-500">{s.comprobanteAt ? `Subido el ${fh(s.comprobanteAt)}` : 'El solicitante aún no ha subido el comprobante.'}</p>
        </div>
        {s.comprobantePath && (
          <a href={`/api/superadmin/comprobante/${s.id}`} target="_blank" rel="noopener noreferrer" className="btn-ghost text-sm"><Paperclip size={15} /> Ver comprobante</a>
        )}
      </div>
      {s.tenantId && <Link href={`/superadmin/tenants/${s.tenantId}`} className="btn-primary w-fit">Ver minimarket creado</Link>}
      {(s.estado === 'PENDIENTE' || s.estado === 'PAGO_VERIFICADO') && (
        <RevisarSolicitud id={s.id} estado={s.estado} diasPrueba={s.plan.diasPrueba} tieneComprobante={!!s.comprobantePath} />
      )}
    </div>
  )
}
