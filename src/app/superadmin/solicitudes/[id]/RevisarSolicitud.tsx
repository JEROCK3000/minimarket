'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, BadgeCheck, CheckCircle2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { verificarPagoSolicitudAction, aprobarSolicitudAction, rechazarSolicitudAction } from '../actions'

export function RevisarSolicitud({ id, estado, diasPrueba, tieneComprobante }: { id: string; estado: string; diasPrueba: number; tieneComprobante: boolean }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [rechazando, setRechazando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const pagado = estado === 'PAGO_VERIFICADO'

  const ejecutar = async (clave: string, fn: () => Promise<{ error?: string; success?: boolean; tenantId?: string }>, ok: string) => {
    setOcupado(clave)
    try {
      const r = await fn()
      if (r.error) { toast.error(r.error); return }
      toast.success(ok)
      if (r.tenantId) router.push(`/superadmin/tenants/${r.tenantId}`)
      else router.refresh()
    } finally { setOcupado(null) }
  }
  const icono = (k: string, I: typeof BadgeCheck) => (ocupado === k ? <Loader2 size={16} className="animate-spin" /> : <I size={16} />)

  return (
    <div className="card space-y-4">
      <h2 className="font-bold text-gray-900 dark:text-white">Revisión</h2>
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {pagado
          ? 'Pago verificado. Al aprobar se crea el minimarket ACTIVO por el periodo pagado, se registra el pago y el administrador puede entrar con la contraseña que eligió.'
          : diasPrueba > 0
            ? `Puedes verificar el pago, o aprobar ya en PRUEBA por ${diasPrueba} días (sin registrar pago).`
            : 'Este plan no tiene días de prueba: verifica el pago antes de aprobar.'}
      </p>
      <div className="flex flex-wrap gap-2">
        {!pagado && (
          <button disabled={!!ocupado || !tieneComprobante} title={tieneComprobante ? '' : 'Sin comprobante'} className="btn-ghost"
            onClick={() => ejecutar('verificar', () => verificarPagoSolicitudAction(id), 'Pago verificado')}>{icono('verificar', BadgeCheck)} Verificar pago</button>
        )}
        {(pagado || diasPrueba > 0) && (
          <button disabled={!!ocupado} className="btn-primary"
            onClick={() => ejecutar('aprobar', () => aprobarSolicitudAction(id), 'Minimarket creado')}>{icono('aprobar', CheckCircle2)} {pagado ? 'Aprobar y activar' : `Aprobar en prueba (${diasPrueba} días)`}</button>
        )}
        {!rechazando && <button disabled={!!ocupado} className="btn-ghost text-red-600 dark:text-red-400" onClick={() => setRechazando(true)}><XCircle size={16} /> Rechazar</button>}
      </div>
      {rechazando && (
        <div className="space-y-2">
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} className="input min-h-[70px]" maxLength={300} autoFocus
            placeholder="Motivo (lo verá el solicitante, ej. el comprobante no corresponde al monto)" />
          <div className="flex justify-end gap-2">
            <button className="btn-ghost text-sm" onClick={() => { setRechazando(false); setMotivo('') }} disabled={!!ocupado}>Cancelar</button>
            <button className="btn-primary bg-red-600 hover:bg-red-700 text-sm" disabled={!!ocupado || motivo.trim().length < 5}
              onClick={() => ejecutar('rechazar', () => rechazarSolicitudAction(id, motivo), 'Solicitud rechazada')}>{icono('rechazar', XCircle)} Confirmar rechazo</button>
          </div>
        </div>
      )}
    </div>
  )
}
