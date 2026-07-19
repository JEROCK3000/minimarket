'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { restablecerPasswordAction } from '@/lib/auth/recuperacion-actions'
import { KeyRound, Loader2, Eye, EyeOff, CheckCircle2, LogIn } from 'lucide-react'

export function RestablecerForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(restablecerPasswordAction, {})
  const [mostrar, setMostrar] = useState(false)

  if (state.success) {
    return (
      <div className="space-y-4 text-center">
        <div className="w-12 h-12 rounded-2xl bg-green-50 dark:bg-green-500/10 grid place-items-center mx-auto">
          <CheckCircle2 size={24} className="text-green-600" />
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
          Tu contraseña fue cambiada correctamente. Ya puedes iniciar sesión con la nueva contraseña.
        </p>
        <Link href="/login" className="btn-primary w-full">
          <LogIn size={16} /> Iniciar sesión
        </Link>
      </div>
    )
  }

  const tipo = mostrar ? 'text' : 'password'

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-xs font-semibold text-gray-500 dark:text-gray-400">
          Nueva contraseña
        </label>
        <input id="password" name="password" type={tipo} required minLength={10} autoComplete="new-password" placeholder="Mínimo 10 caracteres" className="input" />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="confirmacion" className="text-xs font-semibold text-gray-500 dark:text-gray-400">
          Confirmar contraseña
        </label>
        <input id="confirmacion" name="confirmacion" type={tipo} required minLength={10} autoComplete="new-password" placeholder="Repite la contraseña" className="input" />
      </div>

      <button type="button" onClick={() => setMostrar((m) => !m)} className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-900 dark:hover:text-white">
        {mostrar ? <EyeOff size={13} /> : <Eye size={13} />} {mostrar ? 'Ocultar' : 'Mostrar'} contraseñas
      </button>

      {state.error && (
        <p className="text-xs font-medium text-red-500 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">{state.error}</p>
      )}

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
        Guardar nueva contraseña
      </button>
    </form>
  )
}
