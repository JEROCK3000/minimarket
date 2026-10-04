import Link from 'next/link'
import { AlertTriangle, Clock, Ban } from 'lucide-react'
import type { Suscripcion } from '@/lib/saas/suscripcion'
import { DIAS_AVISO } from '@/lib/saas/suscripcion'

/** Banner de estado de la suscripción (como los avisos de SmartianERP). */
export function AvisoSuscripcion({ s }: { s: Suscripcion }) {
  const fecha = (d: Date | null) => (d ? d.toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' }) : '')
  let estilo = '', Icono = Clock, texto: React.ReactNode = null
  if (s.estado === 'SUSPENDIDO') {
    estilo = 'bg-red-50 text-red-800 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20'; Icono = Ban
    texto = <>Tu suscripción está <strong>suspendida</strong>: puedes consultar tu información, pero no vender, facturar ni registrar. Contacta a Solinteec para reactivarla.</>
  } else if (s.estado === 'GRACIA') {
    estilo = 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20'; Icono = AlertTriangle
    texto = <>Tu plan venció el {fecha(s.fechaExpiracion)}. Tienes acceso completo hasta el <strong>{fecha(s.graciaHasta)}</strong>; renuévalo para evitar la suspensión.</>
  } else if (s.diasRestantes !== null && s.diasRestantes <= DIAS_AVISO) {
    estilo = 'bg-brand-50 text-brand-800 border-brand-100 dark:bg-brand-500/10 dark:text-brand-300 dark:border-brand-500/20'
    texto = <>{s.estado === 'PRUEBA' ? 'Tu periodo de prueba' : 'Tu plan'} vence {s.diasRestantes <= 0 ? 'hoy' : `en ${s.diasRestantes} día(s)`} ({fecha(s.fechaExpiracion)}).</>
  }
  if (!texto) return null
  return (
    <div className={`border-b px-4 py-2 text-sm flex items-center gap-2 ${estilo}`} role="status">
      <Icono size={16} className="shrink-0" />
      <p className="flex-1">{texto}</p>
      <Link href="/configuracion/suscripcion" className="underline font-semibold shrink-0">Ver suscripción</Link>
    </div>
  )
}
