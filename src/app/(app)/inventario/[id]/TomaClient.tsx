'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ScanBarcode, Loader2, Save, Trash2, CheckCircle2, Ban, FileSpreadsheet, FileText, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { registrarConteoAction, quitarConteoAction, aplicarTomaAction, cancelarTomaAction } from '../actions'
import { ESTADO_TOMA } from '../TomasClient'

interface Producto { id: string; nombre: string; codigoBarras: string; unidad: string; stock: number | null; costo: number | null }
interface Conteo { productoId: string; cantidad: number; stockAlContar: number | null; contadoPor: string }
interface Toma {
  id: string; numero: string; alcance: string; estado: string; notas: string | null
  aplicadaPor: string | null; aplicadaAt: string | null; faltante: number; sobrante: number
}
type Vista = 'contados' | 'diferencias' | 'pendientes'

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, ''))
const usd = (n: number) => `$${n.toFixed(2)}`
const normal = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function TomaClient({ toma, productos, conteos: iniciales, esAdmin }: { toma: Toma; productos: Producto[]; conteos: Conteo[]; esAdmin: boolean }) {
  const router = useRouter()
  const enCurso = toma.estado === 'EN_CURSO'
  const [conteos, setConteos] = useState(() => new Map(iniciales.map((c) => [c.productoId, c])))
  const [busqueda, setBusqueda] = useState('')
  const [sumarUno, setSumarUno] = useState(false)
  const [seleccionado, setSeleccionado] = useState<Producto | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [vista, setVista] = useState<Vista>('contados')
  const [confirmando, setConfirmando] = useState(false)
  const [noContadosEnCero, setNoContadosEnCero] = useState(false)
  const [procesando, setProcesando] = useState<'aplicar' | 'cancelar' | null>(null)
  const buscadorRef = useRef<HTMLInputElement>(null)
  const cantidadRef = useRef<HTMLInputElement>(null)

  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos])
  const porCodigo = useMemo(() => new Map(productos.filter((p) => p.codigoBarras).map((p) => [p.codigoBarras, p])), [productos])
  const sugerencias = useMemo(() => {
    const q = normal(busqueda.trim())
    if (q.length < 2) return []
    return productos.filter((p) => normal(p.nombre).includes(q) || p.codigoBarras.includes(q)).slice(0, 8)
  }, [busqueda, productos])

  const diferencia = (c: Conteo) => (c.stockAlContar === null ? null : c.cantidad - c.stockAlContar)
  const filas = [...conteos.values()].map((c) => ({ c, p: porId.get(c.productoId), d: diferencia(c) }))
  const conDiferencia = filas.filter((f) => f.d !== null && Math.abs(f.d) > 0.0005)
  const faltante = conDiferencia.reduce((s, f) => s + (f.d! < 0 ? -f.d! * (f.p?.costo ?? 0) : 0), 0)
  const sobrante = conDiferencia.reduce((s, f) => s + (f.d! > 0 ? f.d! * (f.p?.costo ?? 0) : 0), 0)
  const pendientes = enCurso ? productos.filter((p) => !conteos.has(p.id)) : []
  const pendientesConStock = pendientes.filter((p) => (p.stock ?? 0) > 0)

  const enfocarBuscador = () => setTimeout(() => buscadorRef.current?.focus(), 0)
  const elegir = (p: Producto) => {
    setBusqueda('')
    if (sumarUno) { guardar(p, 1, true); return }
    setSeleccionado(p)
    setCantidad(conteos.has(p.id) ? num(conteos.get(p.id)!.cantidad) : '')
    setTimeout(() => cantidadRef.current?.select(), 0)
  }
  const alBuscarEnter = () => {
    const q = busqueda.trim()
    if (!q) return
    const exacto = porCodigo.get(q)
    if (exacto) { elegir(exacto); return }
    if (sugerencias.length === 1) { elegir(sugerencias[0]); return }
    toast.error(sugerencias.length ? 'Hay varios productos: elige uno de la lista' : `No se encontró "${q}" en ${toma.alcance.toLowerCase()}`)
  }

  async function guardar(p: Producto, valor: number, sumar: boolean) {
    if (!(valor >= 0)) { toast.error('Cantidad inválida'); return }
    setGuardando(true)
    try {
      const r = await registrarConteoAction({ tomaId: toma.id, productoId: p.id, cantidad: valor, sumar })
      if ('error' in r) { toast.error(r.error); return }
      setConteos((m) => new Map(m).set(p.id, { productoId: p.id, cantidad: r.cantidad, stockAlContar: esAdmin ? r.stockSistema : null, contadoPor: 'Tú' }))
      if (sumar) toast.success(`${p.nombre}: ${num(r.cantidad)}`, { duration: 1200 })
      setSeleccionado(null); setCantidad('')
      enfocarBuscador()
    } finally { setGuardando(false) }
  }
  const quitar = async (productoId: string) => {
    const r = await quitarConteoAction(toma.id, productoId)
    if ('error' in r) { toast.error(r.error); return }
    setConteos((m) => { const n = new Map(m); n.delete(productoId); return n })
  }
  const aplicar = async () => {
    setProcesando('aplicar')
    try {
      const r = await aplicarTomaAction(toma.id, noContadosEnCero)
      if ('error' in r) { toast.error(r.error); return }
      toast.success(`Toma aplicada: ${r.ajustados} ajuste(s). Faltante ${usd(r.faltante)}, sobrante ${usd(r.sobrante)}`)
      setConfirmando(false); router.refresh()
    } finally { setProcesando(null) }
  }
  const cancelar = async () => {
    setProcesando('cancelar')
    try {
      const r = await cancelarTomaAction(toma.id)
      if ('error' in r) { toast.error(r.error); return }
      toast.success('Toma cancelada: el stock no cambió'); router.push('/inventario')
    } finally { setProcesando(null) }
  }

  const lista = vista === 'pendientes'
    ? pendientes.map((p) => ({ p, c: undefined as Conteo | undefined, d: null as number | null }))
    : (vista === 'diferencias' ? conDiferencia : filas).map((f) => ({ p: f.p, c: f.c as Conteo | undefined, d: f.d }))
  const tabs: { k: Vista; t: string; n: number; visible: boolean }[] = [
    { k: 'contados', t: 'Contados', n: filas.length, visible: true },
    { k: 'diferencias', t: 'Con diferencia', n: conDiferencia.length, visible: esAdmin },
    { k: 'pendientes', t: 'Sin contar', n: pendientes.length, visible: enCurso },
  ]
  const lbl = 'text-[11px] font-semibold uppercase tracking-wide text-gray-400'

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <Link href="/inventario" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-600"><ArrowLeft size={15} /> Tomas de inventario</Link>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">Toma {toma.numero}</h1>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ESTADO_TOMA[toma.estado]?.c}`}>{ESTADO_TOMA[toma.estado]?.t}</span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{toma.alcance}{toma.notas ? ` · ${toma.notas}` : ''}
            {toma.aplicadaAt && ` · ${toma.estado === 'APLICADA' ? 'aplicada' : 'cancelada'} el ${new Date(toma.aplicadaAt).toLocaleString('es-EC')} por ${toma.aplicadaPor}`}</p>
        </div>
        {esAdmin && (
          <div className="flex gap-2">
            <a href={`/api/reportes/toma?id=${toma.id}&formato=excel`} className="btn-ghost text-sm"><FileSpreadsheet size={15} /> Excel</a>
            <a href={`/api/reportes/toma?id=${toma.id}&formato=pdf`} className="btn-ghost text-sm"><FileText size={15} /> PDF</a>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card"><p className={lbl}>Contados</p><p className="text-2xl font-black text-gray-900 dark:text-white">{filas.length}{enCurso && <span className="text-sm font-medium text-gray-400"> / {productos.length}</span>}</p></div>
        {esAdmin && <>
          <div className="card"><p className={lbl}>Con diferencia</p><p className="text-2xl font-black text-gray-900 dark:text-white">{conDiferencia.length}</p></div>
          <div className="card"><p className={lbl}>Faltante {enCurso && '(estimado)'}</p><p className="text-2xl font-black text-red-600 dark:text-red-400">{usd(enCurso ? faltante : toma.faltante)}</p></div>
          <div className="card"><p className={lbl}>Sobrante {enCurso && '(estimado)'}</p><p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{usd(enCurso ? sobrante : toma.sobrante)}</p></div>
        </>}
      </div>

      {enCurso && (
        <div className="card space-y-3">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="relative flex-1">
              <ScanBarcode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden />
              <input ref={buscadorRef} autoFocus value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); alBuscarEnter() } }}
                className="input pl-9" placeholder="Escanea el código de barras o escribe el nombre" aria-label="Buscar producto" disabled={guardando && sumarUno} />
              {sugerencias.length > 0 && (
                <ul className="absolute z-20 mt-1 w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#0f0f1e] shadow-lg overflow-hidden">
                  {sugerencias.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => elegir(p)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-white/5 flex justify-between gap-2">
                        <span className="text-gray-900 dark:text-white truncate">{p.nombre}</span>
                        <span className="text-xs text-gray-400 shrink-0">{conteos.has(p.id) ? `contado: ${num(conteos.get(p.id)!.cantidad)}` : p.codigoBarras}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 shrink-0 cursor-pointer">
              <input type="checkbox" checked={sumarUno} onChange={(e) => { setSumarUno(e.target.checked); setSeleccionado(null); enfocarBuscador() }} />
              Sumar 1 por cada lectura
            </label>
          </div>
          {seleccionado && (
            <form onSubmit={(e) => { e.preventDefault(); guardar(seleccionado, Number(cantidad), false) }}
              className="flex flex-col sm:flex-row sm:items-end gap-3 rounded-xl bg-brand-50/50 dark:bg-brand-500/5 border border-brand-100 dark:border-brand-500/20 p-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 dark:text-white truncate">{seleccionado.nombre}</p>
                <p className="text-xs text-gray-500">{seleccionado.codigoBarras || 'Sin código'}{esAdmin && seleccionado.stock !== null && ` · sistema: ${num(seleccionado.stock)} ${seleccionado.unidad}`}</p>
              </div>
              <div className="space-y-1">
                <label htmlFor="t-cant" className="text-xs font-semibold text-gray-500 dark:text-gray-400">Cantidad contada ({seleccionado.unidad})</label>
                <input id="t-cant" ref={cantidadRef} type="number" step="any" min="0" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="input sm:w-40 text-lg" required />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setSeleccionado(null); enfocarBuscador() }} className="btn-ghost">Cancelar</button>
                <button type="submit" disabled={guardando || cantidad === ''} className="btn-primary">{guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar</button>
              </div>
            </form>
          )}
          <p className="text-[11px] text-gray-400">
            {sumarUno ? 'Cada lectura del código suma 1 unidad al conteo del producto.' : 'Escanea el producto, escribe cuántas unidades hay y presiona Enter. Si lo cuentas en dos lugares, escribe el total.'}
            {!esAdmin && ' El stock del sistema no se muestra para que el conteo sea objetivo.'}
          </p>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap gap-1">
          {tabs.filter((t) => t.visible).map((t) => (
            <button key={t.k} type="button" onClick={() => setVista(t.k)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${vista === t.k ? 'bg-brand-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5'}`}>
              {t.t} <span className="opacity-70">({t.n})</span>
            </button>
          ))}
        </div>
        <div className="card p-0 overflow-x-auto">
          {lista.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-500">{vista === 'pendientes' ? '¡Todo contado!' : vista === 'diferencias' ? 'Sin diferencias por ahora.' : 'Aún no has contado productos.'}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-white/5">
                  <th className="px-4 py-3 font-semibold">Producto</th>
                  {esAdmin && <th className="px-4 py-3 font-semibold text-right">Sistema</th>}
                  <th className="px-4 py-3 font-semibold text-right">Contado</th>
                  {esAdmin && <th className="px-4 py-3 font-semibold text-right">Diferencia</th>}
                  {esAdmin && <th className="px-4 py-3 font-semibold text-right">Valor</th>}
                  {enCurso && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {lista.map(({ p, c, d }, i) => (
                  <tr key={p?.id ?? i} className="border-b border-gray-50 dark:border-white/5 last:border-0">
                    <td className="px-4 py-2.5">
                      {enCurso && p ? <button type="button" onClick={() => elegir(p)} className="text-left font-medium text-gray-900 dark:text-white hover:text-brand-600">{p.nombre}</button>
                        : <span className="font-medium text-gray-900 dark:text-white">{p?.nombre ?? 'Producto'}</span>}
                      <p className="text-xs text-gray-400">{p?.codigoBarras}{c && ` · ${c.contadoPor}`}</p>
                    </td>
                    {esAdmin && <td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-300">{c?.stockAlContar != null ? num(c.stockAlContar) : p?.stock != null ? num(p.stock) : '—'}</td>}
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-900 dark:text-white">{c ? num(c.cantidad) : '—'}</td>
                    {esAdmin && <td className={`px-4 py-2.5 text-right font-semibold ${d == null || Math.abs(d) < 0.0005 ? 'text-gray-400' : d < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {d == null ? '—' : `${d > 0 ? '+' : ''}${num(d)}`}</td>}
                    {esAdmin && <td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-300">{d == null || !p?.costo ? '—' : usd(d * p.costo)}</td>}
                    {enCurso && <td className="px-2 py-2.5 text-right">{c && <button type="button" onClick={() => quitar(c.productoId)} className="p-1.5 text-gray-400 hover:text-red-500" aria-label={`Quitar conteo de ${p?.nombre}`}><Trash2 size={15} /></button>}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {enCurso && esAdmin && (
        <div className="card space-y-3">
          {!confirmando ? (
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
              <p className="text-sm text-gray-600 dark:text-gray-300">Cuando termines de contar, aplica la toma para corregir el stock del sistema.</p>
              <div className="flex gap-2">
                <button type="button" onClick={cancelar} disabled={!!procesando} className="btn-ghost text-red-600 dark:text-red-400">{procesando === 'cancelar' ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />} Cancelar toma</button>
                <button type="button" onClick={() => setConfirmando(true)} disabled={filas.length === 0 || !!procesando} className="btn-primary"><CheckCircle2 size={16} /> Aplicar toma</button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="font-semibold text-gray-900 dark:text-white">¿Aplicar la toma {toma.numero}?</p>
              <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-0.5">
                <li>• Se ajustarán <strong>{conDiferencia.length}</strong> producto(s) con diferencia (los demás contados ya coinciden).</li>
                <li>• Faltante estimado <strong className="text-red-600 dark:text-red-400">{usd(faltante)}</strong> (queda en el reporte de mermas) · sobrante <strong className="text-emerald-600 dark:text-emerald-400">{usd(sobrante)}</strong>.</li>
                <li>• Las ventas hechas mientras contabas se respetan: solo se ajusta la diferencia.</li>
              </ul>
              {pendientesConStock.length > 0 && (
                <label className="flex items-start gap-2 text-sm rounded-xl border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/5 p-3 text-amber-800 dark:text-amber-300 cursor-pointer">
                  <input type="checkbox" checked={noContadosEnCero} onChange={(e) => setNoContadosEnCero(e.target.checked)} className="mt-0.5" />
                  <span><AlertTriangle size={14} className="inline mr-1" />Poner en <strong>0</strong> los {pendientesConStock.length} producto(s) sin contar que tienen stock en el sistema. Márcalo solo si contaste todo lo que hay en el local; si no, se quedan como están.</span>
                </label>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setConfirmando(false)} disabled={!!procesando} className="btn-ghost">Volver</button>
                <button type="button" onClick={aplicar} disabled={!!procesando} className="btn-primary">{procesando === 'aplicar' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Sí, aplicar</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
