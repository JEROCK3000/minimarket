import type { Metadata } from 'next'
import { requerirTenant } from '@/lib/auth/tenant'
import { usaControlCaja, leerConfigBalanza } from '@/lib/config/negocio'
import { BalanzaForm } from './BalanzaForm'
import { ResumenForm } from './ResumenForm'
import { leerConfigResumen } from '@/lib/reportes/resumen-diario'
import { prisma } from '@/lib/db/prisma'
import { cajaAbierta } from '@/lib/caja/estado'
import { ConfigTabs } from '../ConfigTabs'
import { OperacionForm } from './OperacionForm'

export const metadata: Metadata = { title: 'Operación' }

export default async function OperacionPage() {
  const sesion = await requerirTenant('ADMIN')
  const [usarCaja, apertura, balanza, resumen, smtp] = await Promise.all([
    usaControlCaja(sesion.tenantId), cajaAbierta(sesion.tenantId), leerConfigBalanza(sesion.tenantId), leerConfigResumen(sesion.tenantId),
    prisma.config.count({ where: { tenantId: sesion.tenantId, clave: { in: ['smtp_host', 'smtp_user', 'smtp_pass'] } } }),
  ])
  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">Configuración</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Ajustes del sistema</p>
      </div>
      <ConfigTabs />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <div className="space-y-6">
          <OperacionForm usarCaja={usarCaja} hayCajaAbierta={!!apertura} />
          <BalanzaForm config={balanza} />
        </div>
        <ResumenForm config={resumen} correoConfigurado={smtp >= 3 || !!process.env.SMTP_HOST} />
      </div>
    </div>
  )
}
