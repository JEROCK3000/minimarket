import type { Metadata } from 'next'
import { requerirSesion } from '@/lib/auth/session'
import { ConfigTabs } from '../ConfigTabs'
import { CambiarPasswordForm } from './CambiarPasswordForm'
import { CambiarEmailForm } from './CambiarEmailForm'

export const metadata: Metadata = { title: 'Seguridad' }

export default async function SeguridadPage() {
  const sesion = await requerirSesion()
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">Configuración</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Ajustes del sistema</p>
      </div>
      <ConfigTabs />
      <CambiarEmailForm email={sesion.email} />
      <CambiarPasswordForm email={sesion.email} />
    </div>
  )
}
