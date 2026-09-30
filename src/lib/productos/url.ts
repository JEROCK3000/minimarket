/** URL de la imagen de un producto (la versión en ?v= cambia al reemplazarla → caché seguro). */
export const urlImagenProducto = (id: string, imagen: string | null | undefined) =>
  imagen ? `/api/productos/${id}/imagen?v=${encodeURIComponent(imagen)}` : null
