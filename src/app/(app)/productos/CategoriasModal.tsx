'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2, Plus, Save, Tags } from 'lucide-react'
import { toast } from 'sonner'
import { listarCategoriasAction, actualizarCategoriaAction, crearCategoriaAction, type CategoriaAdmin } from './actions'

/** Gestión de categorías (ADMIN): crear, renombrar, ícono y activar/desactivar. */
export function CategoriasModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [cats, setCats] = useState<CategoriaAdmin[] | null>(null)
  const [nueva, setNueva] = useState('')
  const [guardando, setGuardando] = useState<string | null>(null)

  const cargar = useCallback(() => { listarCategoriasAction().then(setCats).catch(() => toast.error('No se pudieron cargar las categorías')) }, [])
  useEffect(cargar, [cargar])

  const crear = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nueva.trim()) return
    setGuardando('nueva')
    try {
      const r = await crearCategoriaAction(nueva)
      if ('error' in r) { toast.error(r.error); return }
      setNueva(''); cargar(); router.refresh()
    } finally { setGuardando(null) }
  }

  const guardar = async (c: CategoriaAdmin) => {
    setGuardando(c.id)
    try {
      const r = await actualizarCategoriaAction(c.id, { nombre: c.nombre, icono: c.icono ?? '', activo: c.activo })
      if ('error' in r) { toast.error(r.error); return }
      toast.success('Categoría guardada'); cargar(); router.refresh()
    } finally { setGuardando(null) }
  }

  const editar = (id: string, cambios: Partial<CategoriaAdmin>) =>
    setCats((l) => l?.map((c) => (c.id === id ? { ...c, ...cambios } : c)) ?? null)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={onClose}>
      <div className="w-full max-w-xl bg-white dark:bg-[#0f0f1e] rounded-2xl shadow-xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/5">
          <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2"><Tags size={17} /> Categorías</h2>
          <button onClick={onClose} className="p-1 text-gray-400" aria-label="Cerrar"><X size={20} /></button>
        </div>
        <form onSubmit={crear} className="flex gap-2 px-6 pt-4">
          <input value={nueva} onChange={(e) => setNueva(e.target.value)} className="input" placeholder="Nueva categoría" maxLength={100} />
          <button type="submit" disabled={guardando === 'nueva' || !nueva.trim()} className="btn-primary shrink-0">
            {guardando === 'nueva' ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Agregar
          </button>
        </form>
        <div className="overflow-y-auto p-6 space-y-2">
          {!cats ? <div className="py-8 grid place-items-center"><Loader2 className="animate-spin text-gray-400" /></div>
            : cats.length === 0 ? <p className="text-sm text-gray-400 text-center py-6">Aún no hay categorías.</p>
            : cats.map((c) => (
              <div key={c.id} className={`flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 dark:border-white/5 p-2 ${c.activo ? '' : 'opacity-60'}`}>
                <input value={c.icono ?? ''} onChange={(e) => editar(c.id, { icono: e.target.value })} className="input w-14 text-center" maxLength={8} placeholder="🏷️" aria-label={`Ícono de ${c.nombre}`} />
                <input value={c.nombre} onChange={(e) => editar(c.id, { nombre: e.target.value })} className="input flex-1 min-w-[140px]" maxLength={100} aria-label="Nombre de la categoría" />
                <span className="text-xs text-gray-400 w-20 text-center">{c.productos} prod.</span>
                <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                  <input type="checkbox" checked={c.activo} onChange={(e) => editar(c.id, { activo: e.target.checked })} /> Activa
                </label>
                <button onClick={() => guardar(c)} disabled={guardando === c.id} className="btn-ghost h-9 px-2.5" aria-label={`Guardar ${c.nombre}`}>
                  {guardando === c.id ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                </button>
              </div>
            ))}
          <p className="text-[11px] text-gray-400 pt-2">Una categoría desactivada deja de aparecer al crear productos; los productos que ya la tienen la conservan.</p>
        </div>
      </div>
    </div>
  )
}
