/**
 * Envío de tickets a la impresora térmica a través del agente local de
 * MiniMarket (print-agent/, https://127.0.0.1:9448). Se usa desde el navegador:
 * el servidor genera los bytes ESC/POS (pos/print-actions.ts) y aquí se
 * entregan al agente, que los reenvía al puerto 9100 de la impresora.
 */
import { ticketTermicoAction, ticketPruebaAction, etiquetasTermicaAction } from '@/app/(app)/pos/print-actions'

export const PUERTO_AGENTE = 9448
export const URL_AGENTE = `https://127.0.0.1:${PUERTO_AGENTE}`

export class SinImpresoraError extends Error {
  constructor() { super('No hay impresora térmica configurada (Configuración → Impresora).') }
}

async function enviarAlAgente(datosBase64: string, ip: string) {
  let res: Response
  try {
    res = await fetch(`${URL_AGENTE}/imprimir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, puerto: 9100, datos_base64: datosBase64 }),
    })
  } catch {
    throw new Error(
      `No se pudo conectar con el agente de impresión. Verifica que esté instalado y que aceptaste su certificado en ${URL_AGENTE}/estado.`,
    )
  }
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.ok) throw new Error(`La impresora no respondió: ${data?.error || `código ${res.status}`}`)
}

/** Imprime una venta (RIDE si su factura está autorizada, ticket si no). */
export async function imprimirVentaTermica(ventaId: string): Promise<'FACTURA' | 'TICKET'> {
  const r = await ticketTermicoAction(ventaId)
  if ('sinImpresora' in r) throw new SinImpresoraError()
  if ('error' in r) throw new Error(r.error)
  await enviarAlAgente(r.datosBase64, r.ip)
  return r.tipo
}

/** Etiquetas de precio de los productos indicados. */
export async function imprimirEtiquetas(productoIds: string[]) {
  const r = await etiquetasTermicaAction(productoIds)
  if ('sinImpresora' in r) throw new SinImpresoraError()
  if ('error' in r) throw new Error(r.error)
  await enviarAlAgente(r.datosBase64, r.ip)
}

/** Ticket de prueba a la IP indicada. */
export async function imprimirPrueba(ip: string) {
  const r = await ticketPruebaAction(ip)
  if ('error' in r) throw new Error(r.error)
  await enviarAlAgente(r.datosBase64, r.ip)
}

/** ¿El agente responde en esta computadora? */
export async function agenteDisponible(): Promise<boolean> {
  try {
    const res = await fetch(`${URL_AGENTE}/estado`, { signal: AbortSignal.timeout(2500) })
    return res.ok
  } catch {
    return false
  }
}
