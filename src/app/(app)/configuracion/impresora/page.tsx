import type { Metadata } from 'next'
import { requerirTenant } from '@/lib/auth/tenant'
import { leerIpImpresora } from '@/lib/print/impresora-config'
import { ConfigTabs } from '../ConfigTabs'
import { ImpresoraForm } from './ImpresoraForm'

export const metadata: Metadata = { title: 'Impresora térmica' }

export default async function ImpresoraConfigPage() {
  const sesion = await requerirTenant('ADMIN')
  const ip = await leerIpImpresora(sesion.tenantId)
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">Configuración</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Ajustes del sistema</p>
      </div>
      <ConfigTabs />
      <ImpresoraForm ipActual={ip ?? ''} />
    </div>
  )
}
