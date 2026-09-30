'use client'

import { useState, useMemo } from 'react'
import { Plus, Search, Pencil, AlertTriangle, Package, History, Tags, Tag, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { imprimirEtiquetas } from '@/lib/print/termica'
import { urlImagenProducto } from '@/lib/productos/url'
import { ProductoForm } from './ProductoForm'
import { KardexModal } from './KardexModal'
import { CategoriasModal } from './CategoriasModal'
import { ImportarModal } from './ImportarModal'

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
  imagen: string | null
  venceEnDias: number | null      // lote en stock más próximo a vencer (≤ 30 días); null = sin aviso
  fechaVencimiento: string | null
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
  const [kardexId, setKardexId] = useState<string | null>(null)
  const [verCategorias, setVerCategorias] = useState(false)
  const [verImportar, setVerImportar] = useState(false)
  const [soloStockBajo, setSoloStockBajo] = useState(false)
  const [soloPorVencer, setSoloPorVencer] = useState(false)
  const [imprimiendo, setImprimiendo] = useState<string | null>(null)

  const etiquetas = async (ids: string[], clave: string) => {
    if (ids.length > 100) { toast.error('Máximo 100 etiquetas por vez: filtra la lista'); return }
    setImprimiendo(clave)
    try {
      await imprimirEtiquetas(ids)
      toast.success(`${ids.length} etiqueta(s) enviada(s) a la impresora`)
    } catch (err: any) {
      toast.error(err.message || 'No se pudo imprimir')
    } finally { setImprimiendo(null) }
  }

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim()
    const base = productos.filter((p) => (!soloStockBajo || p.stock <= p.stockMinimo) && (!soloPorVencer || p.venceEnDias !== null))
    if (!q) return base
    return base.filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) ||
        p.codigoBarras?.toLowerCase().includes(q) ||
        p.categoriaNombre?.toLowerCase().includes(q)
    )
  }, [productos, busqueda, soloStockBajo, soloPorVencer])

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
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setVerCategorias(true)} className="btn-ghost">
              <Tags size={16} /> Categorías
            </button>
            <button onClick={() => setVerImportar(true)} className="btn-ghost" title="Importar productos desde Excel">
              <Upload size={16} /> Importar
            </button>
            <button onClick={() => etiquetas(filtrados.map((p) => p.id), 'lista')} disabled={!!imprimiendo || filtrados.length === 0} className="btn-ghost" title="Imprimir etiquetas de precio de los productos listados (térmica)">
              {imprimiendo === 'lista' ? <Loader2 size={16} className="animate-spin" /> : <Tag size={16} />} Etiquetas ({filtrados.length})
            </button>
            <button onClick={abrirNuevo} className="btn-primary">
              <Plus size={16} /> Nuevo producto
            </button>
          </div>
        )}
      </div>

      {/* Búsqueda */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
      <div className="relative max-w-md flex-1">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, código o categoría..."
          className="input pl-9"
        />
      </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 shrink-0">
          <input type="checkbox" checked={soloStockBajo} onChange={(e) => setSoloStockBajo(e.target.checked)} /> Solo stock bajo
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 shrink-0">
          <input type="checkbox" checked={soloPorVencer} onChange={(e) => setSoloPorVencer(e.target.checked)} /> Por vencer ({productos.filter((p) => p.venceEnDias !== null).length})
        </label>
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
                  <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) => {
                  const bajo = p.stock <= p.stockMinimo
                  return (
                    <tr key={p.id} className="border-b border-gray-50 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-white/5 overflow-hidden grid place-items-center shrink-0">
                            {p.imagen
                              ? <img src={urlImagenProducto(p.id, p.imagen)!} alt="" loading="lazy" className="w-full h-full object-cover" />
                              : <Package size={16} className="text-gray-300 dark:text-gray-600" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 dark:text-white">{p.nombre}</p>
                            {p.codigoBarras && <p className="text-xs text-gray-400 font-mono">{p.codigoBarras}</p>}
                          </div>
                        </div>
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
                        {p.venceEnDias !== null && (
                          <p className={`text-[10px] font-semibold ${p.venceEnDias < 0 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}
                            title={`Vencimiento del lote en stock: ${p.fechaVencimiento ? new Date(p.fechaVencimiento).toLocaleDateString('es-EC') : ''}`}>
                            {p.venceEnDias < 0 ? `Vencido hace ${-p.venceEnDias} d` : p.venceEnDias === 0 ? 'Vence hoy' : `Vence en ${p.venceEnDias} d`}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => setKardexId(p.id)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 hover:text-brand-600 transition"
                          title={puedeEditar ? 'Kardex y ajustes de stock' : 'Kardex (movimientos)'}
                          aria-label={`Kardex de ${p.nombre}`}
                        >
                          <History size={15} />
                        </button>
                        <button
                          onClick={() => etiquetas([p.id], p.id)}
                          disabled={!!imprimiendo}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 hover:text-brand-600 transition"
                          title="Imprimir etiqueta de precio"
                          aria-label={`Etiqueta de ${p.nombre}`}
                        >
                          {imprimiendo === p.id ? <Loader2 size={15} className="animate-spin" /> : <Tag size={15} />}
                        </button>
                        {puedeEditar && (
                          <button
                            onClick={() => abrirEditar(p)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 hover:text-brand-600 transition"
                            title="Editar"
                            aria-label={`Editar ${p.nombre}`}
                          >
                            <Pencil size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {verCategorias && <CategoriasModal onClose={() => setVerCategorias(false)} />}
      {verImportar && <ImportarModal onClose={() => setVerImportar(false)} />}

      {kardexId && (
        <KardexModal productoId={kardexId} puedeEditar={puedeEditar} onClose={() => setKardexId(null)} />
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
