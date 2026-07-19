'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Save, Loader2, Info } from 'lucide-react'
import { toast } from 'sonner'
import { cambiarEmailAction } from './actions'

export function CambiarEmailForm({ email }: { email: string }) {
  const router = useRouter()
  const [nuevo, setNuevo] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await cambiarEmailAction({ password, emailNuevo: nuevo })
      if (res.success) {
        toast.success('Correo actualizado correctamente')
        setNuevo('')
        setPassword('')
        router.refresh()
      } else toast.error(res.error || 'No se pudo cambiar el correo')
    } finally { setLoading(false) }
  }

  const lbl = 'text-xs font-semibold text-gray-500 dark:text-gray-400'

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="card space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-white/5 pb-2">
          <h3 className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2"><Mail size={16} className="text-brand-600" /> Cambiar correo de la cuenta</h3>
        </div>

        <div className="space-y-1.5">
          <label className={lbl}>Correo actual</label>
          <input type="email" value={email} disabled className="input opacity-60 cursor-not-allowed" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className={lbl}>Nuevo correo *</label>
            <input type="email" value={nuevo} onChange={(e) => setNuevo(e.target.value)} className="input" autoComplete="email" placeholder="nuevo@correo.com" required />
          </div>
          <div className="space-y-1.5">
            <label className={lbl}>Contraseña actual *</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" autoComplete="current-password" required />
          </div>
        </div>

        <div className="flex gap-2 items-start bg-brand-50/50 dark:bg-brand-500/5 border border-brand-400/20 rounded-xl p-3">
          <Info size={14} className="text-brand-500 mt-0.5 shrink-0" />
          <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">
            Este correo es el que usas para iniciar sesión y donde recibirás los enlaces de recuperación de contraseña. Asegúrate de tener acceso a él.
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Cambiar correo
        </button>
      </div>
    </form>
  )
}
