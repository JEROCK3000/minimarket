'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Search, Loader2, CheckCircle2, AlertTriangle, Percent } from 'lucide-react'
import { toast } from 'sonner'
import { actualizarPreciosMasivoAction } from '../precios-actions'

interface Producto { id: string; nombre: string; categoriaId: string | null; costo: number; precioVenta: number; iva: number; proveedores: string[] }
type Regla = 'SUBIR' | 'BAJAR' | 'MARGEN'
const REGLAS: { k: Regla; t: string; ayuda: string }[] = [
  { k: 'SUBIR', t: 'Subir %', ayuda: 'Aumenta el precio de venta actual en el porcentaje indicado.' },
  { k: 'BAJAR', t: 'Bajar %', ayuda: 'Reduce el precio de venta actual en el porcentaje indicado.' },
  { k: 'MARGEN', t: 'Margen sobre costo %', ayuda: 'Precio = costo + el porcentaje indicado (ej. 30% sobre $1.00 = $1.30 + IVA).' },
]
const REDONDEOS = [0, 0.05, 0.1, 0.25] as const
const money = (n: number) => `$${n.toFixed(2)}`
const normal = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Precio final al público (con IVA) redondeado hacia arriba al múltiplo indicado. */
function redondear(pvp: number, paso: number) {
  if (!paso) return Math.round(pvp * 100) / 100
  return Math.round(Math.ceil(Math.round(pvp * 10000) / 10000 / paso - 1e-9) * paso * 100) / 100
}

