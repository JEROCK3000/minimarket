'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Loader2, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import { guardarPlanAction, eliminarPlanAction } from '../actions'

interface Plan {
  id: string; codigo: string; nombre: string; descripcion: string; precioMensual: number; precioAnual: number
  maxUsuarios: number | null; maxProductos: number | null; maxFacturasMes: number | null; diasPrueba: number; orden: number; activo: boolean; tenants: number
}
const lim = (n: number | null) => (n === null ? '∞' : n)

export function PlanesClient({ planes }: { planes: Plan[] }) {
  const router = useRouter()
  const [editando, setEditando] = useState<Plan | 'nuevo' | null>(null)
  const eliminar = async (p: Plan) => {
    const r = await eliminarPlanAction(p.id)
    if ('error' in r) toast.error(r.error); else { toast.success('Plan eliminado'); router.refresh() }
  }
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Planes de suscripción</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Límites vacíos = ilimitado. Un plan inactivo no se ofrece a nuevos registros; los minimarkets que ya lo tienen lo conservan.</p>
        </div>
        <button onClick={() => setEditando('nuevo')} className="btn-primary shrink-0"><Plus size={16} /> Nuevo plan</button>
      </div>
      <div className="card p-0 overflow-hidden"><div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100 dark:border-white/5 text-left text-xs text-gray-500 dark:text-gray-400">
            <th className="px-4 py-3 font-semibold">Plan</th><th className="px-4 py-3 font-semibold text-right">Mensual</th><th className="px-4 py-3 font-semibold text-right">Anual</th>
            <th className="px-4 py-3 font-semibold text-center">Usuarios / Productos / Facturas mes</th><th className="px-4 py-3 font-semibold text-center">Prueba</th>
            <th className="px-4 py-3 font-semibold text-center">Minimarkets</th><th className="px-4 py-3"><span className="sr-only">Acciones</span></th>
          </tr></thead>
          <tbody>
            {planes.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">Aún no hay planes.</td></tr>}
            {planes.map((p) => (
              <tr key={p.id} className={`border-b border-gray-50 dark:border-white/5 ${p.activo ? '' : 'opacity-50'}`}>
                <td className="px-4 py-3"><p className="font-semibold text-gray-900 dark:text-white">{p.nombre}{p.activo ? '' : ' (inactivo)'}</p><p className="text-xs font-mono text-gray-400">{p.codigo}</p></td>
                <td className="px-4 py-3 text-right">${p.precioMensual.toFixed(2)}</td>
                <td className="px-4 py-3 text-right">${p.precioAnual.toFixed(2)}</td>
                <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-300">{lim(p.maxUsuarios)} / {lim(p.maxProductos)} / {lim(p.maxFacturasMes)}</td>
                <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-300">{p.diasPrueba ? `${p.diasPrueba} d` : '—'}</td>
                <td className="px-4 py-3 text-center">{p.tenants}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => setEditando(p)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500" aria-label={`Editar ${p.nombre}`}><Pencil size={15} /></button>
                  <button onClick={() => eliminar(p)} disabled={p.tenants > 0} title={p.tenants > 0 ? 'En uso: desactívalo en lugar de eliminarlo' : 'Eliminar'} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 hover:text-red-500 disabled:opacity-30" aria-label={`Eliminar ${p.nombre}`}><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
      {editando && <PlanForm plan={editando === 'nuevo' ? null : editando} onClose={() => setEditando(null)} onGuardado={() => { setEditando(null); router.refresh() }} />}
    </div>
  )
}

function PlanForm({ plan, onClose, onGuardado }: { plan: Plan | null; onClose: () => void; onGuardado: () => void }) {
  const txt = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n))
  const [f, setF] = useState({
    codigo: plan?.codigo ?? '', nombre: plan?.nombre ?? '', descripcion: plan?.descripcion ?? '',
    precioMensual: txt(plan?.precioMensual ?? 0), precioAnual: txt(plan?.precioAnual ?? 0),
    maxUsuarios: txt(plan?.maxUsuarios), maxProductos: txt(plan?.maxProductos), maxFacturasMes: txt(plan?.maxFacturasMes),
    diasPrueba: txt(plan?.diasPrueba ?? 0), orden: txt(plan?.orden ?? 0), activo: plan?.activo ?? true,
  })
  const [guardando, setGuardando] = useState(false)
  const set = (k: keyof typeof f, v: string | boolean) => setF((s) => ({ ...s, [k]: v }))
  const lbl = 'text-xs font-semibold text-gray-500 dark:text-gray-400'
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    try {
      const n = (v: string) => (v.trim() === '' ? '' : Number(v)) as number | ''
      const r = await guardarPlanAction(plan?.id ?? null, {
        ...f,
        precioMensual: Number(f.precioMensual || 0), precioAnual: Number(f.precioAnual || 0),
        maxUsuarios: n(f.maxUsuarios), maxProductos: n(f.maxProductos), maxFacturasMes: n(f.maxFacturasMes),
        diasPrueba: Number(f.diasPrueba || 0), orden: Number(f.orden || 0),
      })
      if ('error' in r) { toast.error(r.error); return }
      toast.success('Plan guardado'); onGuardado()
    } finally { setGuardando(false) }
  }
  const campo = (k: keyof typeof f, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="space-y-1.5">
      <label className={lbl} htmlFor={`pl-${k}`}>{label}</label>
      <input id={`pl-${k}`} value={f[k] as string} onChange={(e) => set(k, e.target.value)} className="input" {...extra} />
    </div>
  )
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={onClose}>
      <form onSubmit={guardar} className="w-full max-w-lg bg-white dark:bg-[#0f0f1e] rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/5">
          <h2 className="font-bold text-gray-900 dark:text-white">{plan ? 'Editar plan' : 'Nuevo plan'}</h2>
          <button type="button" onClick={onClose} className="p-1 text-gray-400" aria-label="Cerrar"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {campo('codigo', 'Código (no se puede cambiar)', { required: true, disabled: !!plan, placeholder: 'basico', className: 'input font-mono' })}
            {campo('nombre', 'Nombre', { required: true })}
          </div>
          <div className="space-y-1.5">
            <label className={lbl} htmlFor="pl-desc">Descripción</label>
            <textarea id="pl-desc" value={f.descripcion} onChange={(e) => set('descripcion', e.target.value)} className="input min-h-[60px]" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {campo('precioMensual', 'Precio mensual $', { type: 'number', step: '0.01', min: 0 })}
            {campo('precioAnual', 'Precio anual $', { type: 'number', step: '0.01', min: 0 })}
          </div>
          <div className="grid grid-cols-3 gap-4">
            {campo('maxUsuarios', 'Máx. usuarios', { type: 'number', min: 1, placeholder: '∞' })}
            {campo('maxProductos', 'Máx. productos', { type: 'number', min: 1, placeholder: '∞' })}
            {campo('maxFacturasMes', 'Máx. facturas/mes', { type: 'number', min: 1, placeholder: '∞' })}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {campo('diasPrueba', 'Días de prueba', { type: 'number', min: 0 })}
            {campo('orden', 'Orden', { type: 'number', min: 0 })}
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={f.activo} onChange={(e) => set('activo', e.target.checked)} /> Activo (se ofrece en el registro)
          </label>
        </div>
        <div className="flex justify-end gap-2 px-6 pb-6">
          <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
          <button type="submit" disabled={guardando} className="btn-primary">{guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar</button>
        </div>
      </form>
    </div>
  )
}
