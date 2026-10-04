'use server'

import bcrypt from 'bcryptjs'
import { headers } from 'next/headers'
import { prisma } from '@/lib/db/prisma'
import { registrarLog } from '@/lib/logs/logger'
import { z } from 'zod'
import {
  generarToken, hashToken, excedeLimite, tipoComprobante, guardarComprobante, TAMANO_MAX_COMPROBANTE,
} from '@/lib/saas/solicitudes'

/**
 * Registro PÚBLICO de minimarkets (sin sesión, como el login): mismo flujo que
 * SmartianERP (RegistroController). Protecciones: zod, límite de envíos por IP,
 * contraseña solo como hash bcrypt, correo/RUC no repetidos, token del
 * solicitante guardado como hash y comprobante validado por contenido.
 */
async function ipCliente() {
  const h = await headers()
  return (h.get('x-forwarded-for')?.split(',')[0] || h.get('x-real-ip') || 'desconocida').trim().slice(0, 64)
}

const registroSchema = z.object({
  nombreNegocio: z.string().trim().min(2, 'Nombre del negocio requerido').max(150),
  ruc: z.string().trim().regex(/^\d{13}$/, 'El RUC debe tener 13 dígitos').refine((r) => r.endsWith('001') || r.endsWith('0001'), 'RUC no válido'),
  direccion: z.string().trim().max(300).optional().or(z.literal('')),
  telefono: z.string().trim().max(20).optional().or(z.literal('')),
  emailContacto: z.string().trim().toLowerCase().email('Correo de contacto inválido').max(150),
  planId: z.string().min(1, 'Elige un plan'),
  cicloFacturacion: z.enum(['MENSUAL', 'ANUAL']),
  adminNombre: z.string().trim().min(2, 'Tu nombre es requerido').max(120),
  adminEmail: z.string().trim().toLowerCase().email('Correo para iniciar sesión inválido').max(180),
  password: z.string().min(10, 'La contraseña debe tener al menos 10 caracteres').max(200),
  aceptaTerminos: z.literal(true, { errorMap: () => ({ message: 'Debes aceptar los términos' }) }),
})
export type RegistroValues = z.input<typeof registroSchema>

export async function registrarSolicitudAction(data: RegistroValues): Promise<{ success: true; token: string } | { error: string }> {
  const ip = await ipCliente()
  if (excedeLimite(ip)) {
    await registrarLog('SECURITY', 'REGISTRO', `Demasiados registros desde ${ip}`)
    return { error: 'Demasiados intentos. Intenta nuevamente en una hora.' }
  }
  const parsed = registroSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  const d = parsed.data
  try {
    const plan = await prisma.planSuscripcion.findFirst({ where: { id: d.planId, activo: true }, select: { id: true } })
    if (!plan) return { error: 'El plan elegido no está disponible' }
    const [usuario, tenantRuc, pendiente] = await Promise.all([
      prisma.usuario.findFirst({ where: { email: d.adminEmail }, select: { id: true } }),
      prisma.tenant.findFirst({ where: { ruc: d.ruc }, select: { id: true } }),
      prisma.solicitudRegistro.findFirst({ where: { estado: { in: ['PENDIENTE', 'PAGO_VERIFICADO'] }, OR: [{ ruc: d.ruc }, { adminEmail: d.adminEmail }] }, select: { id: true } }),
    ])
    // Mensajes que no revelan qué cuenta existe exactamente.
    if (usuario || tenantRuc) return { error: 'Ya existe una cuenta con ese RUC o correo. Si es tuya, inicia sesión o contacta a Solinteec.' }
    if (pendiente) return { error: 'Ya hay una solicitud en revisión con ese RUC o correo.' }

    const token = generarToken()
    const h = await headers()
    await prisma.solicitudRegistro.create({
      data: {
        tokenHash: hashToken(token), nombreNegocio: d.nombreNegocio, ruc: d.ruc, direccion: d.direccion || null, telefono: d.telefono || null,
        emailContacto: d.emailContacto, planId: d.planId, cicloFacturacion: d.cicloFacturacion, adminNombre: d.adminNombre,
        adminEmail: d.adminEmail, adminPasswordHash: await bcrypt.hash(d.password, 12), ip, userAgent: (h.get('user-agent') || '').slice(0, 255),
      },
    })
    await registrarLog('AUDIT', 'REGISTRO', `Nueva solicitud de registro: ${d.nombreNegocio} (${d.ruc}) desde ${ip}`)
    return { success: true, token }
  } catch (error: any) {
    await registrarLog('ERROR', 'REGISTRO', `Error registrando solicitud: ${error.message || error}`)
    return { error: 'No se pudo enviar la solicitud. Intenta nuevamente.' }
  }
}

/** El solicitante sube su comprobante de pago (con el token de su enlace privado). */
export async function subirComprobanteAction(token: string, formData: FormData): Promise<{ success: true } | { error: string }> {
  const ip = await ipCliente()
  if (excedeLimite(`comprobante:${ip}`, 10)) return { error: 'Demasiados intentos. Intenta más tarde.' }
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return { error: 'Enlace no válido' }
  const solicitud = await prisma.solicitudRegistro.findUnique({ where: { tokenHash: hashToken(token) }, select: { id: true, estado: true, nombreNegocio: true } })
  if (!solicitud) return { error: 'Enlace no válido' }
  if (solicitud.estado !== 'PENDIENTE') return { error: 'Esta solicitud ya no admite comprobantes' }
  const archivo = formData.get('comprobante')
  if (!(archivo instanceof File)) return { error: 'Selecciona el archivo del comprobante' }
  if (archivo.size === 0 || archivo.size > TAMANO_MAX_COMPROBANTE) return { error: 'El comprobante debe pesar menos de 5 MB' }
  const datos = Buffer.from(await archivo.arrayBuffer())
  const tipo = tipoComprobante(datos)
  if (!tipo) return { error: 'Formato no válido: sube una imagen (JPG, PNG) o un PDF' }
  try {
    const nombre = await guardarComprobante(solicitud.id, datos, tipo.ext)
    await prisma.solicitudRegistro.update({ where: { id: solicitud.id }, data: { comprobantePath: nombre, comprobanteAt: new Date() } })
    await registrarLog('AUDIT', 'REGISTRO', `Comprobante subido para la solicitud de ${solicitud.nombreNegocio}`)
    return { success: true }
  } catch (error: any) {
    await registrarLog('ERROR', 'REGISTRO', `Error guardando comprobante: ${error.message || error}`)
    return { error: 'No se pudo guardar el comprobante' }
  }
}
