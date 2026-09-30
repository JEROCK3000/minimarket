'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, Pencil, Truck, Loader2, X, Save, Ban, CheckCircle2, History } from 'lucide-react'
import { toast } from 'sonner'
import {
  guardarProveedorAction, cambiarEstadoProveedorAction, comprasDeProveedorAction, consultarRucProveedorAction,
  type ProveedorValues, type CompraDeProveedor,
} from './actions'

export interface ProveedorRow {
  id: string; nombre: string; identificacion: string | null; telefono: string | null; email: string | null
  direccion: string | null; activo: boolean; compras: number; totalComprado: number; ultimaCompra: string | null
}
const money = (n: number) => `$${n.toFixed(2)}`
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })

export function ProveedoresClient({ proveedores }: { proveedores: ProveedorRow[] }) {
  const router = useRouter()
  const [busqueda, setBusqueda] = useState('')
  const [verInactivos, setVerInactivos] = useState(false)
  const [editando, setEditando] = useState<ProveedorRow | 'nuevo' | null>(null)
  const [historial, setHistorial] = useState<ProveedorRow | null>(null)

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
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{proveedores.filter((p) => p.activo).length} proveedor(es) activo(s)</p>
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
                    <td className="px-4 py-3 text-xs text-gray-500">{p.ultimaCompra ? fecha(p.ultimaCompra) : '—'}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
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
