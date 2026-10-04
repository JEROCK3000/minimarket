'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save, FileBadge } from 'lucide-react'
import { toast } from 'sonner'
import { guardarRucProveedorAction } from './actions'

export function RucProveedorForm({ rucActual }: { rucActual: string }) {
  const router = useRouter()
  const [ruc, setRuc] = useState(rucActual)
  const [guardando, setGuardando] = useState(false)
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    try {
      const r = await guardarRucProveedorAction(ruc)
      if ('error' in r) { toast.error(r.error); return }
      toast.success(ruc.trim() ? 'RUC Proveedor guardado' : 'RUC Proveedor eliminado')
      router.refresh()
    } finally { setGuardando(false) }
  }
  return (
    <form onSubmit={guardar} className="card space-y-4">
      <div>
        <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2"><FileBadge size={17} /> RUC Proveedor del sistema</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Resolución SRI <strong>NAC-DGERCGC26-00000027</strong>: las facturas y notas de crédito de todos los minimarkets incluyen
          en su información adicional el RUC del <strong>proveedor del software</strong> (Solinteec). Se muestra también en el RIDE y en el ticket térmico.
        </p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="ruc-prov" className="text-xs font-semibold text-gray-500 dark:text-gray-400">RUC (13 dígitos)</label>
        <input id="ruc-prov" value={ruc} onChange={(e) => setRuc(e.target.value)} className="input font-mono max-w-xs" inputMode="numeric" maxLength={13} placeholder="1500930316001" />
        <p className="text-[11px] text-gray-400">Déjalo vacío para no incluir el campo. El cambio aplica a los comprobantes que se emitan desde ahora.</p>
      </div>
      <div className="flex justify-end">
        <button type="submit" disabled={guardando} className="btn-primary">
          {guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar
        </button>
      </div>
    </form>
  )
}
