import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'
import { zipSync, strToU8, type Zippable } from 'fflate'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'

/**
 * GET /api/print-agent — descarga el agente local de impresión térmica
 * (carpeta print-agent/ del repo) en un .zip, para instalarlo en la
 * computadora de la caja. Solo ADMIN. Lista blanca de archivos: nunca se
 * incluyen certificados (*.pem), que cada instalación genera por su cuenta.
 */
const ARCHIVOS = [
  'README.md',
  'print-agent.py',
  'instalar-windows.ps1',
  'instalar-mac.sh',
  'instalar-linux.sh',
  'openssl-req.cnf',
  'com.solinteec.print-agent-minimarket.plist.template',
  'print-agent-minimarket.service.template',
]

export async function GET() {
  let sesion
  try {
    sesion = await requerirTenant('ADMIN')
  } catch {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const carpeta = join(process.cwd(), 'print-agent')
    const contenido: Zippable = {}
    for (const nombre of ARCHIVOS) {
      const datos = new Uint8Array(readFileSync(join(carpeta, nombre)))
      // Los instaladores de Mac/Linux deben quedar ejecutables al descomprimir
      // (atributos Unix: os 3 + modo 100755 en los 16 bits altos).
      contenido[`print-agent-minimarket/${nombre}`] = nombre.endsWith('.sh')
        ? [datos, { os: 3, attrs: (0o100755 << 16) >>> 0 }]
        : datos
    }
    contenido['print-agent-minimarket/LEEME.txt'] = strToU8(
      'Agente de impresion termica de MiniMarket (puerto 9448).\r\n' +
      'Instrucciones completas en README.md. Windows: powershell -ExecutionPolicy Bypass -File instalar-windows.ps1\r\n',
    )
    const zip = zipSync(contenido, { level: 6 })
    await registrarLog('AUDIT', 'IMPRESION', 'Descarga del agente de impresión térmica', undefined, sesion.tenantId)
    return new NextResponse(Buffer.from(zip), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="print-agent-minimarket.zip"',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error: any) {
    await registrarLog('ERROR', 'IMPRESION', `Error empaquetando el agente: ${error.message || error}`, undefined, sesion.tenantId)
    return NextResponse.json({ error: 'No se pudo generar la descarga' }, { status: 500 })
  }
}
