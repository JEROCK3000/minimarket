import { prisma } from '@/lib/db/prisma'

/** Clave en `config` (por tenant) con la IP de la impresora térmica de red. */
export const CLAVE_IMPRESORA_IP = 'impresora_termica_ip'

/** IPv4 válida (cada octeto 0–255). La impresora se alcanza por la red local. */
export function ipValida(ip: string): boolean {
  const partes = ip.trim().split('.')
  return partes.length === 4 && partes.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)
}

export async function leerIpImpresora(tenantId: string): Promise<string | null> {
  const conf = await prisma.config.findFirst({ where: { tenantId, clave: CLAVE_IMPRESORA_IP } })
  const ip = conf?.valor?.trim() ?? ''
  return ip && ipValida(ip) ? ip : null
}