export function PreciosClient({ productos, categorias, proveedores }: {
  productos: Producto[]; categorias: { id: string; nombre: string }[]; proveedores: { id: string; nombre: string }[]
}) {
  const router = useRouter()
  const [categoriaId, setCategoriaId] = useState('')
  const [proveedorId, setProveedorId] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [regla, setRegla] = useState<Regla>('SUBIR')
  const [porcentaje, setPorcentaje] = useState('')
  const [paso, setPaso] = useState<number>(0.05)
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set())
  const [aplicando, setAplicando] = useState(false)

  const pct = Number(porcentaje)
  const valido = porcentaje !== '' && pct >= 0 && pct <= 1000 && !(regla === 'BAJAR' && pct >= 100)

  const filas = useMemo(() => {
    const q = normal(busqueda.trim())
    return productos
      .filter((p) => (!categoriaId || p.categoriaId === categoriaId) && (!proveedorId || p.proveedores.includes(proveedorId)) && (!q || normal(p.nombre).includes(q)))
      .map((p) => {
        const factorIva = 1 + p.iva / 100
        const pvpActual = Math.round(p.precioVenta * factorIva * 100) / 100
        let baseNueva = p.precioVenta
        if (valido) {
          if (regla === 'SUBIR') baseNueva = p.precioVenta * (1 + pct / 100)
          else if (regla === 'BAJAR') baseNueva = p.precioVenta * (1 - pct / 100)
          else baseNueva = p.costo * (1 + pct / 100)
        }
        const pvpNuevo = valido ? redondear(baseNueva * factorIva, paso) : pvpActual
        const precioVentaNuevo = Math.round((pvpNuevo / factorIva) * 10000) / 10000
        const margen = precioVentaNuevo > 0 ? ((precioVentaNuevo - p.costo) / precioVentaNuevo) * 100 : 0
        return { p, pvpActual, pvpNuevo, precioVentaNuevo, margen, bajoCosto: precioVentaNuevo < p.costo, cambia: Math.abs(pvpNuevo - pvpActual) >= 0.005 }
      })
  }, [productos, categoriaId, proveedorId, busqueda, regla, pct, paso, valido])

  // Por defecto se excluyen los que quedarían bajo el costo; el usuario puede incluirlos.
  const incluido = (f: (typeof filas)[number]) => f.cambia && (excluidos.has(f.p.id) ? false : !f.bajoCosto || excluidos.has('+' + f.p.id))
  const alternar = (f: (typeof filas)[number]) => setExcluidos((s) => {
    const n = new Set(s)
    if (incluido(f)) { n.add(f.p.id); n.delete('+' + f.p.id) } else { n.delete(f.p.id); if (f.bajoCosto) n.add('+' + f.p.id) }
    return n
  })
  const seleccion = filas.filter(incluido)

  const aplicar = async () => {
    const reglaTxt = `${REGLAS.find((r) => r.k === regla)!.t.replace(' %', '')} ${pct}%${paso ? `, redondeo a $${paso.toFixed(2)}` : ''}`
    setAplicando(true)
    try {
      const r = await actualizarPreciosMasivoAction({ regla: reglaTxt, cambios: seleccion.map((f) => ({ productoId: f.p.id, precioVenta: f.precioVentaNuevo })) })
      if ('error' in r) { toast.error(r.error); return }
      toast.success(`Precios actualizados: ${r.actualizados} producto(s)`)
      setPorcentaje(''); setExcluidos(new Set()); router.refresh()
    } finally { setAplicando(false) }
  }

  const lbl = 'text-xs font-semibold text-gray-500 dark:text-gray-400'
  return (
    <div className="space-y-6">
      <div>
        <Link href="/productos" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-600"><ArrowLeft size={15} /> Productos</Link>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white mt-1">Cambio de precios</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Ajusta el precio de venta de muchos productos a la vez. Revisa la vista previa antes de aplicar.</p>
      </div>

      <div className="card space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="pr-cat" className={lbl}>Categoría</label>
            <select id="pr-cat" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="input">
              <option value="">Todas</option>{categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="pr-prov" className={lbl}>Proveedor (por compras)</label>
            <select id="pr-prov" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} className="input">
              <option value="">Todos</option>{proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="pr-q" className={lbl}>Buscar</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input id="pr-q" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="input pl-9" placeholder="Nombre del producto" />
            </div>
          </div>
        </div>
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="space-y-1.5">
            <span className={lbl}>Regla</span>
            <div className="inline-flex rounded-lg border border-gray-200 dark:border-white/10 overflow-hidden" role="group">
              {REGLAS.map((r) => (
                <button key={r.k} type="button" onClick={() => setRegla(r.k)} aria-pressed={regla === r.k}
                  className={`px-3 py-2 text-xs font-semibold ${regla === r.k ? 'bg-brand-600 text-white' : 'bg-white dark:bg-white/5 text-gray-600 dark:text-gray-300'}`}>{r.t}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="pr-pct" className={lbl}>Porcentaje</label>
            <div className="relative">
              <input id="pr-pct" type="number" step="any" min="0" value={porcentaje} onChange={(e) => setPorcentaje(e.target.value)} className="input w-32 pr-8" placeholder="Ej. 5" />
              <Percent size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="pr-red" className={lbl}>Redondear precio final (con IVA)</label>
            <select id="pr-red" value={paso} onChange={(e) => setPaso(Number(e.target.value))} className="input w-48">
              {REDONDEOS.map((r) => <option key={r} value={r}>{r ? `Hacia arriba a $${r.toFixed(2)}` : 'Sin redondeo (centavo)'}</option>)}
            </select>
          </div>
        </div>
        <p className="text-xs text-gray-500">{REGLAS.find((r) => r.k === regla)!.ayuda}</p>
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-white/5">
              <th className="px-4 py-3 w-8" /><th className="px-4 py-3 font-semibold">Producto</th>
              <th className="px-4 py-3 font-semibold text-right">Costo</th><th className="px-4 py-3 font-semibold text-right">PVP actual</th>
              <th className="px-4 py-3 font-semibold text-right">PVP nuevo</th><th className="px-4 py-3 font-semibold text-right">Margen</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr><td colSpan={6} className="py-12 text-center text-gray-500">Ningún producto coincide con los filtros.</td></tr>
            ) : filas.map((f) => (
              <tr key={f.p.id} className={`border-b border-gray-50 dark:border-white/5 last:border-0 ${!f.cambia ? 'opacity-60' : ''}`}>
                <td className="px-4 py-2">
                  <input type="checkbox" checked={incluido(f)} disabled={!f.cambia} onChange={() => alternar(f)} aria-label={`Incluir ${f.p.nombre}`} />
                </td>
                <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">{f.p.nombre}{f.p.iva > 0 && <span className="text-[10px] text-gray-400 ml-1">IVA {f.p.iva}%</span>}</td>
                <td className="px-4 py-2 text-right text-gray-500">{money(f.p.costo)}</td>
                <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-300">{money(f.pvpActual)}</td>
                <td className={`px-4 py-2 text-right font-semibold ${f.cambia ? 'text-brand-600 dark:text-brand-400' : 'text-gray-400'}`}>{money(f.pvpNuevo)}</td>
                <td className={`px-4 py-2 text-right text-xs font-semibold ${f.bajoCosto ? 'text-red-600 dark:text-red-400' : 'text-gray-500'}`}>
                  {f.bajoCosto && <AlertTriangle size={12} className="inline mr-1" />}{f.margen.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card flex flex-col sm:flex-row sm:items-center justify-between gap-3 sticky bottom-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {valido ? <><strong>{seleccion.length}</strong> producto(s) cambiarán de precio.{filas.some((f) => f.bajoCosto && f.cambia) && <span className="block text-xs text-red-600 dark:text-red-400">Los que quedarían bajo el costo no se incluyen salvo que los marques.</span>}</>
            : 'Elige una regla y un porcentaje para ver la vista previa.'}
        </p>
        <button onClick={aplicar} disabled={!valido || seleccion.length === 0 || aplicando} className="btn-primary">
          {aplicando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Aplicar a {seleccion.length} producto(s)
        </button>
      </div>
    </div>
  )
}
