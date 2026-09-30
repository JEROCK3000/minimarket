/**
 * Consulta de RUC y cédula a través de la API central de Solinteec (apiruc.solinteec.com).
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

export async function consultarRucSRI(ruc: string, keyOverride?: string): Promise<ConsultaRucResultado | null> {
  const clean = ruc.trim()
  if (!/^\d{13}$/.test(clean)) return null

  // URL fija de infraestructura; la key puede venir de Configuración (BD) o del .env
  const base = process.env.RUC_API_URL || 'https://apiruc.solinteec.com'
  const key = keyOverride || process.env.RUC_API_KEY
  if (!key) throw new Error('No se ha configurado la API Key de consulta de RUC')

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

export interface ConsultaCedulaResultado {
  nombre: string
  direccion: string
  telefono: string
  email: string
  /** true si apiruc la resolvió en el SRI (la persona tiene RUC); false si vino de su base local */
  desdeSri: boolean
}

/**
 * Consulta una cédula en apiruc (`GET /cedula/{cedula}`): base local de Solinteec
 * y, si no está, el SRI como RUC de persona natural. Sin costo. Devuelve null si
 * apiruc no la tiene (404); lanza error si falta la key o el servicio falla, para
 * que el llamador recurra a su proveedor de respaldo (EcuadorAPI).
 */
export async function consultarCedulaApiRuc(cedula: string, keyOverride?: string): Promise<ConsultaCedulaResultado | null> {
  const clean = cedula.trim()
  if (!/^\d{10}$/.test(clean)) return null

  const base = process.env.RUC_API_URL || 'https://apiruc.solinteec.com'
  const key = keyOverride || process.env.RUC_API_KEY
  if (!key) throw new Error('No se ha configurado la API Key de consulta de RUC')

  const res = await fetch(`${base}/cedula/${clean}`, {
    headers: { Authorization: `Bearer ${key}` },
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(18000),
  })

  if (res.status === 404) return null
  if (!res.ok) throw new Error(`La API de cédula respondió ${res.status}`)

  const json = await res.json()
  if (!json?.ok || !json.data) return null
  const d = json.data
  return {
    nombre: String(d.nombre || '').trim().toUpperCase(),
    direccion: String(d.direccion || '').trim().toUpperCase(),
    telefono: String(d.telefono || '').trim(),
    email: String(d.email || '').trim(),
    desdeSri: d.fuente === 'sri',
  }
}
