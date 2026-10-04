import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requerirSuperadmin } from '@/lib/auth/session'
import { leerComprobante, tipoComprobante } from '@/lib/saas/solicitudes'
import { registrarLog } from '@/lib/logs/logger'

/** Comprobante de pago de una solicitud de registro (solo SUPERADMIN). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { await requerirSuperadmin() } catch { return NextResponse.json({ error: 'No autorizado' }, { status: 403 }) }
  const { id } = await params
  const s = await prisma.solicitudRegistro.findUnique({ where: { id }, select: { comprobantePath: true } })
  const datos = s?.comprobantePath ? await leerComprobante(s.comprobantePath) : null
  const tipo = datos ? tipoComprobante(datos) : null
  if (!datos || !tipo) {
    if (s?.comprobantePath) await registrarLog('WARN', 'SUPERADMIN', `Comprobante ilegible de la solicitud ${id}`)
    return NextResponse.json({ error: 'Comprobante no disponible' }, { status: 404 })
  }
  return new NextResponse(new Uint8Array(datos), {
    headers: { 'Content-Type': tipo.mime, 'Content-Disposition': `inline; filename="comprobante-${id}.${tipo.ext}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  })
}
