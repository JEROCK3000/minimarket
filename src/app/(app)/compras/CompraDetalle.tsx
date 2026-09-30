'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2, Ban, Truck, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { obtenerCompraAction, anularCompraAction, type CompraDetalle as Detalle } from './actions'

const money = (n: number) => `$${n.toFixed(2)}`
const fechaLarga = (iso: string) =>
  new Date(iso).toLocaleString('es-EC', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const cantidadTxt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3))

/** Modal con el detalle completo de una compra y, para ADMIN, la anulación. */
export function CompraDetalle({ compraId, puedeEditar, onClose }: { compraId: string; puedeEditar: boolean; onClose: () => void }) {
  const router = useRouter()
  const [compra, setCompra] = useState<Detalle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [anulando, setAnulando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let vigente = true
    obtenerCompraAction(compraId).then((r) => {
      if (!vigente) return
      if ('compra' in r) setCompra(r.compra)
      else setError(r.error)
    }).catch(() => vigente && setError('No se pudo cargar la compra'))
    return () => { vigente = false }
  }, [compraId])

  const confirmarAnulacion = async () => {
    setEnviando(true)
    try {
      const r = await anularCompraAction(compraId, motivo)
      if ('error' in r) { toast.error(r.error); return }
      toast.success('Compra anulada y stock revertido')
      router.refresh()
      onClose()
    } finally { setEnviando(false) }
  }

  const anulada = compra?.estado === 'ANULADA'
  const lbl = 'text-[11px] font-semibold uppercase tracking-wide text-gray-400'

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white dark:bg-[#0f0f1e] rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/5 sticky top-0 bg-white dark:bg-[#0f0f1e] z-10">
          <div className="flex items-center gap-2">
            <Truck size={18} className="text-brand-600" />
            <h2 className="font-bold text-gray-900 dark:text-white">Compra {compra?.numero ?? ''}</h2>
            {compra && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                anulada ? 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
              }`}>{anulada ? 'ANULADA' : 'ACTIVA'}</span>
            )}
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-white" aria-label="Cerrar"><X size={20} /></button>
        </div>

        {!compra && !error && (
          <div className="py-16 grid place-items-center"><Loader2 className="animate-spin text-gray-400" /></div>
        )}
        {error && <p className="p-6 text-sm text-red-600 dark:text-red-400">{error}</p>}

        {compra && (
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className={lbl}>Fecha</p>
                <p className="text-gray-900 dark:text-white">{fechaLarga(compra.fecha)}</p>
              </div>
              <div>
                <p className={lbl}>Proveedor</p>
                <p className="text-gray-900 dark:text-white">{compra.proveedor?.nombre ?? 'Sin proveedor'}</p>
                {compra.proveedor?.identificacion && <p className="text-xs font-mono text-gray-500">{compra.proveedor.identificacion}</p>}
              </div>
              <div>
                <p className={lbl}>Factura del proveedor</p>
                <p className="font-mono text-gray-900 dark:text-white">{compra.numFactura || '—'}</p>
              </div>
            </div>

            {compra.notas && (
              <div className="text-sm">
                <p className={lbl}>Notas</p>
                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">{compra.notas}</p>
              </div>
            )}

            {anulada && (
              <div className="rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-400">
                <p className="font-semibold">Anulada {compra.anuladaAt ? `el ${fechaLarga(compra.anuladaAt)}` : ''}</p>
                {compra.motivoAnulacion && <p className="mt-0.5">Motivo: {compra.motivoAnulacion}</p>}
              </div>
            )}

            <div className="rounded-xl border border-gray-100 dark:border-white/5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-white/5">
                    <th className="px-3 py-2 font-semibold">Producto</th>
                    <th className="px-3 py-2 font-semibold text-right">Cantidad</th>
                    <th className="px-3 py-2 font-semibold text-right">Costo unit.</th>
                    <th className="px-3 py-2 font-semibold text-right">IVA</th>
                    <th className="px-3 py-2 font-semibold text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {compra.items.map((it, i) => (
                    <tr key={i} className="border-b border-gray-50 dark:border-white/5 last:border-0">
                      <td className="px-3 py-2 text-gray-900 dark:text-white">{it.nombre}</td>
                      <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">{cantidadTxt(it.cantidad)} <span className="text-xs text-gray-400">{it.unidad}</span></td>
                      <td className="px-3 py-2 text-right font-mono text-gray-600 dark:text-gray-300">${it.precioUnitario.toFixed(4)}</td>
                      <td className="px-3 py-2 text-right text-xs text-gray-500">{it.ivaPorcentaje}%</td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-white">{money(it.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="ml-auto w-full sm:w-64 space-y-1 text-sm">
              <div className="flex justify-between text-gray-600 dark:text-gray-300"><span>Subtotal</span><span>{money(compra.subtotal)}</span></div>
              <div className="flex justify-between text-gray-600 dark:text-gray-300"><span>IVA</span><span>{money(compra.iva)}</span></div>
              <div className="flex justify-between font-bold text-gray-900 dark:text-white text-base pt-1 border-t border-gray-100 dark:border-white/5">
                <span>Total</span><span>{money(compra.total)}</span>
              </div>
            </div>

            {puedeEditar && !anulada && (
              <div className="pt-2 border-t border-gray-100 dark:border-white/5">
                {!anulando ? (
                  <button onClick={() => setAnulando(true)} className="btn-ghost text-red-600 dark:text-red-400 text-sm">
                    <Ban size={15} /> Anular compra
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Se retirará del inventario lo que ingresó esta compra. La compra no se borra: queda marcada como anulada.
                    </p>
                    <textarea
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      className="input min-h-[70px]"
                      placeholder="Motivo de la anulación (ej. compra registrada dos veces)"
                      maxLength={300}
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => { setAnulando(false); setMotivo('') }} className="btn-ghost text-sm" disabled={enviando}>Cancelar</button>
                      <button onClick={confirmarAnulacion} disabled={enviando || motivo.trim().length < 5} className="btn-primary bg-red-600 hover:bg-red-700 text-sm">
                        {enviando ? <Loader2 size={15} className="animate-spin" /> : <Ban size={15} />} Confirmar anulación
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!puedeEditar && (
              <p className="flex items-center gap-1.5 text-xs text-gray-400"><FileText size={13} /> Solo el administrador puede anular compras.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
