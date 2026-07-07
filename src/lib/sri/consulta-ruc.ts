/**
 * Consulta de RUC a través de la API central de Solinteec (apiruc.solinteec.com).
 * Antes esta lógica llamaba al SRI directamente; ahora se centraliza en el
 * microservicio para tener un solo lugar que mantener.
 *
 * Requiere en el entorno:
 *   RUC_API_URL   (ej. https://apiruc.solinteec.com)
 *   RUC_API_KEY   (la API key del servicio)
 */

export interface ConsultaRucResultado {
  nombre: string
  direccion: string
  estado: string
}

export async function consultarRucSRI(ruc: string): Promise<ConsultaRucResultado | null> {
  const clean = ruc.trim()
  if (!/^\d{13}$/.test(clean)) return null

  const base = process.env.RUC_API_URL
  const key = process.env.RUC_API_KEY
  if (!base) throw new Error('RUC_API_URL no está configurada')

  const res = await fetch(`${base}/ruc/${clean}`, {
    headers: key ? { Authorization: `Bearer ${key}` } : {},
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(18000),
  })

  if (res.status === 404) return null // RUC no encontrado
  if (!res.ok) throw new Error(`La API de RUC respondió ${res.status}`)

  const json = await res.json()
  if (!json?.ok || !json.data) return null
  const d = json.data
  return {
    nombre: String(d.razonSocial || '').trim().toUpperCase(),
    direccion: String(d.direccionMatriz || '').trim().toUpperCase(),
    estado: d.estado || '',
  }
}
