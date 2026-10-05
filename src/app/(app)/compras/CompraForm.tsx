'use client'

import { useState } from 'react'
import { X, Loader2, Save, Plus, Trash2, AlertTriangle, FileCheck2, Info } from 'lucide-react'
import { diasHasta, hoyLocalISO, DIAS_CONFIRMAR_VENCIMIENTO } from '@/lib/utils/fechas'
import { toast } from 'sonner'
import { crearCompraAction, crearProveedorAction } from './actions'
import type { ProveedorOpt, ProductoOpt } from './ComprasClient'
import { CargarFactura } from './CargarFactura'
import type { CompraDesdeXml, Coincidencia } from './xml-actions'

interface Linea {
  productoId: string; cantidad: string; precioUnitario: string; fechaVencimiento: string
  // Solo líneas cargadas desde el XML del proveedor
  xml?: { codigo: string; descripcion: string; cantidadXml: number; costoXml: number; ivaXml: number; codigoBarras: string; coincidencia: Coincidencia }
  factor?: string // unidades por empaque
  nuevo?: boolean // crear producto nuevo al registrar
  nombreNuevo?: string
  precioVenta?: string
}
const NUEVO = '__nuevo__'
const TARIFAS_SRI = [0, 5, 12, 13, 14, 15]
const r4 = (n: number) => String(Math.round(n * 10000) / 10000)
const ETIQUETA_COINCIDENCIA: Record<string, string> = { APRENDIDO: 'Reconocido (compras anteriores)', CODIGO_BARRAS: 'Reconocido por código de barras', NOMBRE: 'Reconocido por nombre' }

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
  // Vencimientos próximos que el usuario debe confirmar antes de guardar.
  const [porConfirmar, setPorConfirmar] = useState<{ nombre: string; fecha: string; dias: number }[] | null>(null)
  const [nuevoProv, setNuevoProv] = useState('')
  // Factura electrónica cargada (XML o clave de acceso)
  const [factura, setFactura] = useState<CompraDesdeXml | null>(null)
  const [provNuevo, setProvNuevo] = useState<{ ruc: string; nombre: string; direccion: string } | null>(null)

  const cargarFactura = (c: CompraDesdeXml) => {
    setFactura(c)
    setNumFactura(c.numFactura)
    if (c.proveedor.id) {
      if (!provs.some((p) => p.id === c.proveedor.id)) setProvs((ps) => [...ps, { id: c.proveedor.id!, nombre: c.proveedor.nombreRegistrado ?? c.proveedor.razonSocial }])
      setProveedorId(c.proveedor.id); setProvNuevo(null)
    } else {
      setProveedorId('')
      setProvNuevo({ ruc: c.proveedor.ruc, nombre: c.proveedor.nombreComercial || c.proveedor.razonSocial, direccion: c.proveedor.direccion })
    }
    setPorConfirmar(null)
    setLineas(c.lineas.map((l) => {
      const factor = l.factor || 1
      return {
        productoId: l.productoId ?? '', nuevo: !l.productoId, nombreNuevo: l.descripcion, precioVenta: '',
        cantidad: r4(l.cantidad * factor), precioUnitario: r4(l.costoUnitario / factor), fechaVencimiento: '', factor: String(factor),
        xml: { codigo: l.codigo, descripcion: l.descripcion, cantidadXml: l.cantidad, costoXml: l.costoUnitario, ivaXml: l.ivaPorcentaje, codigoBarras: l.codigoBarras, coincidencia: l.coincidencia },
      }
    }))
  }
  const quitarFactura = () => {
    setFactura(null); setProvNuevo(null); setNumFactura(''); setProveedorId('')
    setLineas([{ productoId: '', cantidad: '1', precioUnitario: '', fechaVencimiento: '' }])
  }
  const actualizarLinea = (i: number, cambios: Partial<Linea>) => {
    setPorConfirmar(null)
    setLineas((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...cambios } : l)))
  }
  // Unidades por empaque: la cantidad y el costo se recalculan desde el XML.
  const cambiarFactor = (i: number, valor: string) => {
    const l = lineas[i]
    const f = Number(valor)
    if (!l.xml || !(f > 0)) { actualizarLinea(i, { factor: valor }); return }
    actualizarLinea(i, { factor: valor, cantidad: r4(l.xml.cantidadXml * f), precioUnitario: r4(l.xml.costoXml / f) })
  }

  const money = (n: number) => `$${n.toFixed(2)}`
  const total = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.precioUnitario) || 0), 0)

  const setLineaBase = (i: number, campo: keyof Linea, valor: string) => {
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
  }  // Cualquier cambio en las líneas obliga a volver a confirmar las fechas.
  const setLinea = (i: number, campo: keyof Linea, valor: string) => { setPorConfirmar(null); setLineaBase(i, campo, valor) }

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

  const nombreProducto = (id: string) => productos.find((p) => p.id === id)?.nombre ?? 'Producto'
  const nombreLinea = (l: Linea) => (l.nuevo ? l.nombreNuevo || 'Producto nuevo' : nombreProducto(l.productoId))
  const lineaLista = (l: Linea) => (!!l.productoId || !!l.nuevo) && Number(l.cantidad) > 0
  const fechaCorta = (f: string) => f.split('-').reverse().join('/')
  const textoDias = (d: number) => (d === 0 ? 'vence HOY' : d === 1 ? 'vence mañana' : `vence en ${d} días`)

  const handleSubmit = async (e: React.FormEvent, confirmado = false) => {
    e.preventDefault()
    if (factura?.duplicada) { toast.error(`Esta factura ya está registrada en la compra ${factura.duplicada}`); return }
    const sinPrecio = lineas.filter((l) => l.nuevo && Number(l.cantidad) > 0 && !(Number(l.precioVenta) > 0))
    if (sinPrecio.length) { toast.error(`Indica el precio de venta de los productos nuevos (${sinPrecio.length})`); return }
    if (lineas.some((l) => l.nuevo && !l.nombreNuevo?.trim())) { toast.error('Escribe el nombre de los productos nuevos'); return }
    const conFecha = lineas.filter((l) => lineaLista(l) && l.fechaVencimiento)
    if (conFecha.some((l) => diasHasta(l.fechaVencimiento) < 0)) {
      toast.error('Hay una fecha de vencimiento anterior a hoy: revisa las fechas'); return
    }
    const proximas = conFecha
      .map((l) => ({ nombre: nombreLinea(l), fecha: l.fechaVencimiento, dias: diasHasta(l.fechaVencimiento) }))
      .filter((x) => x.dias <= DIAS_CONFIRMAR_VENCIMIENTO)
    if (proximas.length > 0 && !confirmado) { setPorConfirmar(proximas); return }
    setPorConfirmar(null)
    const items = lineas
      .filter(lineaLista)
      .map((l) => ({
        productoId: l.nuevo ? undefined : l.productoId,
        nuevo: l.nuevo ? {
          nombre: l.nombreNuevo!.trim(), codigoBarras: l.xml?.codigoBarras || undefined, precioVenta: Number(l.precioVenta),
          ivaPorcentaje: TARIFAS_SRI.includes(l.xml?.ivaXml ?? 15) ? (l.xml?.ivaXml ?? 15) : 15,
        } : undefined,
        cantidad: Number(l.cantidad), precioUnitario: Number(l.precioUnitario) || 0, fechaVencimiento: l.fechaVencimiento || undefined,
        codigoProveedor: l.xml?.codigo, factor: l.xml ? Number(l.factor) || 1 : undefined,
      }))
    if (items.length === 0) { toast.error('Agrega al menos un producto'); return }

    setLoading(true)
    try {
      const res = await crearCompraAction({
        proveedorId, numFactura, items, condicionPago, diasPlazo: Number(diasPlazo) || 30,
        claveAcceso: factura?.claveAcceso || undefined,
        proveedorNuevo: !proveedorId && provNuevo ? provNuevo : undefined,
      })
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
      <div className={`w-full ${factura ? 'max-w-5xl' : 'max-w-2xl'} bg-white dark:bg-[#0f0f1e] rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/5 sticky top-0 bg-white dark:bg-[#0f0f1e] z-10">
          <h2 className="font-bold text-gray-900 dark:text-white">Nueva compra</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-white"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {!factura ? <CargarFactura onCargada={cargarFactura} /> : (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/5 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <FileCheck2 size={16} className="text-emerald-600" />
                <span className="font-semibold text-gray-900 dark:text-white">Factura {factura.numFactura}</span>
                <span className="text-gray-500">· {factura.proveedor.razonSocial} · {factura.fechaEmision.split('-').reverse().join('/')} · total ${factura.totales.total.toFixed(2)}</span>
                <button type="button" onClick={quitarFactura} className="ml-auto text-xs text-gray-500 hover:text-red-600">Quitar factura</button>
              </div>
              {factura.duplicada && (
                <p className="text-sm font-semibold text-red-600 dark:text-red-400">Esta factura ya está registrada en la compra {factura.duplicada}: no se puede ingresar dos veces.</p>
              )}
              {factura.avisos.map((a, i) => <p key={i} className="text-xs text-amber-700 dark:text-amber-400 flex gap-1.5"><AlertTriangle size={13} className="shrink-0 mt-0.5" />{a}</p>)}
              <p className="text-xs text-gray-600 dark:text-gray-300 flex gap-1.5"><Info size={13} className="shrink-0 mt-0.5" />
                Revisa cada línea. Si el proveedor factura por caja (p. ej. 1 caja de 24), pon <strong>24</strong> en «Unid. x empaque»: la cantidad y el costo se ajustan solos y la próxima vez se recuerda.</p>
            </div>
          )}

          {/* Proveedor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Proveedor</label>
              {provNuevo && !proveedorId ? (
                <div className="input h-auto py-2 text-sm flex items-center gap-2">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400">NUEVO</span>
                  <span className="truncate text-gray-900 dark:text-white" title={`${provNuevo.nombre} · ${provNuevo.ruc}`}>{provNuevo.nombre}</span>
                  <button type="button" onClick={() => setProvNuevo(null)} className="ml-auto text-xs text-gray-400 hover:text-gray-700 dark:hover:text-white shrink-0">Cambiar</button>
                </div>
              ) : (
                <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} className="input">
                  <option value="">Sin proveedor</option>
                  {provs.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              )}
              {provNuevo && !proveedorId && <p className="text-[11px] text-gray-400">RUC {provNuevo.ruc}: se registrará como proveedor al guardar la compra.</p>}
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
              <div key={i} className={l.xml ? 'rounded-xl border border-gray-100 dark:border-white/5 p-3 space-y-2' : ''}>
              {l.xml && (
                <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
                  <span className="font-semibold text-gray-900 dark:text-white">{l.xml.descripcion}</span>
                  <span className="font-mono text-gray-400">{l.xml.codigo}</span>
                  <span className="text-gray-500">· factura: {l.xml.cantidadXml} × ${l.xml.costoXml.toFixed(4)} · IVA {l.xml.ivaXml}%</span>
                  {l.xml.coincidencia && !l.nuevo && <span className="text-emerald-600 dark:text-emerald-400">✓ {ETIQUETA_COINCIDENCIA[l.xml.coincidencia]}</span>}
                </div>
              )}
              <div className="flex flex-wrap sm:flex-nowrap gap-2 items-start">
                <select value={l.nuevo ? NUEVO : l.productoId}
                  onChange={(e) => (e.target.value === NUEVO ? actualizarLinea(i, { nuevo: true, productoId: '' }) : l.xml ? actualizarLinea(i, { nuevo: false, productoId: e.target.value }) : setLinea(i, 'productoId', e.target.value))}
                  className={`input flex-1 min-w-[160px] ${l.xml && !l.productoId && !l.nuevo ? 'border-amber-400' : ''}`} aria-label="Producto">
                  <option value="">Producto...</option>
                  {l.xml && <option value={NUEVO}>🆕 Crear producto nuevo</option>}
                  {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
                {l.xml && (
                  <input type="number" step="any" min="0" value={l.factor} onChange={(e) => cambiarFactor(i, e.target.value)} className="input w-20"
                    title="Unidades por empaque (1 caja de 24 → 24)" aria-label="Unidades por empaque" placeholder="x emp." />
                )}
                <input type="number" step="any" min="0" value={l.cantidad} onChange={(e) => setLinea(i, 'cantidad', e.target.value)} className="input w-20" placeholder="Cant." title="Cantidad" />
                <input type="number" step="0.0001" min="0" value={l.precioUnitario} onChange={(e) => setLinea(i, 'precioUnitario', e.target.value)} className="input w-24" placeholder="P. compra" title="Precio unitario" />
                <div className="w-36">
                  <input type="date" min={hoyLocalISO()} value={l.fechaVencimiento} onChange={(e) => setLinea(i, 'fechaVencimiento', e.target.value)}
                    className={`input w-full ${l.fechaVencimiento && diasHasta(l.fechaVencimiento) <= DIAS_CONFIRMAR_VENCIMIENTO ? 'border-amber-400 dark:border-amber-500/60' : ''}`}
                    title="Fecha de vencimiento (opcional)" aria-label="Fecha de vencimiento" />
                  {l.fechaVencimiento && diasHasta(l.fechaVencimiento) <= DIAS_CONFIRMAR_VENCIMIENTO && (
                    <p className={`text-[11px] mt-0.5 ${diasHasta(l.fechaVencimiento) < 0 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {diasHasta(l.fechaVencimiento) < 0 ? 'Ya venció' : textoDias(diasHasta(l.fechaVencimiento))}
                    </p>
                  )}
                </div>
                <button type="button" onClick={() => quitarLinea(i)} className="p-2 text-gray-400 hover:text-red-500 shrink-0" disabled={lineas.length === 1} aria-label="Quitar línea"><Trash2 size={16} /></button>
              </div>
              {l.nuevo && (
                <div className="flex flex-wrap gap-2 items-center pl-0 sm:pl-2">
                  <input value={l.nombreNuevo ?? ''} onChange={(e) => actualizarLinea(i, { nombreNuevo: e.target.value })} className="input flex-1 min-w-[180px] text-sm" maxLength={150} aria-label="Nombre del producto nuevo" placeholder="Nombre del producto" />
                  <input type="number" step="0.01" min="0" value={l.precioVenta ?? ''} onChange={(e) => actualizarLinea(i, { precioVenta: e.target.value })}
                    className={`input w-32 text-sm ${!(Number(l.precioVenta) > 0) ? 'border-amber-400' : ''}`} aria-label="Precio de venta sin IVA" placeholder="P. venta s/IVA" />
                  <span className="text-[11px] text-gray-400">{l.xml?.codigoBarras ? `Código ${l.xml.codigoBarras} · ` : ''}IVA {TARIFAS_SRI.includes(l.xml?.ivaXml ?? 15) ? l.xml?.ivaXml : 15}%</span>
                </div>
              )}
              </div>
            ))}
            <p className="text-[11px] text-gray-400">La fecha de vencimiento es opcional: si la indicas, el sistema te avisa cuando el producto esté por vencer.</p>
            <button type="button" onClick={agregarLinea} className="btn-ghost text-xs"><Plus size={14} /> Agregar producto</button>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-white/5">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Total (sin IVA){factura && <span className="block text-[11px]">Factura: subtotal ${factura.totales.subtotal.toFixed(2)}{factura.totales.descuento > 0 ? ` (desc. $${factura.totales.descuento.toFixed(2)})` : ''} · IVA ${factura.totales.iva.toFixed(2)} · total ${factura.totales.total.toFixed(2)}</span>}
            </span>
            <span className="text-xl font-black text-gray-900 dark:text-white">{money(total)}</span>
          </div>

          {porConfirmar && (
            <div role="alertdialog" aria-labelledby="conf-venc" className="rounded-xl border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/5 p-4 space-y-3">
              <p id="conf-venc" className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300 text-sm">
                <AlertTriangle size={16} /> ¿Las fechas de vencimiento son correctas?
              </p>
              <ul className="text-sm text-amber-900 dark:text-amber-200 space-y-0.5">
                {porConfirmar.map((x, i) => <li key={i}>• {x.nombre}: {fechaCorta(x.fecha)} — <strong>{textoDias(x.dias)}</strong></li>)}
              </ul>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => setPorConfirmar(null)} className="btn-ghost text-sm">Revisar fechas</button>
                <button type="button" disabled={loading} onClick={(e) => handleSubmit(e as unknown as React.FormEvent, true)} className="btn-primary bg-amber-600 hover:bg-amber-700 text-sm">
                  {loading ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Sí, son correctas
                </button>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
            <button type="submit" disabled={loading || !!porConfirmar || !!factura?.duplicada} className="btn-primary">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Registrar compra
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
