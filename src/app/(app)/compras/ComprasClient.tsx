'use client'

import { useState } from 'react'
import { Plus, Truck, Package } from 'lucide-react'
import { CompraForm } from './CompraForm'

export interface CompraRow {
  id: string; numero: string; numFactura: string | null
  proveedor: string; items: number; total: number; fecha: string
}
export interface ProveedorOpt { id: string; nombre: string }
export interface ProductoOpt { id: string; nombre: string; precioCompra: number; stock: number; unidad: string }

export function ComprasClient({
  compras, proveedores, productos, puedeEditar,
}: {
  compras: CompraRow[]; proveedores: ProveedorOpt[]; productos: ProductoOpt[]; puedeEditar: boolean
}) {
  const [modal, setModal] = useState(false)
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
                </tr>
              </thead>
              <tbody>
                {compras.map((c) => (
                  <tr key={c.id} className="border-b border-gray-50 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5">
                    <td className="px-4 py-3 font-mono font-semibold text-gray-900 dark:text-white">{c.numero}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{fecha(c.fecha)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{c.proveedor}</td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">{c.numFactura || '—'}</td>
                    <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-300">{c.items}</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-white">{money(c.total)}</td>
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
    </div>
  )
}
