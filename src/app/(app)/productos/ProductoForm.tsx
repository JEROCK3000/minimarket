'use client'

import { useState } from 'react'
import { X, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { crearProductoAction, actualizarProductoAction } from './actions'
import type { ProductoRow, CategoriaRow } from './ProductosClient'

export function ProductoForm({
  producto,
  categorias,
  onClose,
}: {
  producto: ProductoRow | null
  categorias: CategoriaRow[]
  onClose: () => void
}) {
  const esEdicion = !!producto
  const [form, setForm] = useState({
    nombre: producto?.nombre ?? '',
    codigoBarras: producto?.codigoBarras ?? '',
    categoriaId: producto?.categoriaId ?? '',
    precioCompra: producto?.precioCompra?.toString() ?? '',
    precioVenta: producto?.precioVenta?.toString() ?? '',
    ivaPorcentaje: producto?.ivaPorcentaje?.toString() ?? '15',
    stock: producto?.stock?.toString() ?? '0',
    stockMinimo: producto?.stockMinimo?.toString() ?? '5',
    unidad: producto?.unidad ?? 'unidad',
  })
  const [loading, setLoading] = useState(false)

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  // Margen de ganancia estimado (ayuda visual)
  const margen =
    Number(form.precioCompra) > 0
      ? (((Number(form.precioVenta) - Number(form.precioCompra)) / Number(form.precioCompra)) * 100).toFixed(0)
      : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const payload = { ...form }
      const res = esEdicion
        ? await actualizarProductoAction(producto!.id, payload)
        : await crearProductoAction(payload)

      if (res.success) {
        toast.success(esEdicion ? 'Producto actualizado' : 'Producto creado')
        onClose()
      } else {
        toast.error(res.error || 'No se pudo guardar')
      }
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white dark:bg-[#0f0f1e] rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/5 sticky top-0 bg-white dark:bg-[#0f0f1e]">
          <h2 className="font-bold text-gray-900 dark:text-white">
            {esEdicion ? 'Editar producto' : 'Nuevo producto'}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-white">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Nombre *</label>
            <input value={form.nombre} onChange={(e) => set('nombre', e.target.value)} className="input" required maxLength={150} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Código de barras</label>
              <input value={form.codigoBarras} onChange={(e) => set('codigoBarras', e.target.value)} className="input font-mono" placeholder="Opcional" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Categoría</label>
              <select value={form.categoriaId} onChange={(e) => set('categoriaId', e.target.value)} className="input">
                <option value="">Sin categoría</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.icono ? `${c.icono} ` : ''}{c.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Precio compra *</label>
              <input type="number" step="0.01" min="0" value={form.precioCompra} onChange={(e) => set('precioCompra', e.target.value)} className="input" required />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                Precio venta * {margen && <span className="text-green-600 font-bold ml-1">+{margen}%</span>}
              </label>
              <input type="number" step="0.01" min="0" value={form.precioVenta} onChange={(e) => set('precioVenta', e.target.value)} className="input" required />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">IVA %</label>
              <select value={form.ivaPorcentaje} onChange={(e) => set('ivaPorcentaje', e.target.value)} className="input">
                <option value="15">15%</option>
                <option value="0">0% (exento)</option>
                <option value="5">5%</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Stock</label>
              <input type="number" step="0.001" min="0" value={form.stock} onChange={(e) => set('stock', e.target.value)} className="input" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Stock mínimo</label>
              <input type="number" step="0.001" min="0" value={form.stockMinimo} onChange={(e) => set('stockMinimo', e.target.value)} className="input" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Unidad de medida</label>
            <select value={form.unidad} onChange={(e) => set('unidad', e.target.value)} className="input">
              <option value="unidad">Unidad</option>
              <option value="kg">Kilogramo (kg)</option>
              <option value="lb">Libra (lb)</option>
              <option value="litro">Litro</option>
              <option value="paquete">Paquete</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {esEdicion ? 'Guardar cambios' : 'Crear producto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
