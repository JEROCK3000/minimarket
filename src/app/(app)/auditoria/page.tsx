import type { Metadata } from 'next'
import Link from 'next/link'
import { requerirTenant } from '@/lib/auth/tenant'
import { prisma } from '@/lib/db/prisma'
import { ShieldCheck } from 'lucide-react'
import type { NivelLog, Prisma } from '@prisma/client'

export const metadata: Metadata = { title: 'Auditoría' }

const NIVELES: NivelLog[] = ['AUDIT', 'SECURITY', 'ERROR', 'WARN', 'INFO']
const POR_PAGINA = 50
const COLOR: Record<string, string> = {
  AUDIT: 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400',
  SECURITY: 'bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400',
  ERROR: 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400',
  WARN: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  INFO: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300',
}

/**
 * Visor del registro de auditoría del minimarket (tabla `logs`, ya sanitizada
 * por registrarLog: nunca contiene contraseñas, tokens ni secretos). Solo ADMIN,
 * siempre filtrado por su tenant. Filtros por querystring (GET), paginado en servidor.
 */
export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sesion = await requerirTenant('ADMIN')
  const sp = await searchParams
  const nivel = NIVELES.includes(sp.nivel as NivelLog) ? (sp.nivel as NivelLog) : undefined
  const modulo = (sp.modulo || '').slice(0, 60) || undefined
  const texto = (sp.q || '').trim().slice(0, 100) || undefined
  const fecha = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined)
  const desde = fecha(sp.desde)
  const hasta = fecha(sp.hasta)
  const pagina = Math.max(1, Math.min(1000, parseInt(sp.p || '1', 10) || 1))

  const where: Prisma.LogWhereInput = {
    tenantId: sesion.tenantId,
    nivel: nivel ?? { not: 'DEBUG' },
    ...(modulo ? { modulo } : {}),
    ...(texto ? { mensaje: { contains: texto } } : {}),
    ...(desde || hasta ? { createdAt: { ...(desde ? { gte: new Date(`${desde}T00:00:00`) } : {}), ...(hasta ? { lte: new Date(`${hasta}T23:59:59.999`) } : {}) } } : {}),
  }
  const [logs, total, modulos] = await Promise.all([
    prisma.log.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (pagina - 1) * POR_PAGINA, take: POR_PAGINA, select: { id: true, nivel: true, modulo: true, mensaje: true, createdAt: true } }),
    prisma.log.count({ where }),
    prisma.log.findMany({ where: { tenantId: sesion.tenantId }, distinct: ['modulo'], select: { modulo: true }, orderBy: { modulo: 'asc' } }),
  ])
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const enlace = (p: number) => {
    const q = new URLSearchParams()
    if (nivel) q.set('nivel', nivel)
    if (modulo) q.set('modulo', modulo)
    if (texto) q.set('q', texto)
    if (desde) q.set('desde', desde)
    if (hasta) q.set('hasta', hasta)
    q.set('p', String(p))
    return `/auditoria?${q}`
  }
  const lbl = 'text-xs font-semibold text-gray-500 dark:text-gray-400'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2"><ShieldCheck size={22} className="text-brand-600" /> Auditoría</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Quién hizo qué y cuándo: ventas, anulaciones, compras, ajustes, usuarios, accesos y errores.</p>
      </div>

      <form method="get" className="card grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
        <div className="space-y-1.5 lg:col-span-2">
          <label className={lbl} htmlFor="a-q">Buscar</label>
          <input id="a-q" name="q" defaultValue={texto} className="input" placeholder="Ej. VEN-000123, anulada, correo…" />
        </div>
        <div className="space-y-1.5">
          <label className={lbl} htmlFor="a-nivel">Nivel</label>
          <select id="a-nivel" name="nivel" defaultValue={nivel ?? ''} className="input">
            <option value="">Todos</option>
            {NIVELES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className={lbl} htmlFor="a-mod">Módulo</label>
          <select id="a-mod" name="modulo" defaultValue={modulo ?? ''} className="input">
            <option value="">Todos</option>
            {modulos.map((m) => <option key={m.modulo} value={m.modulo}>{m.modulo}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className={lbl} htmlFor="a-desde">Desde</label>
          <input id="a-desde" name="desde" type="date" defaultValue={desde} className="input" />
        </div>
        <div className="space-y-1.5">
          <label className={lbl} htmlFor="a-hasta">Hasta</label>
          <input id="a-hasta" name="hasta" type="date" defaultValue={hasta} className="input" />
        </div>
        <div className="flex gap-2 lg:col-span-6 justify-end">
          <Link href="/auditoria" className="btn-ghost text-sm">Limpiar</Link>
          <button type="submit" className="btn-primary text-sm">Filtrar</button>
        </div>
      </form>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/5 text-left text-xs text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 font-semibold">Fecha</th>
                <th className="px-4 py-3 font-semibold">Nivel</th>
                <th className="px-4 py-3 font-semibold">Módulo</th>
                <th className="px-4 py-3 font-semibold">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-400">No hay registros con estos filtros.</td></tr>}
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-gray-50 dark:border-white/5 align-top">
                  <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                    {l.createdAt.toLocaleString('es-EC', { timeZone: 'America/Guayaquil', day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </td>
                  <td className="px-4 py-2.5"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${COLOR[l.nivel] ?? COLOR.INFO}`}>{l.nivel}</span></td>
                  <td className="px-4 py-2.5 text-xs font-mono text-gray-600 dark:text-gray-300">{l.modulo}</td>
                  <td className="px-4 py-2.5 text-gray-800 dark:text-gray-200 break-words max-w-xl">{l.mensaje}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
        <span>{total} registro(s) · página {pagina} de {paginas}</span>
        <div className="flex gap-2">
          {pagina > 1 && <Link href={enlace(pagina - 1)} className="btn-ghost h-8 text-xs">← Anterior</Link>}
          {pagina < paginas && <Link href={enlace(pagina + 1)} className="btn-ghost h-8 text-xs">Siguiente →</Link>}
        </div>
      </div>
    </div>
  )
}
