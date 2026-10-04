const E: Record<string, string> = {
  PENDIENTE: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  PAGO_VERIFICADO: 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400',
  APROBADO: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
  RECHAZADO: 'bg-gray-200 text-gray-600 dark:bg-white/10 dark:text-gray-400',
}
export function EstadoSolicitud({ estado }: { estado: string }) {
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${E[estado] ?? E.RECHAZADO}`}>{estado.replace('_', ' ')}</span>
}
