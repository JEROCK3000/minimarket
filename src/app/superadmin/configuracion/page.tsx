import type { Metadata } from 'next'
import { requerirSuperadmin } from '@/lib/auth/session'
import { leerConfigGlobal, CLAVE_RUC_PROVEEDOR } from '@/lib/config/global'
import { RucProveedorForm } from './RucProveedorForm'

export const metadata: Metadata = { title: 'Configuración global' }

export default async function ConfiguracionGlobalPage() {
  await requerirSuperadmin()
  const ruc = await leerConfigGlobal(CLAVE_RUC_PROVEEDOR)
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">Configuración global</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Ajustes que aplican a todos los minimarkets.</p>
      </div>
      <RucProveedorForm rucActual={ruc ?? ''} />
    </div>
  )
}
