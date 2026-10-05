'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save, Scale } from 'lucide-react'
import { toast } from 'sonner'
import { guardarBalanzaAction } from './actions'
import type { ConfigBalanza } from '@/lib/pos/balanza'

export function BalanzaForm({ config }: { config: ConfigBalanza }) {
  const router = useRouter()
  const [activo, setActivo] = useState(config.activo)
  const [prefijos, setPrefijos] = useState(config.prefijos.join(', '))
  const [digitos, setDigitos] = useState(config.digitosCodigo)
  const [modo, setModo] = useState(config.modo)
  const [guardando, setGuardando] = useState(false)
  const lista = prefijos.split(/[,\s]+/).filter(Boolean)
  const ejemplo = `${lista[0] ?? '20'}${'1'.padStart(digitos, '0')}${modo === 'PESO' ? '00750' : '01234'}`.slice(0, 12) + 'X'

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    try {
      const r = await guardarBalanzaAction({ activo, prefijos: lista, digitosCodigo: digitos, modo })
      if ('error' in r) { toast.error(r.error); return }
      toast.success('Configuración de balanza guardada'); router.refresh()
    } finally { setGuardando(false) }
  }
  const lbl = 'text-xs font-semibold text-gray-500 dark:text-gray-400'
  return (
    <form onSubmit={guardar} className="card space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2"><Scale size={17} /> Balanza (productos al peso)</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            El POS lee la etiqueta que imprime la balanza y agrega el producto con su peso. Cada producto necesita su <strong>código de balanza (PLU)</strong>, el mismo que está programado en la balanza.
          </p>
        </div>
        <button type="button" role="switch" aria-checked={activo} aria-label="Usar etiquetas de balanza" onClick={() => setActivo(!activo)}
          className={`relative shrink-0 w-12 h-7 rounded-full transition-colors ${activo ? 'bg-brand-600' : 'bg-gray-300 dark:bg-white/15'}`}>
          <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${activo ? 'translate-x-5' : ''}`} />
        </button>
      </div>
      {activo && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="bz-pref" className={lbl}>Prefijo(s) de la etiqueta</label>
              <input id="bz-pref" value={prefijos} onChange={(e) => setPrefijos(e.target.value)} className="input font-mono" placeholder="20, 21" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="bz-dig" className={lbl}>Dígitos del código PLU</label>
              <select id="bz-dig" value={digitos} onChange={(e) => setDigitos(Number(e.target.value))} className="input">
                {[4, 5, 6].map((n) => <option key={n} value={n}>{n} dígitos</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="bz-modo" className={lbl}>La etiqueta trae</label>
              <select id="bz-modo" value={modo} onChange={(e) => setModo(e.target.value as 'PESO' | 'PRECIO')} className="input">
                <option value="PESO">El peso (gramos)</option>
                <option value="PRECIO">El precio total (centavos)</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            Ejemplo de etiqueta: <span className="font-mono text-gray-700 dark:text-gray-300">{ejemplo}</span> → producto con PLU 1, {modo === 'PESO' ? '0.750 kg' : '$12.34'}. Revisa el manual de tu balanza (formato EAN-13 de uso interno).
          </p>
        </>
      )}
      <div className="flex justify-end">
        <button type="submit" disabled={guardando} className="btn-primary">{guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar</button>
      </div>
    </form>
  )
}
