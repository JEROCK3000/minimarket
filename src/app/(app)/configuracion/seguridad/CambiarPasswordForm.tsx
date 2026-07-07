'use client'

import { useState } from 'react'
import { KeyRound, Save, Loader2, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { cambiarPasswordAction } from './actions'

export function CambiarPasswordForm({ email }: { email: string }) {
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [mostrar, setMostrar] = useState(false)
  const [loading, setLoading] = useState(false)

  const fortaleza = (() => {
    if (!nueva) return null
    let p = 0
    if (nueva.length >= 10) p++
    if (nueva.length >= 14) p++
    if (/[a-z]/.test(nueva) && /[A-Z]/.test(nueva)) p++
    if (/\d/.test(nueva)) p++
    if (/[^A-Za-z0-9]/.test(nueva)) p++
    if (p <= 2) return { t: 'Débil', c: 'text-red-500', b: 'bg-red-500 w-1/3' }
    if (p <= 3) return { t: 'Aceptable', c: 'text-amber-500', b: 'bg-amber-500 w-2/3' }
    return { t: 'Fuerte', c: 'text-green-600', b: 'bg-green-500 w-full' }
  })()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (nueva !== confirmacion) { toast.error('La confirmación no coincide'); return }
    if (nueva.length < 10) { toast.error('Mínimo 10 caracteres'); return }
    setLoading(true)
    try {
      const res = await cambiarPasswordAction({ passwordActual: actual, passwordNueva: nueva, passwordConfirmacion: confirmacion })
      if (res.success) { toast.success('Contraseña cambiada correctamente'); setActual(''); setNueva(''); setConfirmacion('') }
      else toast.error(res.error || 'No se pudo cambiar')
    } finally { setLoading(false) }
  }

  const tipo = mostrar ? 'text' : 'password'
  const lbl = 'text-xs font-semibold text-gray-500 dark:text-gray-400'

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="card space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-white/5 pb-2">
          <h3 className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2"><KeyRound size={16} className="text-brand-600" /> Cambiar contraseña</h3>
          <span className="text-[11px] text-gray-400">{email}</span>
        </div>

        <div className="space-y-1.5">
          <label className={lbl}>Contraseña actual *</label>
          <input type={tipo} value={actual} onChange={(e) => setActual(e.target.value)} className="input" autoComplete="current-password" required />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className={lbl}>Nueva contraseña *</label>
            <input type={tipo} value={nueva} onChange={(e) => setNueva(e.target.value)} className="input" autoComplete="new-password" minLength={10} required />
            {fortaleza && (
              <div className="space-y-1">
                <div className="h-1 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden"><div className={`h-full rounded-full transition-all ${fortaleza.b}`} /></div>
                <p className={`text-[10px] font-semibold ${fortaleza.c}`}>Fortaleza: {fortaleza.t}</p>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <label className={lbl}>Confirmar nueva *</label>
            <input type={tipo} value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} className="input" autoComplete="new-password" minLength={10} required />
            {confirmacion && confirmacion !== nueva && <p className="text-[10px] font-semibold text-red-500">No coincide</p>}
          </div>
        </div>

        <button type="button" onClick={() => setMostrar((m) => !m)} className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-900 dark:hover:text-white">
          {mostrar ? <EyeOff size={13} /> : <Eye size={13} />} {mostrar ? 'Ocultar' : 'Mostrar'} contraseñas
        </button>

        <div className="flex gap-2 items-start bg-green-50/50 dark:bg-green-500/5 border border-green-400/20 rounded-xl p-3">
          <ShieldCheck size={14} className="text-green-500 mt-0.5 shrink-0" />
          <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">Usa al menos 10 caracteres con mayúsculas, minúsculas, números y símbolos.</p>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Cambiar contraseña
        </button>
      </div>
    </form>
  )
}
