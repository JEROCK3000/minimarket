'use client'

import { KeyRound, Copy } from 'lucide-react'
import { toast } from 'sonner'

/** Muestra UNA vez una contraseña temporal recién generada para entregarla al usuario. */
export function PasswordTemporalModal({ email, password, onClose, nota }: { email: string; password: string; onClose: () => void; nota?: string }) {
  const copiar = async () => {
    try { await navigator.clipboard.writeText(password); toast.success('Contraseña copiada') }
    catch { toast.error('No se pudo copiar; anótala a mano') }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50">
      <div className="w-full max-w-sm bg-white dark:bg-[#0f0f1e] rounded-2xl shadow-xl p-6 space-y-4 text-center" role="dialog" aria-modal="true" aria-labelledby="pt-titulo">
        <KeyRound size={36} className="mx-auto text-brand-600" />
        <h2 id="pt-titulo" className="font-bold text-gray-900 dark:text-white">Contraseña temporal</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">Para <strong>{email}</strong>. <strong>Solo se muestra esta vez</strong>; debe cambiarla en Configuración → Seguridad.{nota ? ` ${nota}` : ''}</p>
        <div className="flex items-center gap-2 rounded-xl bg-gray-100 dark:bg-white/5 px-3 py-2.5">
          <code className="flex-1 font-mono text-base text-gray-900 dark:text-white select-all">{password}</code>
          <button onClick={copiar} className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 text-gray-500" aria-label="Copiar contraseña"><Copy size={16} /></button>
        </div>
        <button onClick={onClose} className="btn-primary w-full">Listo, ya la anoté</button>
      </div>
    </div>
  )
}
