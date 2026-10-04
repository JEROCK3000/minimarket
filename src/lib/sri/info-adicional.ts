/**
 * Información adicional de los comprobantes electrónicos.
 *
 * "RUC Proveedor" — Resolución SRI NAC-DGERCGC26-00000027 (Anexo 26, Registro
 * Oficial Nro. 335 del 28-jul-2026): los comprobantes emitidos con software de
 * terceros deben incluir el RUC del PROVEEDOR DEL SISTEMA como
 * <campoAdicional nombre="RUC Proveedor">…</campoAdicional> en <infoAdicional>.
 * Mismo criterio que ecofacturacion (Sri/ProcesadorLocal.php) y SmartianERP.
 *
 * El RUC es el de Solinteec (proveedor del software), igual para todos los
 * negocios: va en la variable de entorno SRI_RUC_PROVEEDOR del servidor, NO en
 * el emisor. Sin valor (o inválido) el campo se omite y la facturación sigue.
 */
export const NOMBRE_RUC_PROVEEDOR = 'RUC Proveedor'

export interface CampoAdicional { nombre: string; valor: string }

export function rucProveedorSoftware(): string | null {
  const ruc = (process.env.SRI_RUC_PROVEEDOR || '').trim()
  return /^\d{13}$/.test(ruc) ? ruc : null
}

/** Campos adicionales a incluir al EMITIR un comprobante (hoy: RUC Proveedor). */
export function camposAdicionalesEmision(): CampoAdicional[] {
  const ruc = rucProveedorSoftware()
  return ruc ? [{ nombre: NOMBRE_RUC_PROVEEDOR, valor: ruc }] : []
}

const desescapar = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

/**
 * Lee los <campoAdicional> del XML AUTORIZADO, para que el RIDE y el ticket
 * muestren exactamente lo que el SRI autorizó (las facturas anteriores al
 * campo no lo muestran, porque su XML no lo lleva).
 */
export function extraerInfoAdicional(xml: string | null | undefined): CampoAdicional[] {
  if (!xml) return []
  // El XML autorizado puede venir dentro de un CDATA o con entidades escapadas.
  const texto = xml.includes('&lt;campoAdicional') ? desescapar(xml) : xml
  const campos: CampoAdicional[] = []
  for (const m of texto.matchAll(/<campoAdicional\s+nombre="([^"]*)"\s*>([\s\S]*?)<\/campoAdicional>/g)) {
    campos.push({ nombre: desescapar(m[1]).trim(), valor: desescapar(m[2]).trim() })
  }
  return campos
}
