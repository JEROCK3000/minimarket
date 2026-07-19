import nodemailer from 'nodemailer'
import { prisma } from '@/lib/db/prisma'
import { registrarLog } from '@/lib/logs/logger'
import { descifrarSecreto } from '@/lib/security/crypto'

/** Lee la configuración SMTP (del tenant) y construye un transporter de nodemailer. */
async function obtenerTransporter(tenantId: string | null) {
  const configs = await prisma.config.findMany({
    where: {
      tenantId,
      clave: { in: ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_secure', 'smtp_from_name', 'smtp_from_email'] },
    },
  })
  const get = (k: string) => configs.find((c) => c.clave === k)?.valor || ''

  const host = get('smtp_host') || process.env.SMTP_HOST
  const port = parseInt(get('smtp_port') || process.env.SMTP_PORT || '465', 10)
  const user = get('smtp_user') || process.env.SMTP_USER
  const passAlmacenada = get('smtp_pass') || process.env.SMTP_PASS || ''
  const pass = descifrarSecreto(passAlmacenada)
  const secure = get('smtp_secure') === 'true' || process.env.SMTP_SECURE === 'true'
  const fromName = get('smtp_from_name') || process.env.SMTP_FROM_NAME || 'MiniMarket'
  const fromEmail = get('smtp_from_email') || process.env.SMTP_FROM || user

  if (!host || !user || !pass) {
    throw new Error('La configuración SMTP no está completa. Configúrala en Configuración > Correo.')
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: secure || port === 465,
    auth: { user, pass },
    // Verificación TLS SIEMPRE activa (escape documentado solo para SMTP interno)
    tls: { rejectUnauthorized: process.env.SMTP_ALLOW_INVALID_CERTS !== 'true' },
    connectionTimeout: 15000,
  })
  return { transporter, from: `"${fromName}" <${fromEmail}>` }
}

/** Envía la factura electrónica (RIDE PDF + XML) al cliente. */
export async function enviarFacturaPorEmail(
  tenantId: string,
  destinatario: string,
  numeroFactura: string,
  claveAcceso: string,
  pdfBase64: string,
  xmlContent: string
) {
  const { transporter, from } = await obtenerTransporter(tenantId)

  await transporter.sendMail({
    from,
    to: destinatario,
    subject: `Comprobante Electrónico Autorizado — Factura Nº ${numeroFactura}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 14px; color: #1f2937;">
        <h1 style="color: #2563eb; margin: 0 0 4px; font-size: 20px;">Comprobante Electrónico</h1>
        <p style="color: #6b7280; font-size: 12px; margin: 0 0 20px;">Autorizado por el SRI</p>
        <p style="font-size: 14px; line-height: 1.6;">Estimado(a) cliente, adjuntamos su factura electrónica autorizada.</p>
        <div style="background:#f9fafb;border:1px solid #f3f4f6;border-radius:10px;padding:14px;margin:16px 0;font-size:13px;">
          <div><strong>Factura Nº:</strong> ${numeroFactura}</div>
          <div style="word-break:break-all;"><strong>Clave de acceso:</strong> ${claveAcceso}</div>
        </div>
        <p style="font-size:12px;color:#9ca3af;">Adjuntos: representación impresa (PDF) y archivo XML firmado.</p>
      </div>`,
    attachments: [
      { filename: `Factura-${numeroFactura}.pdf`, content: pdfBase64, encoding: 'base64' },
      { filename: `Factura-${numeroFactura}.xml`, content: xmlContent },
    ],
  })
  await registrarLog('AUDIT', 'EMAIL', `Factura ${numeroFactura} enviada a ${destinatario}`, undefined, tenantId)
}

/** Envía el enlace de restablecimiento de contraseña. El token viaja solo en este correo. */
export async function enviarCorreoRecuperacion(
  tenantId: string | null,
  destinatario: string,
  nombre: string,
  enlace: string,
  minutosValidez: number
) {
  const { transporter, from } = await obtenerTransporter(tenantId)
  await transporter.sendMail({
    from,
    to: destinatario,
    subject: 'Restablecer tu contraseña',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 14px; color: #1f2937;">
        <h1 style="color: #2563eb; margin: 0 0 4px; font-size: 20px;">Restablecer contraseña</h1>
        <p style="font-size: 14px; line-height: 1.6;">Hola ${nombre}, recibimos una solicitud para restablecer tu contraseña.</p>
        <p style="text-align:center;margin:24px 0;">
          <a href="${enlace}" style="background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:bold;display:inline-block;">
            Crear nueva contraseña
          </a>
        </p>
        <p style="font-size:12px;color:#6b7280;line-height:1.6;">
          El enlace es válido por ${minutosValidez} minutos y solo puede usarse una vez.
          Si no solicitaste este cambio, ignora este correo: tu contraseña actual seguirá funcionando.
        </p>
        <p style="font-size:11px;color:#9ca3af;word-break:break-all;">Si el botón no funciona, copia y pega este enlace: ${enlace}</p>
      </div>`,
  })
  await registrarLog('AUDIT', 'AUTH', `Correo de recuperación de contraseña enviado a ${destinatario}`, undefined, tenantId ?? undefined)
}

/** Envía un correo simple de prueba (verificación de la configuración SMTP). */
export async function enviarCorreoPrueba(tenantId: string, destinatario: string) {
  const { transporter, from } = await obtenerTransporter(tenantId)
  await transporter.verify()
  await transporter.sendMail({
    from,
    to: destinatario,
    subject: 'Prueba de conexión de correo ✅',
    html: '<p style="font-family:Arial">Tu configuración SMTP funciona correctamente. Ya puedes enviar facturas por correo.</p>',
  })
}
