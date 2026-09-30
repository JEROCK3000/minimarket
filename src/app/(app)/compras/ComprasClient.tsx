'use client'

import { useMemo, useState } from 'react'
import { Plus, Truck, Search, Eye } from 'lucide-react'
import { CompraForm } from './CompraForm'
import { CompraDetalle } from './CompraDetalle'

export interface CompraRow {
  id: string; numero: string; numFactura: string | null
  proveedor: string; items: number; total: number; fecha: string
  estado: string
}
export interface ProveedorOpt { id: string; nombre: string }
export interface ProductoOpt { id: string; nombre: string; precioCompra: number; stock: number; unidad: string }

export function ComprasClient({
  compras, proveedores, productos, puedeEditar,
}: {
  compras: CompraRow[]; proveedores: ProveedorOpt[]; productos: ProductoOpt[]; puedeEditar: boolean
}) {
  const [modal, setModal] = useState(false)
  const [detalleId, setDetalleId] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<'TODAS' | 'ACTIVA' | 'ANULADA'>('TODAS')
  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return compras.filter((c) =>
      (filtroEstado === 'TODAS' || c.estado === filtroEstado) &&
      (!q || c.numero.toLowerCase().includes(q) || c.proveedor.toLowerCase().includes(q) || (c.numFactura ?? '').toLowerCase().includes(q)),
    )
  }, [compras, busqueda, filtroEstado])
  const money = (n: number) => `$${n.toFixed(2)}`
  const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Compras</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{compras.length} compra(s) registrada(s)</p>
        </div>
        {puedeEditar && (
          <button onClick={() => setModal(true)} className="btn-primary" disabled={productos.length === 0}>
            <Plus size={16} /> Nueva compra
          </button>
        )}
      </div>

      {productos.length === 0 && (
        <div className="card border-amber-400/30 bg-amber-50/50 dark:bg-amber-400/5 text-sm text-amber-700 dark:text-amber-400">
          Primero crea productos en el módulo <strong>Productos</strong> para poder registrar compras.
        </div>
      )}

      {compras.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="input pl-9" placeholder="Buscar por número, proveedor o factura" />
          </div>
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as typeof filtroEstado)} className="input sm:w-44">
            <option value="TODAS">Todas</option>
            <option value="ACTIVA">Activas</option>
            <option value="ANULADA">Anuladas</option>
          </select>
        </div>
      )}

      {compras.length === 0 ? (
        <div className="card text-center py-16">
          <Truck size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Aún no hay compras registradas.</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/5 text-left text-xs text-gray-500 dark:text-gray-400">
                  <th className="px-4 py-3 font-semibold">Nº</th>
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold">Proveedor</th>
                  <th className="px-4 py-3 font-semibold">Factura</th>
                  <th className="px-4 py-3 font-semibold text-center">Items</th>
                  <th className="px-4 py-3 font-semibold text-right">Total</th>
                  <th className="px-4 py-3 font-semibold text-right"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {filtradas.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">Ninguna compra coincide con la búsqueda.</td></tr>
                )}
                {filtradas.map((c) => (
                  <tr key={c.id} onClick={() => setDetalleId(c.id)} className={`border-b border-gray-50 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer ${c.estado === 'ANULADA' ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 font-mono font-semibold text-gray-900 dark:text-white">
                      {c.numero}
                      {c.estado === 'ANULADA' && <span className="ml-2 text-[10px] font-bold text-red-600 dark:text-red-400">ANULADA</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{fecha(c.fecha)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{c.proveedor}</td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">{c.numFactura || '—'}</td>
                    <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-300">{c.items}</td>
                    <td className={`px-4 py-3 text-right font-bold text-gray-900 dark:text-white ${c.estado === 'ANULADA' ? 'line-through' : ''}`}>{money(c.total)}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={(e) => { e.stopPropagation(); setDetalleId(c.id) }} className="btn-ghost h-8 px-2.5 text-xs" aria-label={`Ver detalle de ${c.numero}`}>
                        <Eye size={14} /> Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && (
        <CompraForm proveedores={proveedores} productos={productos} onClose={() => setModal(false)} />
      )}
      {detalleId && (
        <CompraDetalle compraId={detalleId} puedeEditar={puedeEditar} onClose={() => setDetalleId(null)} />
      )}
    </div>
  )
}
