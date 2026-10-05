/**
 * Compresión de imágenes en el NAVEGADOR antes de subirlas: reduce la imagen a
 * `ladoMax` px y baja la calidad JPEG hasta quedar bajo `bytesMax`, así cualquier
 * foto (p. ej. 12 MB de un celular) entra en el límite del servidor. El servidor
 * igual valida magic bytes y re-codifica (sharp); esto es solo para el transporte.
 * Respeta la orientación EXIF (createImageBitmap) y pone fondo blanco a PNG transparentes.
 */
export async function comprimirImagen(archivo: File, { ladoMax = 1200, bytesMax = 1.5 * 1024 * 1024 } = {}): Promise<File> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(archivo, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('No se pudo leer la imagen. Usa una foto JPG, PNG o WebP.')
  }
  // Ya es liviana y de tamaño razonable: se envía tal cual.
  if (archivo.size <= bytesMax && Math.max(bitmap.width, bitmap.height) <= ladoMax && /^image\/(jpeg|png|webp)$/.test(archivo.type)) {
    bitmap.close()
    return archivo
  }
  let lado = ladoMax
  try {
    for (let intento = 0; intento < 8; intento++) {
      const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height))
      const w = Math.max(1, Math.round(bitmap.width * escala))
      const h = Math.max(1, Math.round(bitmap.height * escala))
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Tu navegador no permite procesar imágenes')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(bitmap, 0, 0, w, h)
      for (const calidad of [0.85, 0.75, 0.65, 0.55]) {
        const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', calidad))
        if (blob && blob.size <= bytesMax) {
          const nombre = archivo.name.replace(/\.[^.]+$/, '') || 'imagen'
          return new File([blob], `${nombre}.jpg`, { type: 'image/jpeg' })
        }
      }
      lado = Math.round(lado * 0.75) // aún pesada: se reduce más
    }
    throw new Error('No se pudo reducir la imagen lo suficiente')
  } finally {
    bitmap.close()
  }
}
