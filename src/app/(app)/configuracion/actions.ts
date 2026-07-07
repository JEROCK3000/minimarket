'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { cifrarSecreto, SECRETO_MASCARA } from '@/lib/security/crypto'
import { revalidatePath } from 'next/cache'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const TAMANO_MAX_FIRMA = 512 * 1024 // 512 KB

export async function guardarEmisorSRIAction(formData: FormData) {
  const sesion = await requerirTenant('ADMIN')

  const g = (k: string) => (formData.get(k) as string) ?? ''
  const ruc = g('ruc').trim()
  if (!/^\d{13}$/.test(ruc)) throw new Error('El RUC debe tener 13 dígitos')

  const passwordFirma = g('passwordFirma')
  const archivoFirma = formData.get('firma') as File | null
  const actual = await prisma.emisorSRI.findUnique({ where: { tenantId: sesion.tenantId } })

  // Firma .p12
  let rutaFirma = actual?.rutaFirma ?? ''
  if (archivoFirma && archivoFirma.size > 0) {
    if (archivoFirma.size > TAMANO_MAX_FIRMA) throw new Error('El archivo de firma excede 512 KB')
    const buffer = Buffer.from(await archivoFirma.arrayBuffer())
    if (buffer.length < 4 || buffer[0] !== 0x30) throw new Error('El archivo no parece un .p12 válido')
    const dir = join(process.cwd(), 'storage', 'sri', sesion.tenantId)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    rutaFirma = join(dir, 'firma.p12')
    writeFileSync(rutaFirma, buffer)
    await registrarLog('SECURITY', 'CONFIG', `Firma .p12 actualizada por ${sesion.email}`, undefined, sesion.tenantId)
  } else if (!actual) {
    throw new Error('Debe subir el archivo de firma electrónica (.p12)')
  }

  // Contraseña de firma: solo actualizar si escribieron una nueva (centinela conserva la existente)
  let passwordAlmacenar: string
  if (passwordFirma && passwordFirma !== SECRETO_MASCARA) {
    passwordAlmacenar = cifrarSecreto(passwordFirma)
  } else if (actual) {
    passwordAlmacenar = actual.passwordFirma
  } else {
    throw new Error('Debe ingresar la contraseña de la firma')
  }

  const datos = {
    ruc,
    razonSocial: g('razonSocial'),
    nombreComercial: g('nombreComercial') || null,
    dirMatriz: g('dirMatriz'),
    dirEstablecimiento: g('dirEstablecimiento'),
    codigoEstablecimiento: g('codigoEstablecimiento') || '001',
    codigoPuntoEmision: g('codigoPuntoEmision') || '001',
    obligadoContabilidad: g('obligadoContabilidad') === 'true',
    ambiente: parseInt(g('ambiente'), 10) || 1,
    passwordFirma: passwordAlmacenar,
    rutaFirma,
    contribuyenteEspecial: g('contribuyenteEspecial') || null,
    agenteRetencion: g('agenteRetencion') || null,
    secuencialFactura: parseInt(g('secuencialFactura'), 10) || 1,
  }

  // Token de EcuadorAPI (cifrado; el centinela conserva el existente)
  const ecuadorApiToken = g('ecuadorApiToken')

  try {
    if (actual) {
      await prisma.emisorSRI.update({ where: { tenantId: sesion.tenantId }, data: datos })
    } else {
      await prisma.emisorSRI.create({ data: { ...datos, tenantId: sesion.tenantId } })
    }

    if (ecuadorApiToken && ecuadorApiToken !== SECRETO_MASCARA) {
      const cifrado = cifrarSecreto(ecuadorApiToken.trim())
      const existe = await prisma.config.findFirst({ where: { tenantId: sesion.tenantId, clave: 'ecuador_api_token' } })
      if (existe) {
        await prisma.config.update({ where: { id: existe.id }, data: { valor: cifrado } })
      } else {
        await prisma.config.create({ data: { tenantId: sesion.tenantId, clave: 'ecuador_api_token', valor: cifrado } })
      }
    }

    await registrarLog('AUDIT', 'CONFIG', `Emisor SRI guardado por ${sesion.email}`, undefined, sesion.tenantId)
    revalidatePath('/configuracion')
  } catch (error: any) {
    await registrarLog('ERROR', 'CONFIG', `Error guardando emisor SRI: ${error.message || error}`, undefined, sesion.tenantId)
    throw new Error('No se pudo guardar la configuración del emisor')
  }
}
