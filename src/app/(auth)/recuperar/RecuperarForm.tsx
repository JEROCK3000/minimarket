'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { solicitarRecuperacionAction } from '@/lib/auth/recuperacion-actions'
import { Send, Loader2, ArrowLeft, MailCheck } from 'lucide-react'

export function RecuperarForm() {
  const [state, formAction, pending] = useActionState(solicitarRecuperacionAction, {})

  if (state.success) {
    return (
      <div className="space-y-4 text-center">
        <div className="w-12 h-12 rounded-2xl bg-green-50 dark:bg-green-500/10 grid place-items-center mx-auto">
          <MailCheck size={24} className="text-green-600" />
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{state.success}</p>
        <Link href="/login" className="btn-primary w-full">
          <ArrowLeft size={16} /> Volver al login
        </Link>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
        Ingresa el correo de tu cuenta y te enviaremos un enlace para crear una nueva contraseña.
      </p>

      <div className="space-y-1.5">
        <label htmlFor="email" className="text-xs font-semibold text-gray-500 dark:text-gray-400">
          Correo electrónico
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" placeholder="tucorreo@empresa.com" className="input" />
      </div>

      {state.error && (
        <p className="text-xs font-medium text-red-500 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">{state.error}</p>
      )}

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        Enviar enlace
      </button>

      <Link href="/login" className="flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 dark:hover:text-white">
        <ArrowLeft size={13} /> Volver al login
      </Link>
    </form>
  )
}
