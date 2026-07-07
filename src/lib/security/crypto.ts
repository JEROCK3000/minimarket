import crypto from 'crypto'
import { registrarLog } from '@/lib/logs/logger'

/**
 * Cifrado de secretos en reposo (contraseñas de terceros, tokens de API, etc.).
 * Formato almacenado: enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>  (AES-256-GCM)
 *
 * Retrocompatibilidad: descifrarSecreto() devuelve tal cual cualquier valor que
 * NO empiece por el prefijo (por si hubiera datos legados en texto plano), y se
 * re-cifran la próxima vez que se guardan.
 *
 * Requiere ENCRYPTION_KEY en el entorno (64 caracteres hex). Sin ella, cifrar
 * deja el valor en claro y registra una advertencia — nunca falla silenciosamente.
 */

const PREFIJO = 'enc:v1:'
const ALGORITMO = 'aes-256-gcm'

/** Centinela que se envía al navegador en lugar de un secreto real. */
export const SECRETO_MASCARA = '********'

let advertenciaEmitida = false

function obtenerClave(): Buffer | null {
  const claveHex = process.env.ENCRYPTION_KEY
  if (!claveHex || claveHex.length !== 64) {
    if (!advertenciaEmitida) {
      advertenciaEmitida = true
      void registrarLog(
        'WARN',
        'SECURITY',
        'ENCRYPTION_KEY no configurada (64 hex). Los secretos se guardarán sin cifrar. Generar con: openssl rand -hex 32'
      )
    }
    return null
  }
  return Buffer.from(claveHex, 'hex')
}

export function cifrarSecreto(textoPlano: string): string {
  if (!textoPlano) return textoPlano
  const clave = obtenerClave()
  if (!clave) return textoPlano

  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITMO, clave, iv)
  const cifrado = Buffer.concat([cipher.update(textoPlano, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${PREFIJO}${iv.toString('hex')}:${authTag.toString('hex')}:${cifrado.toString('hex')}`
}

export function descifrarSecreto(valorAlmacenado: string): string {
  if (!valorAlmacenado || !valorAlmacenado.startsWith(PREFIJO)) {
    return valorAlmacenado // valor legado en texto plano
  }
  const clave = obtenerClave()
  if (!clave) {
    throw new Error('ENCRYPTION_KEY no configurada: no se puede descifrar el secreto almacenado.')
  }
  const [ivHex, authTagHex, cifradoHex] = valorAlmacenado.slice(PREFIJO.length).split(':')
  const decipher = crypto.createDecipheriv(ALGORITMO, clave, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(cifradoHex, 'hex')), decipher.final()]).toString('utf8')
}
