'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, ClipboardCheck, Loader2, X, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { crearTomaAction } from './actions'

interface TomaFila {
  id: string; numero: string; alcance: string; estado: string; creadaPor: string
  fecha: string; aplicadaAt: string | null; contados: number; faltante: number; sobrante: number
}
export const ESTADO_TOMA: Record<string, { t: string; c: string }> = {
  EN_CURSO: { t: 'EN CURSO', c: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' },
  APLICADA: { t: 'APLICADA', c: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' },
  CANCELADA: { t: 'CANCELADA', c: 'bg-gray-200 text-gray-600 dark:bg-white/10 dark:text-gray-400' },
}
const fecha = (iso: string) => new Date(iso).toLocaleString('es-EC', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export function TomasClient({ tomas, categorias, esAdmin }: { tomas: TomaFila[]; categorias: { id: string; nombre: string }[]; esAdmin: boolean }) {
  const router = useRouter()
  const [modal, setModal] = useState(false)
  const [categoriaId, setCategoriaId] = useState('')
  const [notas, setNotas] = useState('')
  const [creando, setCreando] = useState(false)
  const enCurso = tomas.find((t) => t.estado === 'EN_CURSO')

  const crear = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreando(true)
    try {
      const r = await crearTomaAction({ categoriaId, notas })
      if ('error' in r) { toast.error(r.error); return }
      router.push(`/inventario/${r.id}`)
    } finally { setCreando(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Toma de inventario</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Cuenta lo que hay en el local y ajusta el stock del sistema con la diferencia.</p>
        </div>
        {esAdmin && !enCurso && (
          <button onClick={() => setModal(true)} className="btn-primary"><Plus size={16} /> Nueva toma</button>
        )}
      </div>

      {enCurso && (
        <Link href={`/inventario/${enCurso.id}`} className="card flex items-center gap-3 border-amber-300 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/5 hover:border-amber-400 transition">
          <ClipboardCheck className="text-amber-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 dark:text-white">Toma {enCurso.numero} en curso · {enCurso.alcance}</p>
            <p className="text-xs text-gray-500">{enCurso.contados} producto(s) contados · iniciada {fecha(enCurso.fecha)} por {enCurso.creadaPor}</p>
          </div>
          <span className="btn-primary text-sm">Continuar contando <ArrowRight size={15} /></span>
        </Link>
      )}

      {tomas.length === 0 ? (
        <div className="card text-center py-16">
          <ClipboardCheck size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Aún no hay tomas de inventario.</p>
          {esAdmin && <p className="text-xs text-gray-400 mt-1">Empieza con una categoría pequeña para probar.</p>}
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-white/5">
                <th className="px-4 py-3 font-semibold">Toma</th><th className="px-4 py-3 font-semibold">Alcance</th>
                <th className="px-4 py-3 font-semibold text-right">Contados</th><th className="px-4 py-3 font-semibold text-right">Faltante</th>
                <th className="px-4 py-3 font-semibold text-right">Sobrante</th><th className="px-4 py-3 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {tomas.map((t) => (
                <tr key={t.id} className="border-b border-gray-50 dark:border-white/5 last:border-0 hover:bg-gray-50 dark:hover:bg-white/5">
                  <td className="px-4 py-3">
                    <Link href={`/inventario/${t.id}`} className="font-semibold text-gray-900 dark:text-white hover:text-brand-600">{t.numero}</Link>
                    <p className="text-xs text-gray-500">{fecha(t.fecha)} · {t.creadaPor}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{t.alcance}</td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{t.contados}</td>
                  <td className="px-4 py-3 text-right font-semibold text-red-600 dark:text-red-400">{t.estado === 'APLICADA' ? `$${t.faltante.toFixed(2)}` : '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">{t.estado === 'APLICADA' ? `$${t.sobrante.toFixed(2)}` : '—'}</td>
                  <td className="px-4 py-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ESTADO_TOMA[t.estado]?.c}`}>{ESTADO_TOMA[t.estado]?.t ?? t.estado}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={() => setModal(false)}>
          <form onSubmit={crear} className="w-full max-w-md bg-white dark:bg-[#0f0f1e] rounded-2xl shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/5">
              <h2 className="font-bold text-gray-900 dark:text-white">Nueva toma de inventario</h2>
              <button type="button" onClick={() => setModal(false)} className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-white" aria-label="Cerrar"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="t-cat" className="text-xs font-semibold text-gray-500 dark:text-gray-400">¿Qué vas a contar?</label>
                <select id="t-cat" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="input">
                  <option value="">Todos los productos</option>
                  {categorias.map((c) => <option key={c.id} value={c.id}>Categoría: {c.nombre}</option>)}
                </select>
                <p className="text-[11px] text-gray-400">Contar por categoría (un pasillo a la vez) es más fácil y no hace falta cerrar el local.</p>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="t-notas" className="text-xs font-semibold text-gray-500 dark:text-gray-400">Notas (opcional)</label>
                <input id="t-notas" value={notas} onChange={(e) => setNotas(e.target.value)} className="input" maxLength={300} placeholder="Ej. inventario de fin de mes" />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setModal(false)} className="btn-ghost">Cancelar</button>
                <button type="submit" disabled={creando} className="btn-primary">{creando ? <Loader2 size={16} className="animate-spin" /> : <ClipboardCheck size={16} />} Empezar a contar</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
