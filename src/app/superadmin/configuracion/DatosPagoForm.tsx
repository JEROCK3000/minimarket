'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save, Landmark } from 'lucide-react'
import { toast } from 'sonner'
import { guardarDatosPagoAction } from '../solicitudes/actions'

export function DatosPagoForm({ actual }: { actual: string }) {
  const router = useRouter()
  const [texto, setTexto] = useState(actual)
  const [guardando, setGuardando] = useState(false)
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    try {
      const r = await guardarDatosPagoAction(texto)
      if ('error' in r) { toast.error(r.error); return }
      toast.success('Datos de pago guardados'); router.refresh()
    } finally { setGuardando(false) }
  }
  return (
    <form onSubmit={guardar} className="card space-y-4">
      <div>
        <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2"><Landmark size={17} /> Datos para el pago de suscripciones</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Los ve quien se registra en <span className="font-mono">/registro</span> para hacer su transferencia y subir el comprobante.</p>
      </div>
      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} className="input min-h-[120px]" maxLength={2000}
        placeholder={'Banco Pichincha · Cuenta corriente 0000000000\nTitular: Solinteec\nRUC: 0000000000001'} />
      <div className="flex justify-end">
        <button type="submit" disabled={guardando} className="btn-primary">{guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar</button>
      </div>
    </form>
  )
}
