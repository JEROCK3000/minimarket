import type { Metadata } from 'next'
import { requerirTenant } from '@/lib/auth/tenant'
import { prisma } from '@/lib/db/prisma'
import { SECRETO_MASCARA } from '@/lib/security/crypto'
import { ConfigTabs } from './ConfigTabs'
import { EmisorSRIForm } from './EmisorSRIForm'

export const metadata: Metadata = { title: 'Configuración' }

export default async function ConfiguracionPage() {
  const sesion = await requerirTenant('ADMIN')
  const emisor = await prisma.emisorSRI.findUnique({ where: { tenantId: sesion.tenantId } })
  const tokenConf = await prisma.config.findFirst({ where: { tenantId: sesion.tenantId, clave: 'ecuador_api_token' } })
  const tieneToken = !!tokenConf?.valor

  const config = emisor
    ? {
        ruc: emisor.ruc,
        razonSocial: emisor.razonSocial,
        nombreComercial: emisor.nombreComercial ?? '',
        dirMatriz: emisor.dirMatriz,
        dirEstablecimiento: emisor.dirEstablecimiento,
        codigoEstablecimiento: emisor.codigoEstablecimiento,
        codigoPuntoEmision: emisor.codigoPuntoEmision,
        obligadoContabilidad: emisor.obligadoContabilidad,
        ambiente: emisor.ambiente,
        passwordFirma: SECRETO_MASCARA, // nunca enviar el secreto real
        tieneFirma: !!emisor.rutaFirma,
        tieneLogo: !!emisor.logoPath,
        contribuyenteEspecial: emisor.contribuyenteEspecial ?? '',
        agenteRetencion: emisor.agenteRetencion ?? '',
        secuencialFactura: emisor.secuencialFactura,
      }
    : null

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">Configuración</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Datos del emisor para facturación electrónica (SRI)</p>
      </div>
      <ConfigTabs />
      <EmisorSRIForm config={config} ecuadorApiToken={tieneToken ? SECRETO_MASCARA : ''} />
    </div>
  )
}
