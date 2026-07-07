'use client'

import { useState } from 'react'
import { X, Loader2, Save, Search } from 'lucide-react'
import { toast } from 'sonner'
import { crearClienteAction, actualizarClienteAction, consultarIdentificacionAction } from './actions'
import type { ClienteRow } from './ClientesClient'

export function ClienteForm({ cliente, onClose }: { cliente: ClienteRow | null; onClose: () => void }) {
  const esEdicion = !!cliente
  const [form, setForm] = useState({
    tipoIdentificacion: cliente?.tipoIdentificacion ?? 'CEDULA',
    identificacion: cliente?.identificacion ?? '',
    nombre: cliente?.nombre ?? '',
    telefono: cliente?.telefono ?? '',
    email: cliente?.email ?? '',
    direccion: cliente?.direccion ?? '',
  })
  const [loading, setLoading] = useState(false)
  const [consultando, setConsultando] = useState(false)
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const consultar = async () => {
    if (!form.identificacion.trim()) { toast.error('Ingresa una identificación'); return }
    setConsultando(true)
    try {
      const res = await consultarIdentificacionAction(form.identificacion)
      if (res.success) {
        setForm((f) => ({ ...f, nombre: res.nombre || f.nombre, direccion: res.direccion || f.direccion }))
        toast.success(res.origen === 'LOCAL' ? 'Cliente ya registrado' : 'Datos encontrados')
      } else {
        toast.error(res.error || 'No se encontraron datos')
      }
    } finally { setConsultando(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = esEdicion ? await actualizarClienteAction(cliente!.id, form) : await crearClienteAction(form)
      if (res.success) { toast.success(esEdicion ? 'Cliente actualizado' : 'Cliente creado'); onClose() }
      else toast.error(res.error || 'No se pudo guardar')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={onClose}>
      <div className="w-full max-w-lg bg-white dark:bg-[#0f0f1e] rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/5">
          <h2 className="font-bold text-gray-900 dark:text-white">{esEdicion ? 'Editar cliente' : 'Nuevo cliente'}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-white"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Tipo *</label>
              <select value={form.tipoIdentificacion} onChange={(e) => set('tipoIdentificacion', e.target.value)} className="input">
                <option value="CEDULA">Cédula</option>
                <option value="RUC">RUC</option>
                <option value="PASAPORTE">Pasaporte</option>
                <option value="CONSUMIDOR_FINAL">Consumidor Final</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Identificación *</label>
              <div className="flex gap-1.5">
                <input value={form.identificacion} onChange={(e) => set('identificacion', e.target.value)} className="input font-mono" required maxLength={15} />
                <button type="button" onClick={consultar} disabled={consultando} className="btn-ghost shrink-0 px-2.5" title="Consultar en EcuadorAPI">
                  {consultando ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Nombre / Razón social *</label>
            <input value={form.nombre} onChange={(e) => set('nombre', e.target.value)} className="input" required maxLength={200} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Teléfono</label>
              <input value={form.telefono} onChange={(e) => set('telefono', e.target.value)} className="input" maxLength={20} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Email</label>
              <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className="input" maxLength={150} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Dirección</label>
            <input value={form.direccion} onChange={(e) => set('direccion', e.target.value)} className="input" maxLength={300} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {esEdicion ? 'Guardar cambios' : 'Crear cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
