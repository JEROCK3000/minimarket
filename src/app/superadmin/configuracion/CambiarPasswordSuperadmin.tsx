'use client'

import { useState } from 'react'
import { Loader2, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { cambiarPasswordSuperadminAction } from '../actions'

export function CambiarPasswordSuperadmin() {
  const [f, setF] = useState({ actual: '', nueva: '', confirmar: '' })
  const [guardando, setGuardando] = useState(false)
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (f.nueva !== f.confirmar) { toast.error('La confirmación no coincide'); return }
    setGuardando(true)
    try {
      const r = await cambiarPasswordSuperadminAction(f.actual, f.nueva)
      if ('error' in r) { toast.error(r.error); return }
      toast.success('Contraseña actualizada'); setF({ actual: '', nueva: '', confirmar: '' })
    } finally { setGuardando(false) }
  }
  return (
    <form onSubmit={guardar} className="card space-y-3">
      <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2"><KeyRound size={17} /> Contraseña del superadmin</h2>
      <input type="password" value={f.actual} onChange={(e) => setF({ ...f, actual: e.target.value })} className="input" placeholder="Contraseña actual" aria-label="Contraseña actual" autoComplete="current-password" required />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input type="password" value={f.nueva} onChange={(e) => setF({ ...f, nueva: e.target.value })} className="input" placeholder="Nueva (mín. 12 caracteres)" aria-label="Nueva contraseña" autoComplete="new-password" minLength={12} required />
        <input type="password" value={f.confirmar} onChange={(e) => setF({ ...f, confirmar: e.target.value })} className="input" placeholder="Confirmar nueva" aria-label="Confirmar nueva contraseña" autoComplete="new-password" required />
      </div>
      <div className="flex justify-end"><button type="submit" disabled={guardando} className="btn-primary">{guardando ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />} Cambiar contraseña</button></div>
    </form>
  )
}
