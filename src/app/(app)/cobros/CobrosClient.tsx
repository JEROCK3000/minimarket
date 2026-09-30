'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, HandCoins, Loader2, X, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { cuentaClienteAction, registrarAbonoAction, type VentaPendiente, type AbonoRow } from './actions'

export interface ClienteDeuda {
  id: string; nombre: string; identificacion: string; telefono: string | null
  saldo: number; ventas: number; vencido: number; masAntigua: string
}
const money = (n: number) => `$${n.toFixed(2)}`
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })
const PAGO: Record<string, string> = { EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', TRANSFERENCIA: 'Transferencia' }

export function CobrosClient({ clientes }: { clientes: ClienteDeuda[] }) {
  const [busqueda, setBusqueda] = useState('')
  const [abierto, setAbierto] = useState<ClienteDeuda | null>(null)
  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return clientes.filter((c) => !q || c.nombre.toLowerCase().includes(q) || c.identificacion.includes(q))
  }, [clientes, busqueda])
  const cartera = clientes.reduce((s, c) => s + c.saldo, 0)
  const vencido = clientes.reduce((s, c) => s + c.vencido, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">Cobros (fiado)</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Clientes con ventas a crédito pendientes de pago</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card"><p className="text-xs text-gray-500">Por cobrar</p><p className="text-2xl font-black text-gray-900 dark:text-white">{money(cartera)}</p></div>
        <div className="card"><p className="text-xs text-gray-500">Vencido (pasó el plazo)</p><p className={`text-2xl font-black ${vencido > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>{money(vencido)}</p></div>
        <div className="card"><p className="text-xs text-gray-500">Clientes con deuda</p><p className="text-2xl font-black text-gray-900 dark:text-white">{clientes.length}</p></div>
      </div>

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="input pl-9" placeholder="Buscar cliente por nombre o identificación" />
      </div>

      {filtrados.length === 0 ? (
        <div className="card text-center py-16">
          <CheckCircle2 size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">{clientes.length === 0 ? 'No hay ventas fiadas pendientes.' : 'Ningún cliente coincide con la búsqueda.'}</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/5 text-left text-xs text-gray-500 dark:text-gray-400">
                  <th className="px-4 py-3 font-semibold">Cliente</th>
                  <th className="px-4 py-3 font-semibold text-center">Ventas</th>
                  <th className="px-4 py-3 font-semibold">Desde</th>
                  <th className="px-4 py-3 font-semibold text-right">Saldo</th>
                  <th className="px-4 py-3 font-semibold text-right"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => (
                  <tr key={c.id} className="border-b border-gray-50 dark:border-white/5">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900 dark:text-white">{c.nombre}</p>
                      <p className="text-xs text-gray-400 font-mono">{c.identificacion}{c.telefono ? ` · ${c.telefono}` : ''}</p>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-300">{c.ventas}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{fecha(c.masAntigua)}</td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-bold text-gray-900 dark:text-white">{money(c.saldo)}</p>
                      {c.vencido > 0 && <p className="text-[11px] text-red-600 dark:text-red-400 flex items-center justify-end gap-1"><AlertTriangle size={11} /> vencido {money(c.vencido)}</p>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setAbierto(c)} className="btn-primary h-8 px-3 text-xs"><HandCoins size={14} /> Cobrar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {abierto && <CuentaCliente cliente={abierto} onClose={() => setAbierto(null)} />}
    </div>
  )
}

function CuentaCliente({ cliente, onClose }: { cliente: ClienteDeuda; onClose: () => void }) {
  const router = useRouter()
  const [datos, setDatos] = useState<{ pendientes: VentaPendiente[]; abonos: AbonoRow[] } | null>(null)
  const [monto, setMonto] = useState('')
  const [formaPago, setFormaPago] = useState<'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA'>('EFECTIVO')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(() => {
    cuentaClienteAction(cliente.id).then((r) => {
      if ('error' in r) toast.error(r.error)
      else setDatos({ pendientes: r.pendientes, abonos: r.abonos })
    })
  }, [cliente.id])
  useEffect(cargar, [cargar])

  const deuda = datos ? datos.pendientes.reduce((s, v) => s + v.saldo, 0) : cliente.saldo

  const cobrar = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    try {
      const r = await registrarAbonoAction({ clienteId: cliente.id, monto: Number(monto), formaPago, notas })
      if ('error' in r) { toast.error(r.error); return }
      toast.success(r.saldoRestante > 0 ? `Cobro registrado. Saldo pendiente: ${money(r.saldoRestante)}` : 'Deuda saldada ✓')
      setMonto(''); setNotas('')
      cargar(); router.refresh()
      if (r.saldoRestante <= 0) onClose()
    } finally { setGuardando(false) }
  }

  const lbl = 'text-xs font-semibold text-gray-500 dark:text-gray-400'
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white dark:bg-[#0f0f1e] rounded-2xl shadow-xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/5">
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white">{cliente.nombre}</h2>
            <p className="text-xs text-gray-500">Deuda actual: <strong>{money(deuda)}</strong></p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400" aria-label="Cerrar"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto p-6 space-y-5">
          <form onSubmit={cobrar} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end rounded-xl bg-gray-50 dark:bg-white/5 p-4">
            <div className="space-y-1.5">
              <label className={lbl} htmlFor="c-monto">Monto recibido</label>
              <div className="flex gap-1.5">
                <input id="c-monto" type="number" step="0.01" min="0.01" max={deuda.toFixed(2)} value={monto} onChange={(e) => setMonto(e.target.value)} className="input" required />
                <button type="button" onClick={() => setMonto(deuda.toFixed(2))} className="btn-ghost text-xs shrink-0" title="Cobrar todo">Todo</button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className={lbl} htmlFor="c-pago">Forma de pago</label>
              <select id="c-pago" value={formaPago} onChange={(e) => setFormaPago(e.target.value as typeof formaPago)} className="input">
                <option value="EFECTIVO">Efectivo</option><option value="TARJETA">Tarjeta</option><option value="TRANSFERENCIA">Transferencia</option>
              </select>
            </div>
            <button type="submit" disabled={guardando || !monto} className="btn-primary">
              {guardando ? <Loader2 size={16} className="animate-spin" /> : <HandCoins size={16} />} Registrar cobro
            </button>
            <input value={notas} onChange={(e) => setNotas(e.target.value)} className="input sm:col-span-3" placeholder="Notas (opcional)" maxLength={200} />
            <p className="text-[11px] text-gray-400 sm:col-span-3">El cobro se aplica primero a las ventas más antiguas.</p>
          </form>

          {!datos ? <div className="py-8 grid place-items-center"><Loader2 className="animate-spin text-gray-400" /></div> : (
            <>
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2">Ventas pendientes</h3>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100 dark:border-white/5">
                    <th className="py-2 font-semibold">Venta</th><th className="py-2 font-semibold">Fecha</th><th className="py-2 font-semibold">Vence</th>
                    <th className="py-2 font-semibold text-right">Total</th><th className="py-2 font-semibold text-right">Saldo</th>
                  </tr></thead>
                  <tbody>
                    {datos.pendientes.map((v) => (
                      <tr key={v.id} className="border-b border-gray-50 dark:border-white/5 last:border-0">
                        <td className="py-2 font-mono text-gray-900 dark:text-white">{v.numero}</td>
                        <td className="py-2 text-gray-500">{fecha(v.fecha)}</td>
                        <td className={`py-2 ${v.vencida ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-500'}`}>{v.vence ? fecha(v.vence) : '—'}{v.vencida ? ' (vencida)' : ''}</td>
                        <td className="py-2 text-right text-gray-600 dark:text-gray-300">{money(v.total)}</td>
                        <td className="py-2 text-right font-semibold text-gray-900 dark:text-white">{money(v.saldo)}</td>
                      </tr>
                    ))}
                    {datos.pendientes.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-gray-400">Sin ventas pendientes.</td></tr>}
                  </tbody>
                </table>
              </div>
              {datos.abonos.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2">Últimos cobros</h3>
                  <table className="w-full text-xs">
                    <tbody>
                      {datos.abonos.map((a) => (
                        <tr key={a.id} className="border-b border-gray-50 dark:border-white/5 last:border-0">
                          <td className="py-1.5 text-gray-500">{new Date(a.fecha).toLocaleString('es-EC', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                          <td className="py-1.5 font-mono text-gray-600 dark:text-gray-300">{a.venta}</td>
                          <td className="py-1.5 text-gray-500">{PAGO[a.formaPago] ?? a.formaPago}{a.usuario ? ` · ${a.usuario}` : ''}</td>
                          <td className="py-1.5 text-right font-semibold text-emerald-600 dark:text-emerald-400">{money(a.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
