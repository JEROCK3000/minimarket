'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Trash2, Save, Boxes, Pencil, X } from 'lucide-react'
import { toast } from 'sonner'
import { obtenerPresentacionesAction, guardarPresentacionAction, eliminarPresentacionAction, guardarEscalasAction } from './presentaciones-actions'

interface Pres { id: string; nombre: string; factor: number; codigoBarras: string; precioVenta: number }
const money = (n: number) => `$${n.toFixed(2)}`

/** Presentaciones (six-pack, caja) y precio por mayor de un producto ya creado. */
export function PresentacionesEditor({ productoId, ivaPorcentaje, precioBase, unidad }: { productoId: string; ivaPorcentaje: number; precioBase: number; unidad: string }) {
  const [abierto, setAbierto] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [presentaciones, setPresentaciones] = useState<Pres[]>([])
  const [escalas, setEscalas] = useState<{ desde: string; precioVenta: string }[]>([])
  const [form, setForm] = useState<{ id?: string; nombre: string; factor: string; codigoBarras: string; precioVenta: string } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const conIva = (n: number) => n * (1 + ivaPorcentaje / 100)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const r = await obtenerPresentacionesAction(productoId)
      if ('error' in r) { toast.error(r.error); return }
      setPresentaciones(r.presentaciones)
      setEscalas(r.escalas.map((e) => ({ desde: String(e.desde), precioVenta: String(e.precioVenta) })))
    } finally { setCargando(false) }
  }, [productoId])
  useEffect(() => { if (abierto) cargar() }, [abierto, cargar])

  const guardarPres = async () => {
    if (!form) return
    setGuardando(true)
    try {
      const r = await guardarPresentacionAction(productoId, { id: form.id, nombre: form.nombre, factor: Number(form.factor), codigoBarras: form.codigoBarras, precioVenta: Number(form.precioVenta) })
      if ('error' in r) { toast.error(r.error); return }
      toast.success('Presentación guardada'); setForm(null); cargar()
    } finally { setGuardando(false) }
  }
  const eliminar = async (id: string) => {
    const r = await eliminarPresentacionAction(id)
    if ('error' in r) { toast.error(r.error); return }
    cargar()
  }
  const guardarEsc = async () => {
    setGuardando(true)
    try {
      const r = await guardarEscalasAction(productoId, escalas.filter((e) => e.desde && e.precioVenta).map((e) => ({ desde: Number(e.desde), precioVenta: Number(e.precioVenta) })))
      if ('error' in r) { toast.error(r.error); return }
      toast.success('Precios por mayor guardados'); cargar()
    } finally { setGuardando(false) }
  }

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="w-full flex items-center gap-2 rounded-xl border border-dashed border-gray-300 dark:border-white/15 p-3 text-sm text-gray-600 dark:text-gray-300 hover:border-brand-400">
        <Boxes size={16} className="text-brand-600" /> Presentaciones (six-pack, caja…) y precio por mayor
      </button>
    )
  }
  const lbl = 'text-[11px] font-semibold text-gray-500 dark:text-gray-400'
  return (
    // Enter aquí no debe enviar el formulario del producto que lo contiene
    <div className="rounded-xl border border-gray-200 dark:border-white/10 p-4 space-y-4" onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault() }}>
      <div className="flex items-center justify-between">
        <p className="font-semibold text-sm text-gray-900 dark:text-white flex items-center gap-2"><Boxes size={16} className="text-brand-600" /> Presentaciones y precio por mayor</p>
        <button type="button" onClick={() => setAbierto(false)} className="text-gray-400 hover:text-gray-700 dark:hover:text-white" aria-label="Cerrar sección"><X size={16} /></button>
      </div>
      {cargando ? <Loader2 className="animate-spin text-gray-400 mx-auto" /> : (
        <>
          <div className="space-y-2">
            <p className="text-xs text-gray-500">Cada presentación tiene su código de barras y su precio. Al venderla, el stock baja las unidades que contiene.</p>
            {presentaciones.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-sm rounded-lg bg-gray-50 dark:bg-white/5 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white truncate">{p.nombre} <span className="text-xs text-gray-500">({p.factor} {unidad})</span></p>
                  <p className="text-[11px] text-gray-500">{p.codigoBarras || 'sin código'} · {money(p.precioVenta)} + IVA = <strong>{money(conIva(p.precioVenta))}</strong> · {money(conIva(p.precioVenta) / p.factor)} c/u</p>
                </div>
                <button type="button" onClick={() => setForm({ id: p.id, nombre: p.nombre, factor: String(p.factor), codigoBarras: p.codigoBarras, precioVenta: String(p.precioVenta) })} className="p-1 text-gray-400 hover:text-brand-600" aria-label={`Editar ${p.nombre}`}><Pencil size={14} /></button>
                <button type="button" onClick={() => eliminar(p.id)} className="p-1 text-gray-400 hover:text-red-500" aria-label={`Eliminar ${p.nombre}`}><Trash2 size={14} /></button>
              </div>
            ))}
            {form ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end rounded-lg border border-brand-200 dark:border-brand-500/30 p-3">
                <div className="space-y-1 col-span-2 sm:col-span-1"><label className={lbl}>Nombre</label><input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="input h-9 text-sm" placeholder="Six-pack" maxLength={60} /></div>
                <div className="space-y-1"><label className={lbl}>Unidades que trae</label><input type="number" step="any" min="1" value={form.factor} onChange={(e) => setForm({ ...form, factor: e.target.value })} className="input h-9 text-sm" placeholder="6" /></div>
                <div className="space-y-1"><label className={lbl}>Precio sin IVA</label><input type="number" step="0.01" min="0" value={form.precioVenta} onChange={(e) => setForm({ ...form, precioVenta: e.target.value })} className="input h-9 text-sm" />
                  {Number(form.precioVenta) > 0 && <p className="text-[10px] text-gray-400">PVP {money(conIva(Number(form.precioVenta)))}</p>}</div>
                <div className="space-y-1 col-span-2 sm:col-span-1"><label className={lbl}>Código de barras</label><input value={form.codigoBarras} onChange={(e) => setForm({ ...form, codigoBarras: e.target.value })} className="input h-9 text-sm font-mono" placeholder="Opcional" /></div>
                <div className="col-span-2 sm:col-span-4 flex justify-end gap-2">
                  <button type="button" onClick={() => setForm(null)} className="btn-ghost text-xs">Cancelar</button>
                  <button type="button" onClick={guardarPres} disabled={guardando} className="btn-primary text-xs">{guardando ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar presentación</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setForm({ nombre: '', factor: '', codigoBarras: '', precioVenta: '' })} className="btn-ghost text-xs"><Plus size={14} /> Agregar presentación</button>
            )}
          </div>

          <div className="space-y-2 pt-3 border-t border-gray-100 dark:border-white/5">
            <p className="text-xs text-gray-500">Precio por mayor: desde cierta cantidad, cada unidad cuesta menos (precio normal {money(precioBase)} sin IVA).</p>
            {escalas.map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">Desde</span>
                <input type="number" step="any" min="1" value={e.desde} onChange={(ev) => setEscalas((xs) => xs.map((x, j) => (j === i ? { ...x, desde: ev.target.value } : x)))} className="input h-9 w-20 text-sm" aria-label="Desde cuántas unidades" />
                <span className="text-gray-500">{unidad}, a</span>
                <input type="number" step="0.01" min="0" value={e.precioVenta} onChange={(ev) => setEscalas((xs) => xs.map((x, j) => (j === i ? { ...x, precioVenta: ev.target.value } : x)))} className="input h-9 w-24 text-sm" aria-label="Precio unitario sin IVA" />
                <span className="text-[11px] text-gray-400">c/u sin IVA{Number(e.precioVenta) > 0 && ` (PVP ${money(conIva(Number(e.precioVenta)))})`}</span>
                <button type="button" onClick={() => setEscalas((xs) => xs.filter((_, j) => j !== i))} className="p-1 text-gray-400 hover:text-red-500 ml-auto" aria-label="Quitar escala"><Trash2 size={14} /></button>
              </div>
            ))}
            <div className="flex justify-between gap-2">
              {escalas.length < 5 ? <button type="button" onClick={() => setEscalas((xs) => [...xs, { desde: '', precioVenta: '' }])} className="btn-ghost text-xs"><Plus size={14} /> Agregar escala</button> : <span />}
              <button type="button" onClick={guardarEsc} disabled={guardando} className="btn-primary text-xs">{guardando ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar precios por mayor</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
