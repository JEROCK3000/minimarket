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

  // Logo de la empresa (imagen PNG/JPG, para el RIDE)
  let logoPath = actual?.logoPath ?? null
  const archivoLogo = formData.get('logo') as File | null
  if (archivoLogo && archivoLogo.size > 0) {
    if (archivoLogo.size > 1024 * 1024) throw new Error('El logo no puede superar 1 MB')
    const buf = Buffer.from(await archivoLogo.arrayBuffer())
    // Magic bytes: PNG (89 50 4E 47) o JPEG (FF D8 FF)
    const esPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
    const esJpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
    if (!esPng && !esJpg) throw new Error('El logo debe ser una imagen PNG o JPG')
    const dir = join(process.cwd(), 'storage', 'logos')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    logoPath = join(dir, `${sesion.tenantId}.${esPng ? 'png' : 'jpg'}`)
    writeFileSync(logoPath, buf)
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
    logoPath,
    contribuyenteEspecial: g('contribuyenteEspecial') || null,
    agenteRetencion: g('agenteRetencion') || null,
    secuencialFactura: parseInt(g('secuencialFactura'), 10) || 1,
  }

  // Token de EcuadorAPI y API key de RUC (cifrados; el centinela conserva el existente)
  const ecuadorApiToken = g('ecuadorApiToken')
  const rucApiKey = g('rucApiKey')

  const guardarSecretoConfig = async (clave: string, valor: string) => {
    if (!valor || valor === SECRETO_MASCARA) return
    const cifrado = cifrarSecreto(valor.trim())
    const existe = await prisma.config.findFirst({ where: { tenantId: sesion.tenantId, clave } })
    if (existe) await prisma.config.update({ where: { id: existe.id }, data: { valor: cifrado } })
    else await prisma.config.create({ data: { tenantId: sesion.tenantId, clave, valor: cifrado } })
  }

  try {
    if (actual) {
      await prisma.emisorSRI.update({ where: { tenantId: sesion.tenantId }, data: datos })
    } else {
      await prisma.emisorSRI.create({ data: { ...datos, tenantId: sesion.tenantId } })
    }

    await guardarSecretoConfig('ecuador_api_token', ecuadorApiToken)
    await guardarSecretoConfig('ruc_api_key', rucApiKey)

    await registrarLog('AUDIT', 'CONFIG', `Emisor SRI guardado por ${sesion.email}`, undefined, sesion.tenantId)
    revalidatePath('/configuracion')
  } catch (error: any) {
    await registrarLog('ERROR', 'CONFIG', `Error guardando emisor SRI: ${error.message || error}`, undefined, sesion.tenantId)
    throw new Error('No se pudo guardar la configuración del emisor')
  }
}
