'use client'

import { useState } from 'react'
import { X, Loader2, Save, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { crearCompraAction, crearProveedorAction } from './actions'
import type { ProveedorOpt, ProductoOpt } from './ComprasClient'

interface Linea { productoId: string; cantidad: string; precioUnitario: string; fechaVencimiento: string }

export function CompraForm({
  proveedores, productos, onClose,
}: {
  proveedores: ProveedorOpt[]; productos: ProductoOpt[]; onClose: () => void
}) {
  const [provs, setProvs] = useState(proveedores)
  const [proveedorId, setProveedorId] = useState('')
  const [numFactura, setNumFactura] = useState('')
  const [condicionPago, setCondicionPago] = useState<'CONTADO' | 'CREDITO'>('CONTADO')
  const [diasPlazo, setDiasPlazo] = useState('30')
  const [lineas, setLineas] = useState<Linea[]>([{ productoId: '', cantidad: '1', precioUnitario: '', fechaVencimiento: '' }])
  const [loading, setLoading] = useState(false)
  const [nuevoProv, setNuevoProv] = useState('')

  const money = (n: number) => `$${n.toFixed(2)}`
  const total = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.precioUnitario) || 0), 0)

  const setLinea = (i: number, campo: keyof Linea, valor: string) => {
    setLineas((ls) => ls.map((l, idx) => {
      if (idx !== i) return l
      const nueva = { ...l, [campo]: valor }
      // Autocompletar precio de compra sugerido al elegir producto
      if (campo === 'productoId') {
        const prod = productos.find((p) => p.id === valor)
        if (prod && !nueva.precioUnitario) nueva.precioUnitario = prod.precioCompra.toString()
      }
      return nueva
    }))
  }
  const agregarLinea = () => setLineas((ls) => [...ls, { productoId: '', cantidad: '1', precioUnitario: '', fechaVencimiento: '' }])
  const quitarLinea = (i: number) => setLineas((ls) => ls.filter((_, idx) => idx !== i))

  const crearProveedorRapido = async () => {
    if (!nuevoProv.trim()) return
    const res = await crearProveedorAction({ nombre: nuevoProv })
    if (res.success && res.id) {
      setProvs((p) => [...p, { id: res.id!, nombre: res.nombre! }])
      setProveedorId(res.id)
      setNuevoProv('')
      toast.success('Proveedor agregado')
    } else {
      toast.error(res.error || 'No se pudo crear el proveedor')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const items = lineas
      .filter((l) => l.productoId && Number(l.cantidad) > 0)
      .map((l) => ({ productoId: l.productoId, cantidad: Number(l.cantidad), precioUnitario: Number(l.precioUnitario) || 0, fechaVencimiento: l.fechaVencimiento || undefined }))
    if (items.length === 0) { toast.error('Agrega al menos un producto'); return }

    setLoading(true)
    try {
      const res = await crearCompraAction({ proveedorId, numFactura, items, condicionPago, diasPlazo: Number(diasPlazo) || 30 })
      if (res.success) {
        toast.success(`Compra ${res.numero} registrada. Stock actualizado.`)
        onClose()
      } else {
        toast.error(res.error || 'No se pudo registrar la compra')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white dark:bg-[#0f0f1e] rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/5 sticky top-0 bg-white dark:bg-[#0f0f1e]">
          <h2 className="font-bold text-gray-900 dark:text-white">Nueva compra</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-white"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Proveedor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Proveedor</label>
              <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} className="input">
                <option value="">Sin proveedor</option>
                {provs.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Nº factura del proveedor</label>
              <input value={numFactura} onChange={(e) => setNumFactura(e.target.value)} className="input font-mono" placeholder="Opcional" />
            </div>
          </div>

          {/* Condición de pago al proveedor */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Pago al proveedor</label>
              <div className="inline-flex rounded-lg border border-gray-200 dark:border-white/10 overflow-hidden" role="group">
                {(['CONTADO', 'CREDITO'] as const).map((cp) => (
                  <button key={cp} type="button" onClick={() => setCondicionPago(cp)} aria-pressed={condicionPago === cp}
                    className={`px-3 py-1.5 text-xs font-semibold ${condicionPago === cp ? 'bg-brand-600 text-white' : 'bg-white dark:bg-white/5 text-gray-600 dark:text-gray-300'}`}>
                    {cp === 'CONTADO' ? 'Contado' : 'A crédito'}
                  </button>
                ))}
              </div>
            </div>
            {condicionPago === 'CREDITO' && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400" htmlFor="c-plazo">Plazo (días)</label>
                <input id="c-plazo" type="number" min={1} max={365} value={diasPlazo} onChange={(e) => setDiasPlazo(e.target.value)} className="input w-24" />
              </div>
            )}
            {condicionPago === 'CREDITO' && <p className="text-[11px] text-gray-400 pb-2">Quedará como cuenta por pagar en Proveedores.</p>}
          </div>

          {/* Crear proveedor rápido */}
          <div className="flex gap-2">
            <input value={nuevoProv} onChange={(e) => setNuevoProv(e.target.value)} className="input text-sm" placeholder="¿Proveedor nuevo? Escríbelo aquí" />
            <button type="button" onClick={crearProveedorRapido} className="btn-ghost shrink-0 text-xs">Agregar</button>
          </div>

          {/* Items */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Productos comprados</label>
            {lineas.map((l, i) => (
              <div key={i} className="flex flex-wrap sm:flex-nowrap gap-2 items-start">
                <select value={l.productoId} onChange={(e) => setLinea(i, 'productoId', e.target.value)} className="input flex-1 min-w-[160px]">
                  <option value="">Producto...</option>
                  {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
                <input type="number" step="0.001" min="0" value={l.cantidad} onChange={(e) => setLinea(i, 'cantidad', e.target.value)} className="input w-20" placeholder="Cant." title="Cantidad" />
                <input type="number" step="0.0001" min="0" value={l.precioUnitario} onChange={(e) => setLinea(i, 'precioUnitario', e.target.value)} className="input w-24" placeholder="P. compra" title="Precio unitario" />
                <input type="date" value={l.fechaVencimiento} onChange={(e) => setLinea(i, 'fechaVencimiento', e.target.value)} className="input w-36" title="Fecha de vencimiento (opcional)" aria-label="Fecha de vencimiento" />
                <button type="button" onClick={() => quitarLinea(i)} className="p-2 text-gray-400 hover:text-red-500 shrink-0" disabled={lineas.length === 1}><Trash2 size={16} /></button>
              </div>
            ))}
            <p className="text-[11px] text-gray-400">La fecha de vencimiento es opcional: si la indicas, el sistema te avisa cuando el producto esté por vencer.</p>
            <button type="button" onClick={agregarLinea} className="btn-ghost text-xs"><Plus size={14} /> Agregar producto</button>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-white/5">
            <span className="text-sm text-gray-500 dark:text-gray-400">Total (sin IVA)</span>
            <span className="text-xl font-black text-gray-900 dark:text-white">{money(total)}</span>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Registrar compra
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
