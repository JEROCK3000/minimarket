import type { Metadata } from 'next'
import { requerirTenant } from '@/lib/auth/tenant'
import { prisma } from '@/lib/db/prisma'
import { SECRETO_MASCARA } from '@/lib/security/crypto'
import { ConfigTabs } from '../ConfigTabs'
import { CorreoConfigForm } from './CorreoConfigForm'

export const metadata: Metadata = { title: 'Configuración de Correo' }

export default async function CorreoConfigPage() {
  const sesion = await requerirTenant('ADMIN')
  const configs = await prisma.config.findMany({
    where: {
      tenantId: sesion.tenantId,
      clave: { in: ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_secure', 'smtp_from_name', 'smtp_from_email'] },
    },
  })
  const get = (k: string) => configs.find((c) => c.clave === k)?.valor || ''

  const config = configs.length
    ? {
        smtp_host: get('smtp_host'),
        smtp_port: get('smtp_port') || '465',
        smtp_user: get('smtp_user'),
        smtp_pass: get('smtp_pass') ? SECRETO_MASCARA : '',
        smtp_secure: get('smtp_secure') === 'true',
        smtp_from_name: get('smtp_from_name') || 'MiniMarket',
        smtp_from_email: get('smtp_from_email'),
      }
    : null

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">Configuración</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Ajustes del sistema</p>
      </div>
      <ConfigTabs />
      <CorreoConfigForm config={config} />
    </div>
  )
}
