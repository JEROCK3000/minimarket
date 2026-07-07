import type { Metadata } from 'next'
import { requerirTenant } from '@/lib/auth/tenant'
import { ReportesClient } from './ReportesClient'

export const metadata: Metadata = { title: 'Reportes' }

export default async function ReportesPage() {
  await requerirTenant()
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">Reportes</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Exporta la información de tu negocio a Excel</p>
      </div>
      <ReportesClient />
    </div>
  )
}
