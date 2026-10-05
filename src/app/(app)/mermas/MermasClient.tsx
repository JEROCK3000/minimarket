'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Search, PackageX, X, Loader2, Save, ScanBarcode, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { ajustarStockAction } from '../productos/inventario-actions'
import { CATEGORIAS_MERMA, CATEGORIAS_MERMA_MANUAL, type CategoriaMerma } from '@/lib/inventario/mermas'
import { inicioMesLocalISO } from '@/lib/utils/fechas'

interface Merma { id: string; fecha: string; producto: string; unidad: string; cantidad: number; valor: number; tipo: string; tipoTexto: string; detalle: string; usuario: string }
interface Producto { id: string; nombre: string; codigoBarras: string; stock: number; unidad: string; costo: number }

const money = (n: number) => `$${n.toFixed(2)}`
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, ''))
const fecha = (iso: string) => new Date(iso).toLocaleString('es-EC', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const normal = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function MermasClient({ mermas, productos }: { mermas: Merma[]; productos: Producto[] }) {
  const [busqueda, setBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [modal, setModal] = useState(false)

  const inicioMes = new Date(`${inicioMesLocalISO()}T00:00:00`)
  const delMes = mermas.filter((m) => new Date(m.fecha) >= inicioMes)
  const totalMes = delMes.reduce((s, m) => s + m.valor, 0)
  const porTipo = [...delMes.reduce((acc, m) => acc.set(m.tipoTexto, (acc.get(m.tipoTexto) ?? 0) + m.valor), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1])
  const lista = mermas.filter((m) => (!filtroTipo || m.tipo === filtroTipo) && (!busqueda || normal(m.producto + ' ' + m.detalle).includes(normal(busqueda))))

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Mermas</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Productos que salen del inventario sin venderse: vencidos, dañados, consumo propio o robo.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/reportes" className="btn-ghost text-sm"><FileText size={15} /> Reporte</Link>
          <button onClick={() => setModal(true)} className="btn-primary" disabled={productos.length === 0}><Plus size={16} /> Registrar merma</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Pérdida del mes (a costo)</p>
          <p className="text-2xl font-black text-red-600 dark:text-red-400">{money(totalMes)}</p>
          <p className="text-xs text-gray-500">{delMes.length} registro(s)</p>
        </div>
        <div className="card sm:col-span-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Por tipo este mes</p>
          {porTipo.length === 0 ? <p className="text-sm text-gray-400">Sin mermas este mes.</p> : (
            <div className="flex flex-wrap gap-2">
              {porTipo.map(([t, v]) => <span key={t} className="text-xs rounded-lg bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 px-2.5 py-1"><strong>{t}</strong> {money(v)}</span>)}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="input pl-9" placeholder="Buscar por producto o detalle" />
        </div>
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="input sm:w-52" aria-label="Filtrar por tipo">
          <option value="">Todos los tipos</option>
          {(Object.keys(CATEGORIAS_MERMA) as CategoriaMerma[]).map((c) => <option key={c} value={c}>{CATEGORIAS_MERMA[c]}</option>)}
        </select>
      </div>

      {lista.length === 0 ? (
        <div className="card text-center py-16">
          <PackageX size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">{mermas.length === 0 ? 'Aún no hay mermas registradas (últimos 90 días).' : 'Ninguna merma coincide con el filtro.'}</p>
          {mermas.length === 0 && <p className="text-xs text-gray-400 mt-1">Cuando botes un producto vencido o se rompa algo, regístralo aquí con «Registrar merma».</p>}
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-white/5">
                <th className="px-4 py-3 font-semibold">Fecha</th><th className="px-4 py-3 font-semibold">Producto</th>
                <th className="px-4 py-3 font-semibold">Tipo</th><th className="px-4 py-3 font-semibold text-right">Cantidad</th>
                <th className="px-4 py-3 font-semibold text-right">Valor</th><th className="px-4 py-3 font-semibold">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((m) => (
                <tr key={m.id} className="border-b border-gray-50 dark:border-white/5 last:border-0">
                  <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300 whitespace-nowrap">{fecha(m.fecha)}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-white">{m.producto}</td>
                  <td className="px-4 py-2.5"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400 whitespace-nowrap">{m.tipoTexto}</span></td>
                  <td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-300 whitespace-nowrap">{num(m.cantidad)} {m.unidad}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-red-600 dark:text-red-400">{money(m.valor)}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{m.detalle}<span className="block text-gray-400">{m.usuario}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && <RegistrarMerma productos={productos} onClose={() => setModal(false)} />}
    </div>
  )
}

function RegistrarMerma({ productos, onClose }: { productos: Producto[]; onClose: () => void }) {
  const router = useRouter()
  const [busqueda, setBusqueda] = useState('')
  const [producto, setProducto] = useState<Producto | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [tipo, setTipo] = useState<CategoriaMerma | ''>('')
  const [detalle, setDetalle] = useState('')
  const [guardando, setGuardando] = useState(false)
  const cantidadRef = useRef<HTMLInputElement>(null)

  const sugerencias = useMemo(() => {
    const q = normal(busqueda.trim())
    if (q.length < 2) return []
    return productos.filter((p) => normal(p.nombre).includes(q) || p.codigoBarras === busqueda.trim()).slice(0, 8)
  }, [busqueda, productos])
  const elegir = (p: Producto) => { setProducto(p); setBusqueda(''); setTimeout(() => cantidadRef.current?.focus(), 0) }
  const alEnter = () => {
    const exacto = productos.find((p) => p.codigoBarras && p.codigoBarras === busqueda.trim())
    if (exacto) elegir(exacto)
    else if (sugerencias.length === 1) elegir(sugerencias[0])
  }
  const valor = producto ? (Number(cantidad) || 0) * producto.costo : 0

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!producto) { toast.error('Elige el producto'); return }
    if (!tipo) { toast.error('Elige el tipo de merma'); return }
    setGuardando(true)
    try {
      const r = await ajustarStockAction({ productoId: producto.id, modo: 'MERMA', cantidad: Number(cantidad), categoria: tipo, motivo: detalle.trim() || CATEGORIAS_MERMA[tipo] })
      if ('error' in r) { toast.error(r.error); return }
      toast.success(`Merma registrada: ${num(Number(cantidad))} ${producto.unidad} de ${producto.nombre} (${money(valor)})`)
      router.refresh(); onClose()
    } finally { setGuardando(false) }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={onClose}>
      <form onSubmit={guardar} className="w-full max-w-lg bg-white dark:bg-[#0f0f1e] rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/5">
          <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2"><PackageX size={18} className="text-red-600" /> Registrar merma</h2>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-white" aria-label="Cerrar"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">1. Producto</span>
            {producto ? (
              <div className="flex items-center gap-2 rounded-xl border border-brand-200 dark:border-brand-500/30 bg-brand-50/50 dark:bg-brand-500/5 p-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white truncate">{producto.nombre}</p>
                  <p className="text-xs text-gray-500">Stock: {num(producto.stock)} {producto.unidad} · costo {money(producto.costo)}</p>
                </div>
                <button type="button" onClick={() => setProducto(null)} className="text-xs text-gray-500 hover:text-gray-900 dark:hover:text-white">Cambiar</button>
              </div>
            ) : (
              <div className="relative">
                <ScanBarcode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden />
                <input autoFocus value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); alEnter() } }}
                  className="input pl-9" placeholder="Escanea o escribe el nombre" aria-label="Buscar producto" />
                {sugerencias.length > 0 && (
                  <ul className="absolute z-20 mt-1 w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#0f0f1e] shadow-lg overflow-hidden">
                    {sugerencias.map((p) => (
                      <li key={p.id}><button type="button" onClick={() => elegir(p)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-white/5 flex justify-between gap-2">
                        <span className="text-gray-900 dark:text-white truncate">{p.nombre}</span><span className="text-xs text-gray-400 shrink-0">stock {num(p.stock)}</span>
                      </button></li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">2. ¿Qué pasó?</span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Tipo de merma">
              {CATEGORIAS_MERMA_MANUAL.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={tipo === c} onClick={() => setTipo(c)}
                  className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition ${tipo === c
                    ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400'
                    : 'border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5'}`}>
                  {CATEGORIAS_MERMA[c]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="mm-cant" className="text-xs font-semibold text-gray-500 dark:text-gray-400">3. Cantidad {producto && `(${producto.unidad})`}</label>
              <input id="mm-cant" ref={cantidadRef} type="number" step="any" min="0" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="input text-lg" required />
            </div>
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Pérdida a costo</span>
              <p className="text-2xl font-black text-red-600 dark:text-red-400 pt-1">{money(valor)}</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="mm-det" className="text-xs font-semibold text-gray-500 dark:text-gray-400">Detalle (opcional)</label>
            <input id="mm-det" value={detalle} onChange={(e) => setDetalle(e.target.value)} className="input" maxLength={150} placeholder="Ej. se cayó la caja / lote del 20 de septiembre" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost" disabled={guardando}>Cancelar</button>
            <button type="submit" className="btn-primary bg-red-600 hover:bg-red-700" disabled={guardando || !producto || !tipo || !(Number(cantidad) > 0)}>
              {guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Registrar merma
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
