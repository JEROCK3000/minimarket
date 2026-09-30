'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, Pencil, Truck, Loader2, X, Save, Ban, CheckCircle2, History, Wallet, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import {
  guardarProveedorAction, cambiarEstadoProveedorAction, comprasDeProveedorAction, consultarRucProveedorAction,
  cuentaProveedorAction, pagarProveedorAction,
  type ProveedorValues, type CompraDeProveedor, type CompraPorPagar, type PagoRow,
} from './actions'

export interface ProveedorRow {
  id: string; nombre: string; identificacion: string | null; telefono: string | null; email: string | null
  direccion: string | null; activo: boolean; compras: number; totalComprado: number; ultimaCompra: string | null
  porPagar: number; vencido: number
}
const money = (n: number) => `$${n.toFixed(2)}`
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })

export function ProveedoresClient({ proveedores }: { proveedores: ProveedorRow[] }) {
  const router = useRouter()
  const [busqueda, setBusqueda] = useState('')
  const [verInactivos, setVerInactivos] = useState(false)
  const [editando, setEditando] = useState<ProveedorRow | 'nuevo' | null>(null)
  const [historial, setHistorial] = useState<ProveedorRow | null>(null)
  const [pagar, setPagar] = useState<ProveedorRow | null>(null)
  const totalPorPagar = proveedores.reduce((s, p) => s + p.porPagar, 0)
  const totalVencido = proveedores.reduce((s, p) => s + p.vencido, 0)

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return proveedores.filter((p) =>
      (verInactivos || p.activo) &&
      (!q || p.nombre.toLowerCase().includes(q) || (p.identificacion ?? '').includes(q)),
    )
  }, [proveedores, busqueda, verInactivos])

  const cambiarEstado = async (p: ProveedorRow) => {
    const r = await cambiarEstadoProveedorAction(p.id, !p.activo)
    if ('error' in r) toast.error(r.error)
    else { toast.success(p.activo ? 'Proveedor desactivado' : 'Proveedor activado'); router.refresh() }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Proveedores</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {proveedores.filter((p) => p.activo).length} proveedor(es) activo(s)
            {totalPorPagar > 0 && <> · por pagar <strong className="text-gray-900 dark:text-white">{money(totalPorPagar)}</strong></>}
            {totalVencido > 0 && <span className="text-red-600 dark:text-red-400"> ({money(totalVencido)} vencido)</span>}
          </p>
        </div>
        <button onClick={() => setEditando('nuevo')} className="btn-primary"><Plus size={16} /> Nuevo proveedor</button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="input pl-9" placeholder="Buscar por nombre o RUC" />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 shrink-0">
          <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} /> Ver inactivos
        </label>
      </div>

      {filtrados.length === 0 ? (
        <div className="card text-center py-16">
          <Truck size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">{proveedores.length === 0 ? 'Aún no hay proveedores.' : 'Ningún proveedor coincide con la búsqueda.'}</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/5 text-left text-xs text-gray-500 dark:text-gray-400">
                  <th className="px-4 py-3 font-semibold">Proveedor</th>
                  <th className="px-4 py-3 font-semibold">Contacto</th>
                  <th className="px-4 py-3 font-semibold text-center">Compras</th>
                  <th className="px-4 py-3 font-semibold text-right">Total comprado</th>
                  <th className="px-4 py-3 font-semibold text-right">Por pagar</th>
                  <th className="px-4 py-3 font-semibold">Última</th>
                  <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) => (
                  <tr key={p.id} className={`border-b border-gray-50 dark:border-white/5 ${p.activo ? '' : 'opacity-60'}`}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900 dark:text-white">{p.nombre} {!p.activo && <span className="text-[10px] text-gray-400">(inactivo)</span>}</p>
                      {p.identificacion && <p className="text-xs font-mono text-gray-400">{p.identificacion}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                      {p.telefono && <p>{p.telefono}</p>}
                      {p.email && <p className="text-gray-400">{p.email}</p>}
                      {!p.telefono && !p.email && '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-300">{p.compras}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">{money(p.totalComprado)}</td>
                    <td className="px-4 py-3 text-right">
                      {p.porPagar > 0 ? (
                        <>
                          <p className="font-semibold text-gray-900 dark:text-white">{money(p.porPagar)}</p>
                          {p.vencido > 0 && <p className="text-[11px] text-red-600 dark:text-red-400 flex items-center justify-end gap-1"><AlertTriangle size={11} /> vencido</p>}
                        </>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{p.ultimaCompra ? fecha(p.ultimaCompra) : '—'}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {p.porPagar > 0 && (
                        <button onClick={() => setPagar(p)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-amber-600 hover:text-amber-700" title="Pagar al proveedor" aria-label={`Pagar a ${p.nombre}`}><Wallet size={15} /></button>
                      )}
                      <button onClick={() => setHistorial(p)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 hover:text-brand-600" title="Historial de compras" aria-label={`Historial de ${p.nombre}`}><History size={15} /></button>
                      <button onClick={() => setEditando(p)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 hover:text-brand-600" title="Editar" aria-label={`Editar ${p.nombre}`}><Pencil size={15} /></button>
                      <button onClick={() => cambiarEstado(p)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 hover:text-red-500" title={p.activo ? 'Desactivar' : 'Activar'} aria-label={`${p.activo ? 'Desactivar' : 'Activar'} ${p.nombre}`}>
                        {p.activo ? <Ban size={15} /> : <CheckCircle2 size={15} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editando && (
        <ProveedorForm
          proveedor={editando === 'nuevo' ? null : editando}
          onClose={() => setEditando(null)}
          onGuardado={() => { setEditando(null); router.refresh() }}
        />
      )}
      {historial && <HistorialCompras proveedor={historial} onClose={() => setHistorial(null)} />}
      {pagar && <PagarProveedor proveedor={pagar} onClose={() => setPagar(null)} onPagado={() => router.refresh()} />}
    </div>
  )
}

function ProveedorForm({ proveedor, onClose, onGuardado }: { proveedor: ProveedorRow | null; onClose: () => void; onGuardado: () => void }) {
  const [f, setF] = useState<ProveedorValues>({
    nombre: proveedor?.nombre ?? '', identificacion: proveedor?.identificacion ?? '', telefono: proveedor?.telefono ?? '',
    email: proveedor?.email ?? '', direccion: proveedor?.direccion ?? '',
  })
  const [guardando, setGuardando] = useState(false)
  const [consultando, setConsultando] = useState(false)
  const set = (k: keyof ProveedorValues, v: string) => setF((s) => ({ ...s, [k]: v }))
  const lbl = 'text-xs font-semibold text-gray-500 dark:text-gray-400'

  const consultar = async () => {
    setConsultando(true)
    try {
      const r = await consultarRucProveedorAction(f.identificacion ?? '')
      if ('error' in r) { toast.error(r.error); return }
      setF((s) => ({ ...s, nombre: r.nombre || s.nombre, direccion: r.direccion || s.direccion }))
      toast.success('Datos cargados desde el SRI')
    } finally { setConsultando(false) }
  }

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    try {
      const r = await guardarProveedorAction(proveedor?.id ?? null, f)
      if ('error' in r) { toast.error(r.error); return }
      toast.success(proveedor ? 'Proveedor actualizado' : 'Proveedor creado')
      onGuardado()
    } finally { setGuardando(false) }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={onClose}>
      <form onSubmit={guardar} className="w-full max-w-lg bg-white dark:bg-[#0f0f1e] rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/5">
          <h2 className="font-bold text-gray-900 dark:text-white">{proveedor ? 'Editar proveedor' : 'Nuevo proveedor'}</h2>
          <button type="button" onClick={onClose} className="p-1 text-gray-400" aria-label="Cerrar"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className={lbl} htmlFor="pv-ruc">RUC / identificación</label>
            <div className="flex gap-1.5">
              <input id="pv-ruc" value={f.identificacion} onChange={(e) => set('identificacion', e.target.value)} className="input font-mono" maxLength={15} />
              <button type="button" onClick={consultar} disabled={consultando || (f.identificacion ?? '').replace(/\D/g, '').length !== 13} className="btn-ghost shrink-0 text-xs" title="Consultar RUC en el SRI">
                {consultando ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} SRI
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className={lbl} htmlFor="pv-nombre">Nombre / Razón social *</label>
            <input id="pv-nombre" value={f.nombre} onChange={(e) => set('nombre', e.target.value)} className="input" required maxLength={150} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className={lbl} htmlFor="pv-tel">Teléfono</label>
              <input id="pv-tel" value={f.telefono} onChange={(e) => set('telefono', e.target.value)} className="input" maxLength={20} />
            </div>
            <div className="space-y-1.5">
              <label className={lbl} htmlFor="pv-email">Email</label>
              <input id="pv-email" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} className="input" maxLength={150} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className={lbl} htmlFor="pv-dir">Dirección</label>
            <input id="pv-dir" value={f.direccion} onChange={(e) => set('direccion', e.target.value)} className="input" maxLength={300} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 pb-6">
          <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
          <button type="submit" disabled={guardando} className="btn-primary">
            {guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar
          </button>
        </div>
      </form>
    </div>
  )
}

function HistorialCompras({ proveedor, onClose }: { proveedor: ProveedorRow; onClose: () => void }) {
  const [compras, setCompras] = useState<CompraDeProveedor[] | null>(null)
  useEffect(() => {
    comprasDeProveedorAction(proveedor.id).then((r) => {
      if ('error' in r) { toast.error(r.error); setCompras([]) } else setCompras(r.compras)
    })
  }, [proveedor.id])
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={onClose}>
      <div className="w-full max-w-xl bg-white dark:bg-[#0f0f1e] rounded-2xl shadow-xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/5">
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white">Compras a {proveedor.nombre}</h2>
            <p className="text-xs text-gray-500">Total comprado (activas): {money(proveedor.totalComprado)}</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400" aria-label="Cerrar"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto p-6">
          {!compras ? <div className="py-10 grid place-items-center"><Loader2 className="animate-spin text-gray-400" /></div>
            : compras.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">Sin compras registradas.</p>
            : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100 dark:border-white/5">
                    <th className="py-2 font-semibold">Nº</th><th className="py-2 font-semibold">Fecha</th>
                    <th className="py-2 font-semibold">Factura</th><th className="py-2 font-semibold text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {compras.map((c) => (
                    <tr key={c.id} className={`border-b border-gray-50 dark:border-white/5 last:border-0 ${c.estado === 'ANULADA' ? 'opacity-50 line-through' : ''}`}>
                      <td className="py-2 font-mono text-gray-900 dark:text-white">{c.numero}</td>
                      <td className="py-2 text-gray-500">{fecha(c.fecha)}</td>
                      <td className="py-2 font-mono text-xs text-gray-500">{c.numFactura || '—'}</td>
                      <td className="py-2 text-right font-semibold text-gray-900 dark:text-white">{money(c.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>
    </div>
  )
}

function PagarProveedor({ proveedor, onClose, onPagado }: { proveedor: ProveedorRow; onClose: () => void; onPagado: () => void }) {
  const [datos, setDatos] = useState<{ pendientes: CompraPorPagar[]; pagos: PagoRow[] } | null>(null)
  const [monto, setMonto] = useState('')
  const [formaPago, setFormaPago] = useState<'EFECTIVO' | 'TRANSFERENCIA' | 'TARJETA' | 'CHEQUE'>('TRANSFERENCIA')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const cargar = () => {
    cuentaProveedorAction(proveedor.id).then((r) => { if ('error' in r) toast.error(r.error); else setDatos({ pendientes: r.pendientes, pagos: r.pagos }) })
  }
  useEffect(cargar, [proveedor.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const deuda = datos ? datos.pendientes.reduce((s, c) => s + c.saldo, 0) : proveedor.porPagar

  const pagar = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    try {
      const r = await pagarProveedorAction({ proveedorId: proveedor.id, monto: Number(monto), formaPago, notas })
      if ('error' in r) { toast.error(r.error); return }
      toast.success(r.saldoRestante > 0 ? `Pago registrado. Queda por pagar ${money(r.saldoRestante)}` : 'Deuda con el proveedor saldada ✓')
      setMonto(''); setNotas(''); cargar(); onPagado()
      if (r.saldoRestante <= 0) onClose()
    } finally { setGuardando(false) }
  }
  const lbl = 'text-xs font-semibold text-gray-500 dark:text-gray-400'
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white dark:bg-[#0f0f1e] rounded-2xl shadow-xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/5">
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white">Pagar a {proveedor.nombre}</h2>
            <p className="text-xs text-gray-500">Por pagar: <strong>{money(deuda)}</strong></p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400" aria-label="Cerrar"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto p-6 space-y-5">
          <form onSubmit={pagar} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end rounded-xl bg-gray-50 dark:bg-white/5 p-4">
            <div className="space-y-1.5">
              <label className={lbl} htmlFor="pp-monto">Monto pagado</label>
              <div className="flex gap-1.5">
                <input id="pp-monto" type="number" step="0.01" min="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} className="input" required />
                <button type="button" onClick={() => setMonto(deuda.toFixed(2))} className="btn-ghost text-xs shrink-0">Todo</button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className={lbl} htmlFor="pp-forma">Forma de pago</label>
              <select id="pp-forma" value={formaPago} onChange={(e) => setFormaPago(e.target.value as typeof formaPago)} className="input">
                <option value="TRANSFERENCIA">Transferencia</option><option value="EFECTIVO">Efectivo (sale de caja)</option>
                <option value="CHEQUE">Cheque</option><option value="TARJETA">Tarjeta</option>
              </select>
            </div>
            <button type="submit" disabled={guardando || !monto} className="btn-primary">
              {guardando ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />} Registrar pago
            </button>
            <input value={notas} onChange={(e) => setNotas(e.target.value)} className="input sm:col-span-3" placeholder="Notas (ej. nº de transferencia)" maxLength={200} />
            <p className="text-[11px] text-gray-400 sm:col-span-3">El pago se aplica primero a las compras más antiguas.</p>
          </form>
          {!datos ? <div className="py-8 grid place-items-center"><Loader2 className="animate-spin text-gray-400" /></div> : (
            <>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100 dark:border-white/5">
                  <th className="py-2 font-semibold">Compra</th><th className="py-2 font-semibold">Factura</th><th className="py-2 font-semibold">Vence</th>
                  <th className="py-2 font-semibold text-right">Total</th><th className="py-2 font-semibold text-right">Saldo</th>
                </tr></thead>
                <tbody>
                  {datos.pendientes.map((c) => (
                    <tr key={c.id} className="border-b border-gray-50 dark:border-white/5 last:border-0">
                      <td className="py-2 font-mono text-gray-900 dark:text-white">{c.numero}</td>
                      <td className="py-2 font-mono text-xs text-gray-500">{c.numFactura || '—'}</td>
                      <td className={`py-2 ${c.vencida ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-500'}`}>{c.venceEl ? fecha(c.venceEl) : '—'}</td>
                      <td className="py-2 text-right text-gray-600 dark:text-gray-300">{money(c.total)}</td>
                      <td className="py-2 text-right font-semibold text-gray-900 dark:text-white">{money(c.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {datos.pagos.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2">Últimos pagos</h3>
                  <table className="w-full text-xs"><tbody>
                    {datos.pagos.map((x) => (
                      <tr key={x.id} className="border-b border-gray-50 dark:border-white/5 last:border-0">
                        <td className="py-1.5 text-gray-500">{new Date(x.fecha).toLocaleDateString('es-EC')}</td>
                        <td className="py-1.5 font-mono text-gray-600 dark:text-gray-300">{x.compra}</td>
                        <td className="py-1.5 text-gray-500">{x.formaPago}{x.notas ? ` · ${x.notas}` : ''}</td>
                        <td className="py-1.5 text-right font-semibold text-gray-900 dark:text-white">{money(x.monto)}</td>
                      </tr>
                    ))}
                  </tbody></table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
