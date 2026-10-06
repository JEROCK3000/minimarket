import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/db/prisma'
import { registrarLog } from '@/lib/logs/logger'
import { bloqueoPorSuscripcion } from '@/lib/saas/suscripcion'
import { CLAVE_RESUMEN, CLAVE_RESUMEN_ULTIMO, normalizarConfigResumen, diaAResumir, enviarResumenTenant } from '@/lib/reportes/resumen-diario'

/**
 * GET /api/cron/resumen-diario — lo llama cada hora el cron del servidor con
 * `Authorization: Bearer $CRON_SECRET`. Envía el resumen a los negocios cuya
 * hora ya llegó y que aún no lo recibieron hoy. Sin CRON_SECRET no funciona.
 */
function autorizado(req: NextRequest) {
  const secreto = process.env.CRON_SECRET
  if (!secreto || secreto.length < 32) return false
  const recibido = Buffer.from((req.headers.get('authorization') ?? '').replace(/^Bearer /, ''))
  const esperado = Buffer.from(secreto)
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado)
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ahora = new Date()
  const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`
  const configs = await prisma.config.findMany({ where: { clave: CLAVE_RESUMEN, tenantId: { not: null } }, select: { tenantId: true, valor: true } })
  let enviados = 0, errores = 0
  for (const c of configs) {
    const tenantId = c.tenantId!
    let conf
    try { conf = normalizarConfigResumen(JSON.parse(c.valor)) } catch { continue }
    if (!conf.activo || ahora.getHours() < conf.hora) continue
    const ultimo = await prisma.config.findFirst({ where: { tenantId, clave: CLAVE_RESUMEN_ULTIMO }, select: { valor: true } })
    if (ultimo?.valor === hoy) continue
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { activo: true, estado: true } })
    if (!tenant?.activo || tenant.estado === 'CANCELADO' || await bloqueoPorSuscripcion(tenantId)) continue
    // Marcar antes de enviar: si el SMTP falla no se reintenta cada hora (queda en el log).
    await prisma.config.upsert({
      where: { tenantId_clave: { tenantId, clave: CLAVE_RESUMEN_ULTIMO } },
      update: { valor: hoy }, create: { tenantId, clave: CLAVE_RESUMEN_ULTIMO, valor: hoy },
    })
    try {
      await enviarResumenTenant(tenantId, diaAResumir(conf.hora, ahora), conf.emails)
      enviados++
      await registrarLog('INFO', 'CRON', `Resumen diario enviado (${conf.emails.length} destinatario(s))`, undefined, tenantId)
    } catch (error: any) {
      errores++
      await registrarLog('ERROR', 'CRON', `Resumen diario no enviado: ${error.message || error}`, undefined, tenantId)
    }
  }
  return NextResponse.json({ enviados, errores })
}
