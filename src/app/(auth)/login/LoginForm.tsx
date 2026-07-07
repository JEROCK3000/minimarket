'use client'

import { useActionState } from 'react'
import { loginAction } from '@/lib/auth/actions'
import { LogIn, Loader2 } from 'lucide-react'

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, { error: '' })

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-xs font-semibold text-gray-500 dark:text-gray-400">
          Correo electrónico
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" placeholder="tucorreo@empresa.com" className="input" />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-xs font-semibold text-gray-500 dark:text-gray-400">
          Contraseña
        </label>
        <input id="password" name="password" type="password" required autoComplete="current-password" placeholder="••••••••" className="input" />
      </div>

      {state.error && (
        <p className="text-xs font-medium text-red-500 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">{state.error}</p>
      )}

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
        Iniciar sesión
      </button>
    </form>
  )
}
