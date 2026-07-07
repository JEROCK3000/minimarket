'use client'

import { useState } from 'react'
import { Plus, Wallet, Trash2, Loader2, X, Save } from 'lucide-react'
import { toast } from 'sonner'
import { crearGastoAction, eliminarGastoAction } from './actions'

interface GastoRow { id: string; categoria: string; descripcion: string; monto: number; fecha: string }

const CATEGORIAS = ['Arriendo', 'Servicios básicos', 'Sueldos', 'Transporte', 'Mantenimiento', 'Impuestos', 'Otros']

export function GastosClient({ gastos, totalMes, puedeEditar }: { gastos: GastoRow[]; totalMes: number; puedeEditar: boolean }) {
  const [modal, setModal] = useState(false)
  const money = (n: number) => `$${n.toFixed(2)}`
  const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })

  const eliminar = async (id: string) => {
    const res = await eliminarGastoAction(id)
    if (res.success) toast.success('Gasto eliminado')
    else toast.error(res.error || 'No se pudo eliminar')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Gastos</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Total del mes: <span className="font-bold text-gray-900 dark:text-white">{money(totalMes)}</span>
          </p>
        </div>
        {puedeEditar && <button onClick={() => setModal(true)} className="btn-primary"><Plus size={16} /> Nuevo gasto</button>}
      </div>

      {gastos.length === 0 ? (
        <div className="card text-center py-16">
          <Wallet size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Aún no hay gastos registrados.</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/5 text-left text-xs text-gray-500 dark:text-gray-400">
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold">Categoría</th>
                  <th className="px-4 py-3 font-semibold">Descripción</th>
                  <th className="px-4 py-3 font-semibold text-right">Monto</th>
                  {puedeEditar && <th className="px-4 py-3"></th>}
                </tr>
              </thead>
              <tbody>
                {gastos.map((g) => (
                  <tr key={g.id} className="border-b border-gray-50 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5">
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{fecha(g.fecha)}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300">{g.categoria}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white">{g.descripcion}</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-white">{money(g.monto)}</td>
                    {puedeEditar && (
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => eliminar(g.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500 transition"><Trash2 size={15} /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && <GastoModal onClose={() => setModal(false)} />}
    </div>
  )
}

function GastoModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ categoria: 'Servicios básicos', descripcion: '', monto: '', fecha: new Date().toISOString().slice(0, 10) })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await crearGastoAction(form)
      if (res.success) { toast.success('Gasto registrado'); onClose() }
      else toast.error(res.error || 'No se pudo registrar')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md bg-white dark:bg-[#0f0f1e] rounded-2xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/5">
          <h2 className="font-bold text-gray-900 dark:text-white">Nuevo gasto</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-white"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Categoría</label>
              <select value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} className="input">
                {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Fecha</label>
              <input type="date" value={form.fecha} onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} className="input" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Descripción *</label>
            <input value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} className="input" required maxLength={300} placeholder="Ej: Pago de luz de junio" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Monto *</label>
            <input type="number" step="0.01" min="0" value={form.monto} onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))} className="input" required />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Registrar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
