import type { Metadata } from 'next'
import Link from 'next/link'
import { prisma } from '@/lib/db/prisma'
import { hashToken } from '@/lib/saas/solicitudes'
import { leerConfigGlobal, CLAVE_DATOS_PAGO } from '@/lib/config/global'
import { SubirComprobante } from './SubirComprobante'
import { CheckCircle2, Clock, XCircle, FileCheck } from 'lucide-react'

export const metadata: Metadata = { title: 'Tu solicitud', robots: 'noindex' }

/** Página privada del solicitante (el enlace con el token es su única llave). */
export default async function SolicitudPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const s = token && token.length <= 100
    ? await prisma.solicitudRegistro.findUnique({ where: { tokenHash: hashToken(token) }, include: { plan: true } })
    : null
  const datosPago = await leerConfigGlobal(CLAVE_DATOS_PAGO)
  const marco = (contenido: React.ReactNode) => (
    <main className="min-h-screen px-4 py-10 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-[#0a0a16] dark:to-[#111827]">
      <div className="w-full max-w-lg mx-auto space-y-4">{contenido}
        <p className="text-center text-sm text-gray-500"><Link href="/login" className="text-brand-600 dark:text-brand-400 font-semibold hover:underline">Ir a iniciar sesión</Link></p>
      </div>
    </main>
  )
  if (!s) return marco(<div className="card text-center text-sm text-gray-500">Este enlace no es válido.</div>)

  const monto = s.cicloFacturacion === 'ANUAL' ? Number(s.plan.precioAnual) : Number(s.plan.precioMensual)
  const estado = {
    PENDIENTE: { i: Clock, t: s.comprobantePath ? 'Comprobante recibido: estamos verificando tu pago' : 'Pendiente de pago', c: 'text-amber-600' },
    PAGO_VERIFICADO: { i: FileCheck, t: 'Pago verificado: tu cuenta se activará en breve', c: 'text-brand-600' },
    APROBADO: { i: CheckCircle2, t: '¡Tu minimarket está activo! Ya puedes iniciar sesión', c: 'text-emerald-600' },
    RECHAZADO: { i: XCircle, t: 'Solicitud rechazada', c: 'text-red-600' },
  }[s.estado as 'PENDIENTE'] ?? { i: Clock, t: s.estado, c: 'text-gray-600' }
  const Icono = estado.i
  return marco(<>
    <div className="card text-center space-y-2">
      <Icono size={40} className={`mx-auto ${estado.c}`} />
      <h1 className="font-black text-lg text-gray-900 dark:text-white">{s.nombreNegocio}</h1>
      <p className={`text-sm font-semibold ${estado.c}`}>{estado.t}</p>
      {s.estado === 'RECHAZADO' && s.motivoRechazo && <p className="text-sm text-gray-600 dark:text-gray-300">Motivo: {s.motivoRechazo}</p>}
      <p className="text-xs text-gray-500">Plan {s.plan.nombre} · {s.cicloFacturacion === 'ANUAL' ? 'anual' : 'mensual'} · <strong>${monto.toFixed(2)}</strong></p>
    </div>
    {s.estado === 'PENDIENTE' && (
      <div className="card space-y-3">
        <h2 className="font-bold text-gray-900 dark:text-white text-sm">Datos para el pago</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line">{datosPago || 'Solinteec te contactará con los datos de pago.'}</p>
        <p className="text-xs text-gray-500">Guarda este enlace: con él puedes volver a subir tu comprobante y ver el estado de tu solicitud.</p>
        <SubirComprobante token={token} yaSubido={!!s.comprobantePath} />
      </div>
    )}
    {s.estado === 'APROBADO' && <p className="text-center text-sm text-gray-600 dark:text-gray-300">Inicia sesión con <strong>{s.adminEmail}</strong> y la contraseña que elegiste.</p>}
  </>)
}
