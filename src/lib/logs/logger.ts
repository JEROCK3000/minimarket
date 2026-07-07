import { prisma } from '@/lib/db/prisma'
import { appendFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { format } from 'date-fns'

type NivelLog = 'INFO' | 'WARN' | 'ERROR' | 'SECURITY' | 'AUDIT' | 'DEBUG'

/**
 * Registrar un evento en archivo (storage/logs/mmm-dd-yyyy.log) y en BD.
 * NUNCA registra datos sensibles: sanitizarMeta() redacta campos como password,
 * token, secret, cookie, etc. (ver AGENTS.md §10).
 */
export async function registrarLog(
  nivel: NivelLog,
  modulo: string,
  mensaje: string,
  meta?: Record<string, unknown>,
  tenantId?: string | null
) {
  const ahora = new Date()
  const timestamp = format(ahora, 'yyyy-MM-dd HH:mm:ss')
  const metaSanitizada = meta ? sanitizarMeta(meta) : undefined

  const linea = `[${timestamp}] [${nivel}] [${modulo}]${tenantId ? ` [tenant:${tenantId}]` : ''} ${mensaje}${
    metaSanitizada ? ' | ' + JSON.stringify(metaSanitizada) : ''
  }\n`

  // Archivo
  try {
    const dirLogs = join(process.cwd(), 'storage', 'logs')
    if (!existsSync(dirLogs)) mkdirSync(dirLogs, { recursive: true })
    const nombreArchivo = format(ahora, 'MMM-dd-yyyy').toLowerCase() + '.log'
    appendFileSync(join(dirLogs, nombreArchivo), linea, 'utf-8')
  } catch {
    // Silencioso — no fallar la operación por un fallo de logging
  }

  // Base de datos (excepto DEBUG)
  if (nivel !== 'DEBUG') {
    try {
      await prisma.log.create({
        data: {
          tenantId: tenantId ?? null,
          nivel: nivel as never,
          modulo,
          mensaje,
          meta: (metaSanitizada as never) ?? undefined,
        },
      })
    } catch {
      // Silencioso
    }
  }
}

// ─── Sanitización de campos sensibles ─────────────────────────────────────────
const CAMPOS_SENSIBLES = [
  'password', 'token', 'secret', 'authorization', 'cookie', 'apikey',
  'accesstoken', 'refreshtoken', 'creditcard', 'cardnumber', 'cvv',
]

function sanitizarMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [clave, valor] of Object.entries(meta)) {
    const k = clave.toLowerCase()
    out[clave] = CAMPOS_SENSIBLES.some((s) => k.includes(s)) ? '[REDACTED]' : valor
  }
  return out
}
