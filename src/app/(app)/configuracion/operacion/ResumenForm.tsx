'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save, Mail, Send } from 'lucide-react'
import { toast } from 'sonner'
import { guardarResumenDiarioAction, enviarResumenAhoraAction } from './actions'
import type { ConfigResumen } from '@/lib/reportes/resumen-diario'

export function ResumenForm({ config, correoConfigurado }: { config: ConfigResumen; correoConfigurado: boolean }) {
  const router = useRouter()
  const [activo, setActivo] = useState(config.activo)
  const [emails, setEmails] = useState(config.emails.join(', '))
  const [hora, setHora] = useState(config.hora)
  const [ocupado, setOcupado] = useState<'guardar' | 'enviar' | null>(null)
  const lista = emails.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean)

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setOcupado('guardar')
    try {
      const r = await guardarResumenDiarioAction({ activo, emails: lista, hora })
      if ('error' in r) { toast.error(r.error); return }
      toast.success(activo ? `Resumen diario activado: llegará cada día a las ${hora}:00` : 'Resumen diario desactivado'); router.refresh()
    } finally { setOcupado(null) }
  }
  const enviarAhora = async () => {
    setOcupado('enviar')
    try {
      const r = await enviarResumenAhoraAction()
      if ('error' in r) { toast.error(r.error); return }
      toast.success(`Resumen de hoy enviado a ${r.emails.join(', ')}`)
    } finally { setOcupado(null) }
  }
  const lbl = 'text-xs font-semibold text-gray-500 dark:text-gray-400'
  return (
    <form onSubmit={guardar} className="card space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2"><Mail size={17} /> Resumen diario por correo</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Cada día llega al dueño: ventas, utilidad estimada, gastos, cierres de caja, mermas, productos agotados y por vencer, y fiado vencido.
          </p>
        </div>
        <button type="button" role="switch" aria-checked={activo} aria-label="Enviar resumen diario" onClick={() => setActivo(!activo)}
          className={`relative shrink-0 w-12 h-7 rounded-full transition-colors ${activo ? 'bg-brand-600' : 'bg-gray-300 dark:bg-white/15'}`}>
          <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${activo ? 'translate-x-5' : ''}`} />
        </button>
      </div>
      {!correoConfigurado && (
        <p className="text-xs text-amber-700 dark:text-amber-400">Primero configura el envío de correos en <strong>Configuración → Correo</strong>.</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-3">
        <div className="space-y-1.5">
          <label htmlFor="rs-emails" className={lbl}>Enviar a (hasta 3 correos, separados por coma)</label>
          <input id="rs-emails" value={emails} onChange={(e) => setEmails(e.target.value)} className="input" placeholder="dueno@correo.com" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="rs-hora" className={lbl}>Hora de envío</label>
          <select id="rs-hora" value={hora} onChange={(e) => setHora(Number(e.target.value))} className="input">
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00{h < 12 ? ' (del día anterior)' : ''}</option>)}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={enviarAhora} disabled={!!ocupado || config.emails.length === 0 || !correoConfigurado} className="btn-ghost text-sm" title={config.emails.length === 0 ? 'Guarda primero un correo' : 'Envía el resumen de hoy para ver cómo llega'}>
          {ocupado === 'enviar' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Enviar ahora (prueba)
        </button>
        <button type="submit" disabled={!!ocupado} className="btn-primary">{ocupado === 'guardar' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar</button>
      </div>
    </form>
  )
}
