import { createHash, randomBytes } from 'crypto'
import { mkdir, writeFile, readFile } from 'fs/promises'
import { join, basename } from 'path'

/**
 * Utilidades del registro público de minimarkets (solo servidor).
 *   - Token del solicitante: 32 bytes aleatorios; en BD solo su hash SHA-256.
 *   - Comprobante de pago: imagen (JPG/PNG/WebP) o PDF, máx. 5 MB, validado por
 *     magic bytes; guardado en storage/solicitudes/ (fuera del repo, en el respaldo).
 *   - Límite de envíos por IP (memoria del proceso; una instancia PM2).
 */
export const generarToken = () => randomBytes(32).toString('base64url')
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex')

export const TAMANO_MAX_COMPROBANTE = 5 * 1024 * 1024
const CARPETA = () => join(process.cwd(), 'storage', 'solicitudes')

export function tipoComprobante(b: Buffer): { ext: string; mime: string } | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' }
  if (b.length >= 8 && b.readUInt32BE(0) === 0x89504e47) return { ext: 'png', mime: 'image/png' }
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', mime: 'image/webp' }
  if (b.length >= 5 && b.toString('ascii', 0, 5) === '%PDF-') return { ext: 'pdf', mime: 'application/pdf' }
  return null
}

export async function guardarComprobante(solicitudId: string, datos: Buffer, ext: string) {
  await mkdir(CARPETA(), { recursive: true })
  const nombre = `${basename(solicitudId)}-${Date.now()}.${ext}`
  await writeFile(join(CARPETA(), nombre), datos)
  return nombre
}

export async function leerComprobante(nombre: string) {
  try { return await readFile(join(CARPETA(), basename(nombre))) } catch { return null }
}

// ─── Límite de envíos por IP ──────────────────────────────────────────────────
const envios = new Map<string, number[]>()
/** true si la IP superó `max` envíos en la última hora. */
export function excedeLimite(ip: string, max = 5): boolean {
  const ahora = Date.now()
  const recientes = (envios.get(ip) ?? []).filter((t) => ahora - t < 3600_000)
  if (recientes.length >= max) { envios.set(ip, recientes); return true }
  recientes.push(ahora)
  envios.set(ip, recientes)
  return false
}
