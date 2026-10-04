'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirSuperadmin } from '@/lib/auth/session'
import { registrarLog } from '@/lib/logs/logger'
import { revalidatePath } from 'next/cache'
import { slugUnico } from '@/lib/saas/tenants'
import { guardarConfigGlobal, CLAVE_DATOS_PAGO } from '@/lib/config/global'

/**
 * Revisión de solicitudes de registro público (SUPERADMIN). Flujo:
 * PENDIENTE → (verificar pago) PAGO_VERIFICADO → (aprobar) APROBADO, o RECHAZADO.
 * Aprobar sin pago verificado solo es posible si el plan tiene días de prueba.
 */
const revalidar = (id: string) => {
  revalidatePath('/superadmin'); revalidatePath('/superadmin/solicitudes'); revalidatePath(`/superadmin/solicitudes/${id}`)
}

export async function verificarPagoSolicitudAction(id: string) {
  const sesion = await requerirSuperadmin()
  const s = await prisma.solicitudRegistro.findUnique({ where: { id }, select: { estado: true, nombreNegocio: true } })
  if (!s) return { error: 'Solicitud no encontrada' }
  if (s.estado !== 'PENDIENTE') return { error: 'La solicitud ya fue procesada' }
  await prisma.solicitudRegistro.update({ where: { id }, data: { estado: 'PAGO_VERIFICADO', revisadoPor: sesion.email, revisadoAt: new Date() } })
  await registrarLog('AUDIT', 'SUPERADMIN', `Pago verificado solicitud ${s.nombreNegocio} por ${sesion.email}`)
  revalidar(id)
  return { success: true }
}

/** Crea el minimarket y su ADMIN con la contraseña que eligió el solicitante (hash ya guardado). */
export async function aprobarSolicitudAction(id: string) {
  const sesion = await requerirSuperadmin()
  try {
    const s = await prisma.solicitudRegistro.findUnique({ where: { id }, include: { plan: true } })
    if (!s) return { error: 'Solicitud no encontrada' }
    if (s.estado !== 'PENDIENTE' && s.estado !== 'PAGO_VERIFICADO') return { error: 'La solicitud ya fue procesada' }
    const pagado = s.estado === 'PAGO_VERIFICADO'
    if (!pagado && s.plan.diasPrueba <= 0) return { error: 'Este plan no tiene días de prueba: verifica el pago antes de aprobar' }
    if (await prisma.usuario.findFirst({ where: { email: s.adminEmail }, select: { id: true } })) {
      return { error: 'El correo del administrador ya está registrado en el sistema' }
    }
    if (await prisma.tenant.findFirst({ where: { ruc: s.ruc }, select: { id: true } })) {
      return { error: 'Ya existe un minimarket con este RUC' }
    }
    const ahora = new Date()
    const hasta = new Date(ahora)
    if (pagado) hasta.setMonth(hasta.getMonth() + (s.cicloFacturacion === 'ANUAL' ? 12 : 1))
    else hasta.setDate(hasta.getDate() + s.plan.diasPrueba)
    const monto = s.cicloFacturacion === 'ANUAL' ? s.plan.precioAnual : s.plan.precioMensual
    const slug = await slugUnico(s.nombreNegocio)

    const tenant = await prisma.$transaction(async (tx) => {
      const t = await tx.tenant.create({
        data: {
          nombre: s.nombreNegocio, slug, ruc: s.ruc, emailContacto: s.emailContacto, telefono: s.telefono,
          planId: s.planId, cicloFacturacion: s.cicloFacturacion, estado: pagado ? 'ACTIVO' : 'PRUEBA', fechaExpiracion: hasta,
          notasAdmin: s.direccion ? `Dirección declarada en el registro: ${s.direccion}` : null,
        },
      })
      await tx.usuario.create({ data: { tenantId: t.id, nombre: s.adminNombre, email: s.adminEmail, rol: 'ADMIN', password: s.adminPasswordHash } })
      if (pagado) {
        await tx.pagoSuscripcion.create({
          data: { tenantId: t.id, superadminId: sesion.sub, tipo: 'TRANSFERENCIA', monto, referencia: 'Registro en línea', periodoDesde: ahora, periodoHasta: hasta, notas: s.comprobantePath ? 'Comprobante adjunto en la solicitud' : null },
        })
      }
      await tx.solicitudRegistro.update({ where: { id }, data: { estado: 'APROBADO', tenantId: t.id, revisadoPor: sesion.email, revisadoAt: ahora } })
      return t
    })
    await registrarLog('AUDIT', 'SUPERADMIN', `Solicitud aprobada: ${s.nombreNegocio} (${pagado ? 'ACTIVO' : 'PRUEBA'}) admin ${s.adminEmail} por ${sesion.email}`, undefined, tenant.id)
    revalidar(id)
    return { success: true, tenantId: tenant.id }
  } catch (error: any) {
    await registrarLog('ERROR', 'SUPERADMIN', `Error aprobando solicitud ${id}: ${error.message || error}`)
    return { error: 'No se pudo aprobar la solicitud' }
  }
}

export async function rechazarSolicitudAction(id: string, motivo: string) {
  const sesion = await requerirSuperadmin()
  const m = String(motivo ?? '').trim()
  if (m.length < 5 || m.length > 300) return { error: 'Indica un motivo (5 a 300 caracteres)' }
  const s = await prisma.solicitudRegistro.findUnique({ where: { id }, select: { estado: true, nombreNegocio: true } })
  if (!s) return { error: 'Solicitud no encontrada' }
  if (s.estado !== 'PENDIENTE' && s.estado !== 'PAGO_VERIFICADO') return { error: 'La solicitud ya fue procesada' }
  await prisma.solicitudRegistro.update({ where: { id }, data: { estado: 'RECHAZADO', motivoRechazo: m, revisadoPor: sesion.email, revisadoAt: new Date() } })
  await registrarLog('AUDIT', 'SUPERADMIN', `Solicitud rechazada: ${s.nombreNegocio} por ${sesion.email}`)
  revalidar(id)
  return { success: true }
}

export async function guardarDatosPagoAction(texto: string) {
  const sesion = await requerirSuperadmin()
  const t = String(texto ?? '').trim()
  if (t.length > 2000) return { error: 'Máximo 2000 caracteres' }
  await guardarConfigGlobal(CLAVE_DATOS_PAGO, t || null)
  await registrarLog('AUDIT', 'SUPERADMIN', `Datos de pago de suscripción actualizados por ${sesion.email}`)
  revalidatePath('/superadmin/configuracion')
  return { success: true }
}
