'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2, History, SlidersHorizontal, Save } from 'lucide-react'
import { toast } from 'sonner'
import { obtenerKardexAction, ajustarStockAction, type MovimientoKardex, type AjusteStockValues } from './inventario-actions'

const TIPOS: Record<string, { texto: string; clase: string }> = {
  COMPRA: { texto: 'Compra', clase: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' },
  VENTA: { texto: 'Venta', clase: 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400' },
  AJUSTE: { texto: 'Ajuste', clase: 'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300' },
  MERMA: { texto: 'Merma', clase: 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400' },
}
const MODOS: { valor: AjusteStockValues['modo']; texto: string; ayuda: string }[] = [
  { valor: 'MERMA', texto: 'Merma', ayuda: 'Producto vencido, dañado o perdido (sale del inventario).' },
  { valor: 'CONTEO', texto: 'Conteo físico', ayuda: 'Escribe cuánto contaste; se ajusta la diferencia.' },
  { valor: 'ENTRADA', texto: 'Entrada', ayuda: 'Sobrante encontrado o devolución a stock.' },
  { valor: 'SALIDA', texto: 'Salida', ayuda: 'Consumo interno, faltante u otra salida.' },
]
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3))
const fecha = (iso: string) => new Date(iso).toLocaleString('es-EC', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })

/** Kardex (historial de movimientos) de un producto y, para ADMIN, ajustes de inventario. */
export function KardexModal({ productoId, puedeEditar, onClose }: { productoId: string; puedeEditar: boolean; onClose: () => void }) {
  const router = useRouter()
  const [datos, setDatos] = useState<{ producto: { nombre: string; unidad: string; stock: number }; movimientos: MovimientoKardex[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vista, setVista] = useState<'kardex' | 'ajuste'>('kardex')
  const [modo, setModo] = useState<AjusteStockValues['modo']>('MERMA')
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(() => {
    obtenerKardexAction(productoId).then((r) => {
      if ('error' in r) setError(r.error)
      else setDatos({ producto: r.producto, movimientos: r.movimientos })
    }).catch(() => setError('No se pudo cargar el kardex'))
  }, [productoId])
  useEffect(cargar, [cargar])

  const guardarAjuste = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    try {
      const r = await ajustarStockAction({ productoId, modo, cantidad: Number(cantidad), motivo })
      if ('error' in r) { toast.error(r.error); return }
      toast.success(`Ajuste registrado. Stock actual: ${num(r.stockNuevo ?? 0)}`)
      setCantidad(''); setMotivo(''); setVista('kardex')
      cargar()
      router.refresh()
    } finally { setGuardando(false) }
  }

  const modoActual = MODOS.find((m) => m.valor === modo)!
  const lbl = 'text-xs font-semibold text-gray-500 dark:text-gray-400'

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={onClose}>
      <div className="w-full max-w-3xl bg-white dark:bg-[#0f0f1e] rounded-2xl shadow-xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/5">
          <div className="min-w-0">
            <h2 className="font-bold text-gray-900 dark:text-white truncate">{datos?.producto.nombre ?? 'Inventario'}</h2>
            {datos && <p className="text-xs text-gray-500 dark:text-gray-400">Stock actual: <strong>{num(datos.producto.stock)} {datos.producto.unidad}</strong></p>}
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-white" aria-label="Cerrar"><X size={20} /></button>
        </div>

        <div className="flex gap-1 px-6 pt-3 border-b border-gray-100 dark:border-white/5">
          {[
            { v: 'kardex' as const, t: 'Kardex', Icono: History },
            ...(puedeEditar ? [{ v: 'ajuste' as const, t: 'Ajustar stock', Icono: SlidersHorizontal }] : []),
          ].map(({ v, t, Icono }) => (
            <button key={v} onClick={() => setVista(v)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px ${vista === v ? 'border-brand-600 text-gray-900 dark:text-white' : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}>
              <Icono size={14} /> {t}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto p-6">
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {!datos && !error && <div className="py-12 grid place-items-center"><Loader2 className="animate-spin text-gray-400" /></div>}

          {datos && vista === 'kardex' && (
            datos.movimientos.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">Este producto aún no tiene movimientos.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-white/5">
                      <th className="py-2 pr-3 font-semibold">Fecha</th>
                      <th className="py-2 pr-3 font-semibold">Tipo</th>
                      <th className="py-2 pr-3 font-semibold">Detalle</th>
                      <th className="py-2 pr-3 font-semibold text-right">Cantidad</th>
                      <th className="py-2 font-semibold text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.movimientos.map((m) => {
                      const t = TIPOS[m.tipo] ?? TIPOS.AJUSTE
                      return (
                        <tr key={m.id} className="border-b border-gray-50 dark:border-white/5 last:border-0">
                          <td className="py-2 pr-3 whitespace-nowrap text-gray-500 dark:text-gray-400 text-xs">{fecha(m.fecha)}</td>
                          <td className="py-2 pr-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.clase}`}>{t.texto}</span></td>
                          <td className="py-2 pr-3 text-gray-700 dark:text-gray-300">{m.motivo || '—'}</td>
                          <td className={`py-2 pr-3 text-right font-mono font-semibold ${m.cantidad >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {m.cantidad > 0 ? '+' : ''}{num(m.cantidad)}
                          </td>
                          <td className="py-2 text-right font-mono text-gray-900 dark:text-white">{num(m.stockNuevo)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {datos.movimientos.length === 300 && <p className="text-[11px] text-gray-400 mt-2">Se muestran los últimos 300 movimientos.</p>}
              </div>
            )
          )}

          {datos && vista === 'ajuste' && puedeEditar && (
            <form onSubmit={guardarAjuste} className="space-y-4 max-w-md">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Tipo de ajuste">
                {MODOS.map((m) => (
                  <button key={m.valor} type="button" onClick={() => setModo(m.valor)} role="radio" aria-checked={modo === m.valor}
                    className={`px-3 py-2 rounded-xl border text-xs font-semibold transition ${modo === m.valor
                      ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400'
                      : 'border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5'}`}>
                    {m.texto}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{modoActual.ayuda}</p>
              <div className="space-y-1.5">
                <label className={lbl} htmlFor="aj-cantidad">{modo === 'CONTEO' ? `Stock contado (${datos.producto.unidad})` : `Cantidad (${datos.producto.unidad})`}</label>
                <input id="aj-cantidad" type="number" step="any" min="0" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="input" required />
                {modo === 'CONTEO' && cantidad !== '' && (
                  <p className="text-xs text-gray-500">Diferencia: <strong>{(() => { const d = Number(cantidad) - datos.producto.stock; return `${d > 0 ? '+' : ''}${num(d)}` })()}</strong></p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className={lbl} htmlFor="aj-motivo">Motivo</label>
                <input id="aj-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} className="input" maxLength={150} required
                  placeholder={modo === 'MERMA' ? 'Ej. producto vencido' : modo === 'CONTEO' ? 'Ej. inventario mensual' : 'Describe el motivo'} />
              </div>
              <button type="submit" disabled={guardando} className="btn-primary">
                {guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Registrar ajuste
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
