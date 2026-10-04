import type { EstadoSuscripcion } from '@/lib/saas/suscripcion'

const E: Record<EstadoSuscripcion, { t: string; c: string }> = {
  ACTIVO: { t: 'ACTIVO', c: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' },
  PRUEBA: { t: 'PRUEBA', c: 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400' },
  GRACIA: { t: 'GRACIA', c: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' },
  SUSPENDIDO: { t: 'SUSPENDIDO', c: 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400' },
  CANCELADO: { t: 'CANCELADO', c: 'bg-gray-200 text-gray-600 dark:bg-white/10 dark:text-gray-400' },
}
export function EstadoBadge({ estado }: { estado: EstadoSuscripcion }) {
  const e = E[estado]
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${e.c}`}>{e.t}</span>
}
