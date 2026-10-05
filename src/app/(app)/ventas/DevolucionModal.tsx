'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2, Undo2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { obtenerDatosDevolucionAction, registrarDevolucionAction, type DevolucionValues } from './devolucion-actions'
import { calcularDevolucion } from '@/lib/ventas/devolucion'

type Datos = Extract<Awaited<ReturnType<typeof obtenerDatosDevolucionAction>>, { success: true }>
type Reembolso = DevolucionValues['formaReembolso']
const money = (n: number) => `$${n.toFixed(2)}`
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, ''))
const REEMBOLSO_TXT: Record<Reembolso, string> = { EFECTIVO: 'Efectivo de la caja', TARJETA: 'Reverso a la tarjeta', TRANSFERENCIA: 'Transferencia', SALDO: 'Descontar de lo que debe (fiado)' }

/** Devolución parcial de productos de una venta (ticket o factura con NC parcial). */
export function DevolucionModal({ ventaId, onClose }: { ventaId: string; onClose: () => void }) {
  const router = useRouter()
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cantidades, setCantidades] = useState<Record<string, string>>({})
  const [motivo, setMotivo] = useState('')
  const [reembolso, setReembolso] = useState<Reembolso>('EFECTIVO')
  const [reingresa, setReingresa] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [modo, setModo] = useState<'TOTAL' | 'PARCIAL'>('PARCIAL')

  useEffect(() => {
    let vigente = true
    obtenerDatosDevolucionAction(ventaId).then((r) => {
      if (!vigente) return
      if ('error' in r) { setError(r.error ?? 'Error'); return }
      setDatos(r)
      const fp = r.venta.formaPago
      setReembolso(fp === 'CREDITO' && r.venta.saldoPendiente > 0 ? 'SALDO' : fp === 'TARJETA' ? 'TARJETA' : fp === 'TRANSFERENCIA' ? 'TRANSFERENCIA' : 'EFECTIVO')
    }).catch(() => vigente && setError('No se pudo cargar la venta'))
    return () => { vigente = false }
  }, [ventaId])

  const calculo = useMemo(() => {
    if (!datos) return null
    const solicitado = new Map(Object.entries(cantidades).map(([k, v]) => [k, Number(v) || 0]).filter(([, v]) => (v as number) > 0) as [string, number][])
    try {
      return calcularDevolucion(
        datos.lineas.map((l) => ({ id: l.id, cantidad: l.cantidad, precioUnitario: l.precioUnitario, ivaPorcentaje: l.ivaPorcentaje })),
        datos.venta.descuento, new Map(datos.lineas.map((l) => [l.id, l.devuelto])), solicitado,
      )
    } catch (e: any) { return { error: e.message as string } }
  }, [datos, cantidades])

  const disponible = (l: Datos['lineas'][number]) => Math.max(0, l.cantidad - l.devuelto.cantidad)
  const todo = () => datos && setCantidades(Object.fromEntries(datos.lineas.map((l) => [l.id, disponible(l) > 0 ? num(disponible(l)) : ''])))
  const elegirModo = (m: 'TOTAL' | 'PARCIAL') => { setModo(m); if (m === 'TOTAL') todo(); else setCantidades({}) }

  const bloqueo = !datos ? null
    : datos.venta.estado !== 'COMPLETADA' ? 'La venta está anulada.'
    : datos.venta.ncPendiente ? 'Hay una nota de crédito pendiente en el SRI para esta venta: usa "Consultar SRI" primero.'
    : datos.venta.conFactura && !datos.venta.facturaAutorizada ? 'La factura no está autorizada: emítela primero o anula la venta completa.'
    : datos.lineas.every((l) => disponible(l) <= 0.0005) ? 'Ya se devolvió todo lo de esta venta.'
    : null
  const total = calculo && !('error' in calculo) ? calculo.total : 0
  const cajaCerrada = !!datos && reembolso === 'EFECTIVO' && datos.caja.control && !datos.caja.abierta

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!datos || !calculo || 'error' in calculo) return
    setEnviando(true)
    try {
      const r = await registrarDevolucionAction({
        ventaId, motivo, formaReembolso: reembolso, reingresaStock: reingresa,
        items: calculo.lineas.map((l) => ({ ventaItemId: l.ventaItemId, cantidad: l.cantidad })),
      })
      if ('error' in r) { toast.error(r.error, { duration: 9000 }); router.refresh(); return }
      toast.success(`Devolución ${r.numero} registrada: ${money(r.total)}${'notaCredito' in r && r.notaCredito ? ` · NC ${r.notaCredito} autorizada` : ''}`)
      router.refresh(); onClose()
    } finally { setEnviando(false) }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={onClose}>
      <form onSubmit={enviar} className="w-full max-w-2xl bg-white dark:bg-[#0f0f1e] rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/5 sticky top-0 bg-white dark:bg-[#0f0f1e] z-10">
          <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2"><Undo2 size={18} className="text-brand-600" /> Devolver productos {datos && `— ${datos.venta.numero}`}</h2>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-white" aria-label="Cerrar"><X size={20} /></button>
        </div>
        {!datos && !error && <div className="py-16 grid place-items-center"><Loader2 className="animate-spin text-gray-400" /></div>}
        {error && <p className="p-6 text-sm text-red-600 dark:text-red-400">{error}</p>}
        {datos && (
          <div className="p-6 space-y-5">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {datos.venta.cliente} · total {money(datos.venta.total)}{datos.venta.totalDevuelto > 0 && <> · ya devuelto <strong>{money(datos.venta.totalDevuelto)}</strong></>}
              {datos.venta.conFactura && datos.venta.facturaAutorizada && <span className="block text-xs text-brand-600 dark:text-brand-400 mt-1">Factura autorizada: se emitirá una nota de crédito parcial al SRI.</span>}
            </p>
            {bloqueo ? (
              <p className="rounded-xl border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-300 flex gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" />{bloqueo}</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de devolución">
                  {([['TOTAL', 'Devolver todo', datos.venta.totalDevuelto > 0 ? 'Todo lo que aún no se ha devuelto' : 'Todos los productos de la venta'], ['PARCIAL', 'Elegir productos', 'Solo algunos productos o cantidades']] as const).map(([k, t, d]) => (
                    <button key={k} type="button" role="radio" aria-checked={modo === k} onClick={() => elegirModo(k)}
                      className={`text-left rounded-xl border p-3 transition ${modo === k ? 'border-brand-600 ring-2 ring-brand-600/20 bg-brand-50/50 dark:bg-brand-500/10' : 'border-gray-200 dark:border-white/10 hover:border-brand-400'}`}>
                      <p className="font-semibold text-sm text-gray-900 dark:text-white">{t}</p>
                      <p className="text-xs text-gray-500">{d}</p>
                    </button>
                  ))}
                </div>
                <div className="rounded-xl border border-gray-100 dark:border-white/5 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-white/5">
                        <th className="px-3 py-2 font-semibold">Producto</th><th className="px-3 py-2 font-semibold text-right">Vendido</th>
                        <th className="px-3 py-2 font-semibold text-right">Devuelto</th><th className="px-3 py-2 font-semibold text-right">A devolver</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.lineas.map((l) => {
                        const max = disponible(l)
                        return (
                          <tr key={l.id} className="border-b border-gray-50 dark:border-white/5 last:border-0">
                            <td className="px-3 py-2 text-gray-900 dark:text-white">{l.nombre}<span className="block text-[11px] text-gray-400">{money(l.precioUnitario)} c/u</span></td>
                            <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">{num(l.cantidad)}</td>
                            <td className="px-3 py-2 text-right text-gray-500">{l.devuelto.cantidad > 0 ? num(l.devuelto.cantidad) : '—'}</td>
                            <td className="px-3 py-2 text-right">
                              {max > 0.0005 ? (
                                <input type="number" step="any" min="0" max={max} value={cantidades[l.id] ?? ''} placeholder="0" disabled={modo === 'TOTAL'}
                                  onChange={(e) => setCantidades((c) => ({ ...c, [l.id]: e.target.value }))}
                                  className="input h-9 w-24 text-right ml-auto" aria-label={`Cantidad a devolver de ${l.nombre} (máx. ${num(max)})`} />
                              ) : <span className="text-xs text-gray-400">completo</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="dv-reemb" className="text-xs font-semibold text-gray-500 dark:text-gray-400">Cómo se devuelve el dinero</label>
                    <select id="dv-reemb" value={reembolso} onChange={(e) => setReembolso(e.target.value as Reembolso)} className="input">
                      {(Object.keys(REEMBOLSO_TXT) as Reembolso[])
                        .filter((k) => k !== 'SALDO' || (datos.venta.formaPago === 'CREDITO' && datos.venta.saldoPendiente > 0))
                        .map((k) => <option key={k} value={k}>{REEMBOLSO_TXT[k]}</option>)}
                    </select>
                    {reembolso === 'SALDO' && <p className="text-[11px] text-gray-400">Debe {money(datos.venta.saldoPendiente)}: se descuenta la devolución.</p>}
                    {cajaCerrada && <p className="text-[11px] text-red-600 dark:text-red-400">La caja está cerrada: ábrela para devolver efectivo.</p>}
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Estado de los productos</span>
                    <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      <input type="checkbox" checked={reingresa} onChange={(e) => setReingresa(e.target.checked)} className="mt-0.5" />
                      <span>En buen estado: vuelven a la venta. <span className="text-xs text-gray-400 block">Desmárcalo si volvieron dañados o vencidos (quedan como merma).</span></span>
                    </label>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="dv-motivo" className="text-xs font-semibold text-gray-500 dark:text-gray-400">Motivo</label>
                  <input id="dv-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} className="input" maxLength={300} required placeholder="Ej. producto en mal estado / el cliente se equivocó" />
                </div>
                {calculo && 'error' in calculo && <p className="text-sm text-red-600 dark:text-red-400">{calculo.error}</p>}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-gray-100 dark:border-white/5">
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    A devolver: <span className="text-xl font-black text-gray-900 dark:text-white">{money(total)}</span>
                    {calculo && !('error' in calculo) && calculo.iva > 0 && <span className="text-xs text-gray-400"> (incluye IVA {money(calculo.iva)})</span>}
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={onClose} className="btn-ghost" disabled={enviando}>Cancelar</button>
                    <button type="submit" className="btn-primary" disabled={enviando || total <= 0 || motivo.trim().length < 3 || cajaCerrada}>
                      {enviando ? <Loader2 size={16} className="animate-spin" /> : <Undo2 size={16} />} {datos.venta.facturaAutorizada ? 'Emitir NC y devolver' : 'Registrar devolución'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </form>
    </div>
  )
}
