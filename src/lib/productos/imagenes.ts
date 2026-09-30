import { mkdir, writeFile, unlink, readFile } from 'fs/promises'
import { join, basename } from 'path'
import sharp from 'sharp'

/**
 * Imágenes de productos (solo servidor).
 *
 * Seguridad (AGENTS.md §14.3): se valida tamaño y CONTENIDO (magic bytes de
 * JPEG/PNG/WebP, no la extensión), y la imagen se RE-CODIFICA con sharp a WebP
 * 400×400: se descartan metadatos (EXIF/GPS) y cualquier contenido embebido.
 * Se guarda fuera del repositorio (storage/productos/<tenantId>/, en .gitignore)
 * y solo se sirve por /api/productos/[id]/imagen a usuarios del mismo tenant.
 */
export const TAMANO_MAXIMO_IMAGEN = 3 * 1024 * 1024 // 3 MB
const LADO = 400

const carpetaTenant = (tenantId: string) => join(process.cwd(), 'storage', 'productos', basename(tenantId))

export function tipoImagen(b: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b.length >= 8 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a) return 'png'
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  return null
}

/** Valida, re-codifica y guarda. Devuelve el nombre de archivo nuevo. */
export async function guardarImagenProducto(tenantId: string, productoId: string, original: Buffer, anterior: string | null) {
  if (original.length === 0 || original.length > TAMANO_MAXIMO_IMAGEN) throw new ErrorImagen('La imagen debe pesar menos de 3 MB')
  if (!tipoImagen(original)) throw new ErrorImagen('Formato no válido: usa JPG, PNG o WebP')
  let webp: Buffer
  try {
    webp = await sharp(original, { limitInputPixels: 40_000_000, failOn: 'error' })
      .rotate() // respeta la orientación de fotos de celular
      .resize(LADO, LADO, { fit: 'cover', position: 'attention' })
      .webp({ quality: 80 })
      .toBuffer()
  } catch {
    throw new ErrorImagen('No se pudo procesar la imagen (¿archivo dañado?)')
  }
  const carpeta = carpetaTenant(tenantId)
  await mkdir(carpeta, { recursive: true })
  // Nombre con marca de tiempo: cambia la URL y el navegador no muestra la versión vieja.
  const nombre = `${basename(productoId)}-${Date.now()}.webp`
  await writeFile(join(carpeta, nombre), webp)
  if (anterior) await eliminarArchivo(tenantId, anterior)
  return nombre
}

export async function eliminarArchivo(tenantId: string, nombre: string) {
  try { await unlink(join(carpetaTenant(tenantId), basename(nombre))) } catch { /* ya no existía */ }
}

export async function leerImagenProducto(tenantId: string, nombre: string): Promise<Buffer | null> {
  try { return await readFile(join(carpetaTenant(tenantId), basename(nombre))) } catch { return null }
}

/** Error con mensaje apto para el usuario. */
export class ErrorImagen extends Error {}
