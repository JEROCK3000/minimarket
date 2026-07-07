'use client'

import { useState, useMemo } from 'react'
import { Plus, Search, Pencil, AlertTriangle, Package } from 'lucide-react'
import { ProductoForm } from './ProductoForm'

export interface ProductoRow {
  id: string
  nombre: string
  codigoBarras: string | null
  categoriaId: string | null
  categoriaNombre: string | null
  categoriaIcono: string | null
  precioCompra: number
  precioVenta: number
  ivaPorcentaje: number
  stock: number
  stockMinimo: number
  unidad: string
}
export interface CategoriaRow {
  id: string
  nombre: string
  icono: string | null
}

export function ProductosClient({
  productos,
  categorias,
  puedeEditar,
}: {
  productos: ProductoRow[]
  categorias: CategoriaRow[]
  puedeEditar: boolean
}) {
  const [busqueda, setBusqueda] = useState('')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [editando, setEditando] = useState<ProductoRow | null>(null)

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim()
    if (!q) return productos
    return productos.filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) ||
        p.codigoBarras?.toLowerCase().includes(q) ||
        p.categoriaNombre?.toLowerCase().includes(q)
    )
  }, [productos, busqueda])

  const bajoStock = productos.filter((p) => p.stock <= p.stockMinimo).length

  const abrirNuevo = () => { setEditando(null); setModalAbierto(true) }
  const abrirEditar = (p: ProductoRow) => { setEditando(p); setModalAbierto(true) }

  const money = (n: number) => `$${n.toFixed(2)}`

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Productos</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {productos.length} producto(s)
            {bajoStock > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                <AlertTriangle size={13} /> {bajoStock} con stock bajo
              </span>
            )}
          </p>
        </div>
        {puedeEditar && (
          <button onClick={abrirNuevo} className="btn-primary">
            <Plus size={16} /> Nuevo producto
          </button>
        )}
      </div>

      {/* Búsqueda */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, código o categoría..."
          className="input pl-9"
        />
      </div>

      {/* Tabla */}
      {filtrados.length === 0 ? (
        <div className="card text-center py-16">
          <Package size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {busqueda ? 'No se encontraron productos.' : 'Aún no hay productos. Crea el primero.'}
          </p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/5 text-left text-xs text-gray-500 dark:text-gray-400">
                  <th className="px-4 py-3 font-semibold">Producto</th>
                  <th className="px-4 py-3 font-semibold">Categoría</th>
                  <th className="px-4 py-3 font-semibold text-right">P. Venta</th>
                  <th className="px-4 py-3 font-semibold text-right">Stock</th>
                  {puedeEditar && <th className="px-4 py-3 font-semibold text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) => {
                  const bajo = p.stock <= p.stockMinimo
                  return (
                    <tr key={p.id} className="border-b border-gray-50 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900 dark:text-white">{p.nombre}</p>
                        {p.codigoBarras && <p className="text-xs text-gray-400 font-mono">{p.codigoBarras}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                        {p.categoriaNombre ? `${p.categoriaIcono ?? ''} ${p.categoriaNombre}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">{money(p.precioVenta)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={bajo ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-gray-700 dark:text-gray-300'}>
                          {p.stock % 1 === 0 ? p.stock : p.stock.toFixed(3)} {p.unidad}
                        </span>
                        {bajo && <AlertTriangle size={12} className="inline ml-1 text-amber-500" />}
                      </td>
                      {puedeEditar && (
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => abrirEditar(p)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 hover:text-brand-600 transition"
                            title="Editar"
                          >
                            <Pencil size={15} />
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalAbierto && (
        <ProductoForm
          producto={editando}
          categorias={categorias}
          onClose={() => setModalAbierto(false)}
        />
      )}
    </div>
  )
}
