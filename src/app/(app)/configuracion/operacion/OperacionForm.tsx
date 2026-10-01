'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Calculator } from 'lucide-react'
import { toast } from 'sonner'
import { guardarControlCajaAction } from './actions'

export function OperacionForm({ usarCaja, hayCajaAbierta }: { usarCaja: boolean; hayCajaAbierta: boolean }) {
  const router = useRouter()
  const [activo, setActivo] = useState(usarCaja)
  const [guardando, setGuardando] = useState(false)

  const cambiar = async (valor: boolean) => {
    setGuardando(true)
    try {
      const r = await guardarControlCajaAction(valor)
      if ('error' in r) { toast.error(r.error); return }
      setActivo(valor)
      toast.success(valor ? 'Control de caja activado' : 'Control de caja desactivado')
      router.refresh()
    } finally { setGuardando(false) }
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2"><Calculator size={17} /> Control de caja</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Apertura con fondo inicial y cierre con arqueo de efectivo. Si está activo, <strong>no se puede vender sin abrir la caja</strong>.
          </p>
        </div>
        <button
          type="button" role="switch" aria-checked={activo} aria-label="Usar control de caja"
          onClick={() => cambiar(!activo)} disabled={guardando}
          className={`relative shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-60 ${activo ? 'bg-brand-600' : 'bg-gray-300 dark:bg-white/15'}`}
        >
          <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${activo ? 'translate-x-5' : ''}`} />
          {guardando && <Loader2 size={12} className="animate-spin absolute -right-5 top-2 text-gray-400" />}
        </button>
      </div>
      <ul className="text-xs text-gray-500 dark:text-gray-400 space-y-1 list-disc pl-5">
        <li><strong>Activo:</strong> el POS pide abrir la caja; "Cierre de Caja" aparece en el menú.</li>
        <li><strong>Inactivo:</strong> se vende sin abrir caja y el módulo de caja se oculta. Las ventas, cobros y reportes funcionan igual.</li>
        {activo && hayCajaAbierta && <li className="text-amber-600 dark:text-amber-400">Hay una caja abierta: ciérrala antes de desactivar el control.</li>}
      </ul>
    </div>
  )
}
