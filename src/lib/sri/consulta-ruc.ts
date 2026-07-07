/**
 * Consulta propia de RUC contra los servicios públicos del SRI (gratis, oficial).
 * Reemplaza a EcuadorAPI para RUCs. Para cédulas se sigue usando EcuadorAPI.
 *
 * IMPORTANTE: el SRI ignora las peticiones sin User-Agent de navegador (responde
 * en blanco / se cuelga). Por eso se envía uno explícito.
 */

const SRI_BASE = 'https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

export interface ConsultaRucResultado {
  nombre: string
  direccion: string
  estado: string // ACTIVO / SUSPENDIDO / etc.
}

async function pedirSRI(url: string): Promise<any | null> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    // El SRI a veces es lento; damos margen. Sin caché (datos en vivo).
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(15000),
  })
  if (res.status === 204) return null // RUC no encontrado
  if (!res.ok) throw new Error(`SRI respondió ${res.status}`)
  const txt = await res.text()
  if (!txt.trim()) return null
  return JSON.parse(txt)
}

/**
 * Consulta un RUC en el SRI. Devuelve nombre (razón social), dirección de la
 * matriz y estado, o null si no existe. Lanza Error si el SRI falla.
 */
export async function consultarRucSRI(ruc: string): Promise<ConsultaRucResultado | null> {
  const clean = ruc.trim()
  if (!/^\d{13}$/.test(clean)) return null

  // 1) Datos del contribuyente (razón social, estado)
  const cont = await pedirSRI(`${SRI_BASE}/ConsolidadoContribuyente/obtenerPorNumerosRuc?ruc=${clean}`)
  const info = Array.isArray(cont) ? cont[0] : cont
  if (!info || !info.razonSocial) return null

  // 2) Dirección de la matriz (establecimiento matriz)
  let direccion = ''
  try {
    const estabs = await pedirSRI(`${SRI_BASE}/Establecimiento/consultarPorNumeroRuc?numeroRuc=${clean}`)
    if (Array.isArray(estabs)) {
      const matriz = estabs.find((e: any) => e.matriz === 'SI') || estabs[0]
      direccion = matriz?.direccionCompleta || ''
    }
  } catch {
    // La dirección es opcional: si falla, seguimos solo con el nombre
  }

  return {
    nombre: String(info.razonSocial).trim().toUpperCase(),
    direccion: direccion.trim().toUpperCase(),
    estado: info.estadoContribuyenteRuc || '',
  }
}
