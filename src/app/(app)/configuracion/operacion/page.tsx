import type { Metadata } from 'next'
import { requerirTenant } from '@/lib/auth/tenant'
import { usaControlCaja } from '@/lib/config/negocio'
import { cajaAbierta } from '@/lib/caja/estado'
import { ConfigTabs } from '../ConfigTabs'
import { OperacionForm } from './OperacionForm'

export const metadata: Metadata = { title: 'Operación' }

export default async function OperacionPage() {
  const sesion = await requerirTenant('ADMIN')
  const [usarCaja, apertura] = await Promise.all([usaControlCaja(sesion.tenantId), cajaAbierta(sesion.tenantId)])
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">Configuración</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Ajustes del sistema</p>
      </div>
      <ConfigTabs />
      <OperacionForm usarCaja={usarCaja} hayCajaAbierta={!!apertura} />
    </div>
  )
}
