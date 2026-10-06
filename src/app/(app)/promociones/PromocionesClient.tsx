'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Tag, X, Loader2, Save, Pencil, Trash2, Pause, Play } from 'lucide-react'
import { toast } from 'sonner'
import { guardarPromocionAction, cambiarEstadoPromocionAction, eliminarPromocionAction, type PromocionValues } from './actions'
import { describirPromo, type Promocion } from '@/lib/ventas/promociones'
import { hoyLocalISO } from '@/lib/utils/fechas'

type Fila = Promocion & { activa: boolean; uso: { descuento: number; lineas: number } | null }
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const money = (n: number) => `$${n.toFixed(2)}`
const fechaCorta = (f: string) => f.split('-').reverse().join('/')

function estadoDe(p: Fila, hoy: string) {
  if (!p.activa) return { t: 'PAUSADA', c: 'bg-gray-200 text-gray-600 dark:bg-white/10 dark:text-gray-400' }
  if (p.hasta < hoy) return { t: 'VENCIDA', c: 'bg-gray-200 text-gray-600 dark:bg-white/10 dark:text-gray-400' }
  if (p.desde > hoy) return { t: 'PROGRAMADA', c: 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400' }
  return { t: 'VIGENTE', c: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' }
}

export function PromocionesClient({ promociones, productos, categorias }: {
  promociones: Fila[]; productos: { id: string; nombre: string }[]; categorias: { id: string; nombre: string }[]
}) {
  const router = useRouter()
  const hoy = hoyLocalISO()
  const [modal, setModal] = useState<{ id: string | null; v: PromocionValues & { alcance: 'PRODUCTO' | 'CATEGORIA' | 'TODO' } } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const nombreProd = useMemo(() => new Map(productos.map((p) => [p.id, p.nombre])), [productos])
  const nombreCat = useMemo(() => new Map(categorias.map((c) => [c.id, c.nombre])), [categorias])

  const nueva = () => setModal({ id: null, v: { nombre: '', tipo: 'NXM', productoId: '', categoriaId: '', lleva: 2, paga: 1, porcentaje: 10, desde: hoy, hasta: hoy, dias: [], alcance: 'PRODUCTO' } })
  const editar = (p: Fila) => setModal({ id: p.id, v: {
    nombre: p.nombre, tipo: p.tipo, productoId: p.productoId ?? '', categoriaId: p.categoriaId ?? '', lleva: p.lleva ?? 2, paga: p.paga ?? 1,
    porcentaje: p.porcentaje ?? 10, desde: p.desde, hasta: p.hasta, dias: p.dias ?? [], alcance: p.productoId ? 'PRODUCTO' : p.categoriaId ? 'CATEGORIA' : 'TODO',
  } })
  const ejecutar = async (fn: () => Promise<{ error?: string; success?: boolean }>, ok: string) => {
    const r = await fn()
    if (r.error) { toast.error(r.error); return false }
    toast.success(ok); router.refresh(); return true
  }
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!modal) return
    const { alcance, ...v } = modal.v
    setGuardando(true)
    try {
      const ok = await ejecutar(() => guardarPromocionAction(modal.id, {
        ...v, productoId: v.tipo === 'NXM' || alcance === 'PRODUCTO' ? v.productoId : '', categoriaId: v.tipo === 'PORCENTAJE' && alcance === 'CATEGORIA' ? v.categoriaId : '',
      }), modal.id ? 'Promoción actualizada' : 'Promoción creada')
      if (ok) setModal(null)
    } finally { setGuardando(false) }
  }
  const alcanceTxt = (p: Fila) => p.productoId ? nombreProd.get(p.productoId) ?? 'Producto' : p.categoriaId ? `Categoría ${nombreCat.get(p.categoriaId) ?? ''}` : 'Toda la tienda'
  const set = (cambios: Partial<NonNullable<typeof modal>['v']>) => modal && setModal({ ...modal, v: { ...modal.v, ...cambios } })
  const lbl = 'text-xs font-semibold text-gray-500 dark:text-gray-400'

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Promociones</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">2x1, 3x2 o descuentos por fecha. Se aplican solas en el POS y salen en la factura como descuento de la línea.</p>
        </div>
        <button onClick={nueva} className="btn-primary"><Plus size={16} /> Nueva promoción</button>
      </div>

      {promociones.length === 0 ? (
        <div className="card text-center py-16">
          <Tag size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Aún no hay promociones.</p>
          <p className="text-xs text-gray-400 mt-1">Ejemplos: "Coca Cola 2x1 este fin de semana", "10% en Lácteos los martes".</p>
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-white/5">
                <th className="px-4 py-3 font-semibold">Promoción</th><th className="px-4 py-3 font-semibold">Aplica a</th>
                <th className="px-4 py-3 font-semibold">Vigencia</th><th className="px-4 py-3 font-semibold text-right">Descontado (30 d)</th>
                <th className="px-4 py-3 font-semibold">Estado</th><th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {promociones.map((p) => {
                const e = estadoDe(p, hoy)
                return (
                  <tr key={p.id} className="border-b border-gray-50 dark:border-white/5 last:border-0">
                    <td className="px-4 py-3"><p className="font-semibold text-gray-900 dark:text-white">{p.nombre}</p><p className="text-xs text-brand-600 dark:text-brand-400 font-semibold">{describirPromo(p)}</p></td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{alcanceTxt(p)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{fechaCorta(p.desde)} – {fechaCorta(p.hasta)}{p.dias && <span className="block text-xs text-gray-400">Solo {p.dias.map((d) => DIAS[d]).join(', ')}</span>}</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{p.uso ? money(p.uso.descuento) : '—'}</td>
                    <td className="px-4 py-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${e.c}`}>{e.t}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => editar(p)} className="p-1.5 text-gray-400 hover:text-brand-600" aria-label={`Editar ${p.nombre}`}><Pencil size={15} /></button>
                        <button onClick={() => ejecutar(() => cambiarEstadoPromocionAction(p.id, !p.activa), p.activa ? 'Promoción pausada' : 'Promoción activada')} className="p-1.5 text-gray-400 hover:text-amber-600" aria-label={p.activa ? 'Pausar' : 'Activar'} title={p.activa ? 'Pausar' : 'Activar'}>{p.activa ? <Pause size={15} /> : <Play size={15} />}</button>
                        <button onClick={() => ejecutar(() => eliminarPromocionAction(p.id), 'Promoción eliminada')} className="p-1.5 text-gray-400 hover:text-red-500" aria-label={`Eliminar ${p.nombre}`}><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={() => setModal(null)}>
          <form onSubmit={guardar} className="w-full max-w-lg bg-white dark:bg-[#0f0f1e] rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/5">
              <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2"><Tag size={18} className="text-brand-600" /> {modal.id ? 'Editar promoción' : 'Nueva promoción'}</h2>
              <button type="button" onClick={() => setModal(null)} className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-white" aria-label="Cerrar"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de promoción">
                {([['NXM', 'Lleva N, paga M', '2x1, 3x2…'], ['PORCENTAJE', '% de descuento', 'En un producto, categoría o todo']] as const).map(([k, t, d]) => (
                  <button key={k} type="button" role="radio" aria-checked={modal.v.tipo === k} onClick={() => set({ tipo: k, alcance: k === 'NXM' ? 'PRODUCTO' : modal.v.alcance })}
                    className={`text-left rounded-xl border p-3 transition ${modal.v.tipo === k ? 'border-brand-600 ring-2 ring-brand-600/20 bg-brand-50/50 dark:bg-brand-500/10' : 'border-gray-200 dark:border-white/10 hover:border-brand-400'}`}>
                    <p className="font-semibold text-sm text-gray-900 dark:text-white">{t}</p><p className="text-xs text-gray-500">{d}</p>
                  </button>
                ))}
              </div>
              <div className="space-y-1.5">
                <label htmlFor="pm-nombre" className={lbl}>Nombre (sale en el ticket)</label>
                <input id="pm-nombre" value={modal.v.nombre} onChange={(e) => set({ nombre: e.target.value })} className="input" maxLength={80} required placeholder={modal.v.tipo === 'NXM' ? 'Coca Cola 2x1' : '10% en lácteos'} />
              </div>
              {modal.v.tipo === 'NXM' ? (
                <div className="grid grid-cols-[1fr_80px_80px] gap-2 items-end">
                  <div className="space-y-1.5">
                    <label htmlFor="pm-prod" className={lbl}>Producto</label>
                    <select id="pm-prod" value={modal.v.productoId} onChange={(e) => set({ productoId: e.target.value })} className="input" required>
                      <option value="">Elige…</option>{productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5"><label htmlFor="pm-lleva" className={lbl}>Lleva</label><input id="pm-lleva" type="number" min={2} max={20} value={modal.v.lleva} onChange={(e) => set({ lleva: Number(e.target.value) })} className="input" /></div>
                  <div className="space-y-1.5"><label htmlFor="pm-paga" className={lbl}>Paga</label><input id="pm-paga" type="number" min={1} max={19} value={modal.v.paga} onChange={(e) => set({ paga: Number(e.target.value) })} className="input" /></div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-[1fr_110px] gap-2 items-end">
                    <div className="space-y-1.5">
                      <label htmlFor="pm-alc" className={lbl}>Aplica a</label>
                      <select id="pm-alc" value={modal.v.alcance} onChange={(e) => set({ alcance: e.target.value as 'PRODUCTO' | 'CATEGORIA' | 'TODO' })} className="input">
                        <option value="PRODUCTO">Un producto</option><option value="CATEGORIA">Una categoría</option><option value="TODO">Toda la tienda</option>
                      </select>
                    </div>
                    <div className="space-y-1.5"><label htmlFor="pm-pct" className={lbl}>Descuento %</label><input id="pm-pct" type="number" min={1} max={90} step="any" value={modal.v.porcentaje} onChange={(e) => set({ porcentaje: Number(e.target.value) })} className="input" /></div>
                  </div>
                  {modal.v.alcance === 'PRODUCTO' && (
                    <select value={modal.v.productoId} onChange={(e) => set({ productoId: e.target.value })} className="input" aria-label="Producto" required>
                      <option value="">Elige el producto…</option>{productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  )}
                  {modal.v.alcance === 'CATEGORIA' && (
                    <select value={modal.v.categoriaId} onChange={(e) => set({ categoriaId: e.target.value })} className="input" aria-label="Categoría" required>
                      <option value="">Elige la categoría…</option>{categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><label htmlFor="pm-desde" className={lbl}>Desde</label><input id="pm-desde" type="date" value={modal.v.desde} onChange={(e) => set({ desde: e.target.value })} className="input" required /></div>
                <div className="space-y-1.5"><label htmlFor="pm-hasta" className={lbl}>Hasta</label><input id="pm-hasta" type="date" min={modal.v.desde} value={modal.v.hasta} onChange={(e) => set({ hasta: e.target.value })} className="input" required /></div>
              </div>
              <div className="space-y-1.5">
                <span className={lbl}>Solo estos días (opcional; sin marcar = todos)</span>
                <div className="flex flex-wrap gap-1.5">
                  {DIAS.map((d, i) => {
                    const on = modal.v.dias.includes(i)
                    return <button key={d} type="button" aria-pressed={on} onClick={() => set({ dias: on ? modal.v.dias.filter((x) => x !== i) : [...modal.v.dias, i] })}
                      className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${on ? 'border-brand-600 bg-brand-600 text-white' : 'border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300'}`}>{d}</button>
                  })}
                </div>
              </div>
              <p className="text-[11px] text-gray-400">Si a un producto le aplican varias promociones, se usa la que más descuenta. El 2x1 aplica a la unidad suelta (no a six-packs ni cajas).</p>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setModal(null)} className="btn-ghost">Cancelar</button>
                <button type="submit" disabled={guardando} className="btn-primary">{guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
