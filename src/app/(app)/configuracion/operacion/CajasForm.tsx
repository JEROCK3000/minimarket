'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Pencil, Check, X, Monitor } from 'lucide-react'
import { toast } from 'sonner'
import { crearCajaAction, renombrarCajaAction, cambiarEstadoCajaAction } from './actions'

interface Caja { id: string; nombre: string; activa: boolean; abierta: string | null }

export function CajasForm({ cajas, controlCaja }: { cajas: Caja[]; controlCaja: boolean }) {
  const router = useRouter()
  const [nueva, setNueva] = useState('')
  const [editando, setEditando] = useState<{ id: string; nombre: string } | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const activas = cajas.filter((c) => c.activa)

  const ejecutar = async (clave: string, fn: () => Promise<{ error?: string; success?: boolean }>, ok: string) => {
    setOcupado(clave)
    try {
      const r = await fn()
      if (r.error) { toast.error(r.error); return }
      toast.success(ok); router.refresh()
    } finally { setOcupado(null) }
  }

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2"><Monitor size={17} /> Cajas</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {activas.length === 0
            ? 'Hoy trabajas con una sola caja para todos. Si cobran dos o más cajeros a la vez, crea sus cajas: cada uno abrirá la suya y se cuadrará por separado.'
            : `Modo varias cajas (${activas.length}): cada cajero abre su caja; ventas, gastos, cobros y retiros quedan en la caja de quien los registra.`}
        </p>
        {!controlCaja && <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">El control de caja está desactivado: actívalo para usar cajas.</p>}
      </div>
      {cajas.length > 0 && (
        <ul className="divide-y divide-gray-100 dark:divide-white/5">
          {cajas.map((c) => (
            <li key={c.id} className="flex items-center gap-2 py-2 text-sm">
              {editando?.id === c.id ? (
                <>
                  <input value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} className="input h-9 flex-1" maxLength={40} autoFocus aria-label="Nombre de la caja" />
                  <button type="button" onClick={() => ejecutar(c.id, () => renombrarCajaAction(c.id, editando.nombre), 'Caja renombrada').then(() => setEditando(null))} className="p-1.5 text-emerald-600" aria-label="Guardar nombre"><Check size={16} /></button>
                  <button type="button" onClick={() => setEditando(null)} className="p-1.5 text-gray-400" aria-label="Cancelar"><X size={16} /></button>
                </>
              ) : (
                <>
                  <span className={`flex-1 font-medium ${c.activa ? 'text-gray-900 dark:text-white' : 'text-gray-400 line-through'}`}>{c.nombre}</span>
                  {c.abierta && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">Abierta · {c.abierta}</span>}
                  <button type="button" onClick={() => setEditando({ id: c.id, nombre: c.nombre })} className="p-1.5 text-gray-400 hover:text-brand-600" aria-label={`Renombrar ${c.nombre}`}><Pencil size={14} /></button>
                  <button type="button" disabled={!!ocupado} onClick={() => ejecutar(c.id, () => cambiarEstadoCajaAction(c.id, !c.activa), c.activa ? 'Caja desactivada' : 'Caja activada')}
                    className="btn-ghost text-xs">{ocupado === c.id ? <Loader2 size={13} className="animate-spin" /> : null}{c.activa ? 'Desactivar' : 'Activar'}</button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(e) => { e.preventDefault(); if (nueva.trim()) ejecutar('nueva', () => crearCajaAction(nueva), 'Caja creada').then(() => setNueva('')) }} className="flex gap-2">
        <input value={nueva} onChange={(e) => setNueva(e.target.value)} className="input flex-1" maxLength={40} placeholder={activas.length === 0 ? 'Ej. Caja 1' : `Ej. Caja ${activas.length + 1}`} aria-label="Nombre de la nueva caja" />
        <button type="submit" disabled={!!ocupado || !nueva.trim()} className="btn-primary">{ocupado === 'nueva' ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Agregar caja</button>
      </form>
      {activas.length === 0 && <p className="text-[11px] text-gray-400">Crea al menos dos (ej. "Caja 1" y "Caja 2"). Debe estar cerrada la caja actual para cambiar de modo.</p>}
    </div>
  )
}
