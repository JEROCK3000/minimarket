import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { estaAutenticado } from '@/lib/auth/jwt'
import { LoginForm } from './LoginForm'

export const metadata: Metadata = { title: 'Iniciar sesión' }

export default async function LoginPage() {
  if (await estaAutenticado()) redirect('/dashboard')

  return (
    <main className="min-h-screen grid place-items-center px-4 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-[#0a0a16] dark:to-[#111827]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">
            {process.env.NEXT_PUBLIC_APP_NAME || 'Solinteec'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Inicia sesión para continuar</p>
        </div>
        <div className="card">
          <LoginForm />
        </div>
        <p className="text-center text-xs text-gray-400 mt-6">© {new Date().getFullYear()} Solinteec</p>
      </div>
    </main>
  )
}
