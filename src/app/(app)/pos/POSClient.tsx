'use client'

import { useState, useMemo, useRef } from 'react'
import { Search, ShoppingCart, Plus, Minus, Trash2, Receipt, FileText, Loader2, CheckCircle2, X, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { registrarVentaAction, buscarClienteAction, crearClienteRapidoAction, actualizarClienteRapidoAction } from './actions'
import { consultarIdentificacionAction } from '../clientes/actions'
import { obtenerTicketAction } from './ticket-actions'
import { imprimirTicket } from '@/lib/print/ticket'

interface Prod {
  id: string; nombre: string; codigoBarras: string | null; categoriaNombre: string | null
  precioVenta: number; ivaPorcentaje: number; stock: number; unidad: string
}
interface Cat { id: string; nombre: string; icono: string | null }
interface ItemCarrito extends Prod { cantidad: number }
interface ClienteSel { id: string; nombre: string; identificacion: string; telefono?: string | null; email?: string | null; direccion?: string | null }

export function POSClient({ productos, categorias }: { productos: Prod[]; categorias: Cat[] }) {
  const [busqueda, setBusqueda] = useState('')
  const [catFiltro, setCatFiltro] = useState<string | null>(null)
  const [carrito, setCarrito] = useState<ItemCarrito[]>([])
  const [formaPago, setFormaPago] = useState<'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA'>('EFECTIVO')
  const [requiereFactura, setRequiereFactura] = useState(true)
  const [pagoCon, setPagoCon] = useState('')
  const [cliente, setCliente] = useState<ClienteSel | null>(null)
  const [procesando, setProcesando] = useState(false)
  const [modalCliente, setModalCliente] = useState(false)
  const [ultimaVenta, setUltimaVenta] = useState<any>(null)
  const buscarRef = useRef<HTMLInputElement>(null)

  const money = (n: number) => `$${n.toFixed(2)}`

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim()
    return productos.filter((p) => {
      if (catFiltro && p.categoriaNombre !== catFiltro) return false
      if (!q) return true
      return p.nombre.toLowerCase().includes(q) || p.codigoBarras?.includes(q)
    })
  }, [productos, busqueda, catFiltro])

  // Totales
  const { subtotal, iva, total } = useMemo(() => {
    let sub = 0, i = 0
    for (const it of carrito) {
      const base = it.cantidad * it.precioVenta
      sub += base
      i += base * (it.ivaPorcentaje / 100)
    }
    return { subtotal: sub, iva: i, total: sub + i }
  }, [carrito])

  const vuelto = pagoCon ? Math.max(0, Number(pagoCon) - total) : 0

  const agregar = (p: Prod) => {
    setCarrito((c) => {
      const existe = c.find((it) => it.id === p.id)
      const enCarrito = existe?.cantidad ?? 0
      if (enCarrito + 1 > p.stock) { toast.error(`Sin stock de ${p.nombre}`); return c }
      if (existe) return c.map((it) => (it.id === p.id ? { ...it, cantidad: it.cantidad + 1 } : it))
      return [...c, { ...p, cantidad: 1 }]
    })
  }
  const cambiarCantidad = (id: string, delta: number) => {
    setCarrito((c) => c.flatMap((it) => {
      if (it.id !== id) return [it]
      const nueva = it.cantidad + delta
      if (nueva <= 0) return []
      if (nueva > it.stock) { toast.error(`Solo hay ${it.stock} de ${it.nombre}`); return [it] }
      return [{ ...it, cantidad: nueva }]
    }))
  }
  const quitar = (id: string) => setCarrito((c) => c.filter((it) => it.id !== id))

  // Enter en búsqueda: si coincide un código de barras exacto, lo agrega (scanner)
  const onBuscarKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return
    const code = busqueda.trim()
    const exacto = productos.find((p) => p.codigoBarras === code)
    if (exacto) { agregar(exacto); setBusqueda(''); }
    else if (filtrados.length === 1) { agregar(filtrados[0]); setBusqueda('') }
  }

  const limpiar = () => {
    setCarrito([]); setPagoCon(''); setCliente(null); setRequiereFactura(true); setFormaPago('EFECTIVO')
  }

  const cobrar = async () => {
    if (carrito.length === 0) { toast.error('El carrito está vacío'); return }
    if (requiereFactura && !cliente) { setModalCliente(true); return }
    if (formaPago === 'EFECTIVO' && pagoCon && Number(pagoCon) < total) { toast.error('El pago es menor al total'); return }

    setProcesando(true)
    try {
      const res = await registrarVentaAction({
        clienteId: cliente?.id,
        formaPago,
        requiereFactura,
        pagoCon: pagoCon ? Number(pagoCon) : undefined,
        items: carrito.map((it) => ({ productoId: it.id, cantidad: it.cantidad })),
      })
      if (res.success) {
        setUltimaVenta(res.venta)
        limpiar()
      } else {
        toast.error(res.error || 'No se pudo registrar la venta')
      }
    } finally {
      setProcesando(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-3.5rem)]">
      {/* ── Catálogo ── */}
      <div className="space-y-4">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={buscarRef}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={onBuscarKey}
            autoFocus
            placeholder="Buscar o escanear código de barras..."
            className="input pl-10 h-12 text-base"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => setCatFiltro(null)} className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${!catFiltro ? 'bg-brand-600 text-white' : 'bg-white dark:bg-white/5 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-white/10'}`}>Todos</button>
          {categorias.map((c) => (
            <button key={c.id} onClick={() => setCatFiltro(c.nombre)} className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${catFiltro === c.nombre ? 'bg-brand-600 text-white' : 'bg-white dark:bg-white/5 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-white/10'}`}>
              {c.icono} {c.nombre}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtrados.map((p) => {
            const agotado = p.stock <= 0
            return (
              <button
                key={p.id}
                onClick={() => agregar(p)}
                disabled={agotado}
                className="card p-3 text-left hover:border-brand-500 hover:shadow-md transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <p className="font-semibold text-sm text-gray-900 dark:text-white line-clamp-2 leading-tight">{p.nombre}</p>
                <p className="text-brand-600 dark:text-brand-400 font-black mt-2">{money(p.precioVenta)}</p>
                <p className={`text-[11px] mt-0.5 ${agotado ? 'text-red-500' : 'text-gray-400'}`}>
                  {agotado ? 'Agotado' : `Stock: ${p.stock % 1 === 0 ? p.stock : p.stock.toFixed(2)}`}
                </p>
              </button>
            )
          })}
          {filtrados.length === 0 && (
            <p className="col-span-full text-center text-sm text-gray-400 py-10">Sin resultados.</p>
          )}
        </div>
      </div>

      {/* ── Carrito / Cobro ── */}
      <div className="lg:sticky lg:top-4 lg:self-start card p-0 flex flex-col max-h-[calc(100vh-5rem)]">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-white/5 flex items-center gap-2">
          <ShoppingCart size={18} className="text-brand-600" />
          <span className="font-bold text-gray-900 dark:text-white">Venta actual</span>
          {carrito.length > 0 && <span className="ml-auto text-xs text-gray-400">{carrito.length} item(s)</span>}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[120px]">
          {carrito.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">Toca un producto para agregarlo</p>
          ) : carrito.map((it) => (
            <div key={it.id} className="flex items-center gap-2 text-sm">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-white truncate">{it.nombre}</p>
                <p className="text-xs text-gray-400">{money(it.precioVenta)} c/u</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => cambiarCantidad(it.id, -1)} className="p-1 rounded bg-gray-100 dark:bg-white/10 hover:bg-gray-200"><Minus size={13} /></button>
                <span className="w-7 text-center font-semibold">{it.cantidad}</span>
                <button onClick={() => cambiarCantidad(it.id, 1)} className="p-1 rounded bg-gray-100 dark:bg-white/10 hover:bg-gray-200"><Plus size={13} /></button>
              </div>
              <span className="w-16 text-right font-semibold text-gray-900 dark:text-white">{money(it.cantidad * it.precioVenta)}</span>
              <button onClick={() => quitar(it.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-100 dark:border-white/5 p-4 space-y-3">
          {/* Tipo de comprobante */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setRequiereFactura(true)} className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition ${requiereFactura ? 'bg-brand-600 text-white' : 'bg-gray-100 dark:bg-white/5 text-gray-500'}`}>
              <FileText size={14} /> Factura
            </button>
            <button onClick={() => setRequiereFactura(false)} className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition ${!requiereFactura ? 'bg-gray-800 dark:bg-white text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-white/5 text-gray-500'}`}>
              <Receipt size={14} /> Solo ticket
            </button>
          </div>

          {/* Cliente (si factura) */}
          {requiereFactura && (
            <button onClick={() => setModalCliente(true)} className="w-full text-left text-xs px-3 py-2 rounded-lg border border-dashed border-gray-300 dark:border-white/15 text-gray-500 hover:border-brand-500">
              {cliente ? <span className="text-gray-900 dark:text-white font-semibold">{cliente.nombre} · {cliente.identificacion}</span> : '+ Seleccionar cliente para la factura'}
            </button>
          )}

          {/* Forma de pago */}
          <div className="grid grid-cols-3 gap-1.5">
            {(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'] as const).map((fp) => (
              <button key={fp} onClick={() => setFormaPago(fp)} className={`py-1.5 rounded-lg text-[11px] font-semibold transition ${formaPago === fp ? 'bg-brand-600 text-white' : 'bg-gray-100 dark:bg-white/5 text-gray-500'}`}>
                {fp === 'EFECTIVO' ? 'Efectivo' : fp === 'TARJETA' ? 'Tarjeta' : 'Transfer.'}
              </button>
            ))}
          </div>

          {/* Totales */}
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{money(subtotal)}</span></div>
            <div className="flex justify-between text-gray-500"><span>IVA</span><span>{money(iva)}</span></div>
            <div className="flex justify-between text-lg font-black text-gray-900 dark:text-white pt-1"><span>Total</span><span>{money(total)}</span></div>
          </div>

          {/* Pago en efectivo → vuelto */}
          {formaPago === 'EFECTIVO' && carrito.length > 0 && (
            <div className="flex items-center gap-2">
              <input type="number" step="0.01" value={pagoCon} onChange={(e) => setPagoCon(e.target.value)} placeholder="Paga con..." className="input h-9 text-sm" />
              {Number(pagoCon) >= total && total > 0 && (
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-gray-400 leading-none">Vuelto</p>
                  <p className="font-bold text-green-600">{money(vuelto)}</p>
                </div>
              )}
            </div>
          )}

          <button onClick={cobrar} disabled={procesando || carrito.length === 0} className="btn-primary w-full h-12 text-base">
            {procesando ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
            Cobrar {money(total)}
          </button>
        </div>
      </div>

      {modalCliente && (
        <ClienteModal
          onClose={() => setModalCliente(false)}
          onSelect={(c) => { setCliente(c); setModalCliente(false) }}
        />
      )}

      {ultimaVenta && <VentaExitosa venta={ultimaVenta} onClose={() => setUltimaVenta(null)} />}
    </div>
  )
}

// ─── Modal: seleccionar/crear/editar cliente ──────────────────────────────────
function ClienteModal({ onClose, onSelect }: { onClose: () => void; onSelect: (c: ClienteSel) => void }) {
  const [clienteId, setClienteId] = useState<string | null>(null) // null = nuevo
  const [mostrarForm, setMostrarForm] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [f, setF] = useState({
    tipoIdentificacion: 'CEDULA', identificacion: '', nombre: '',
    telefono: '', email: '', direccion: '',
  })
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }))

  const buscar = async () => {
    if (!f.identificacion.trim()) { toast.error('Ingresa una identificación'); return }
    setBuscando(true)
    try {
      // 1) Cliente ya registrado → cargar TODOS sus datos (editables)
      const local = await buscarClienteAction(f.identificacion)
      if (local.success && local.cliente) {
        const c = local.cliente
        setClienteId(c.id)
        setF({
          tipoIdentificacion: c.tipoIdentificacion, identificacion: c.identificacion, nombre: c.nombre,
          telefono: c.telefono ?? '', email: c.email ?? '', direccion: c.direccion ?? '',
        })
        setMostrarForm(true)
        toast.success('Cliente encontrado. Puedes corregir sus datos.')
        return
      }
      // 2) Cliente nuevo → consultar EcuadorAPI para autocompletar
      const api = await consultarIdentificacionAction(f.identificacion)
      setClienteId(null)
      if (api.success && api.nombre) {
        setF((s) => ({ ...s, nombre: api.nombre || '', direccion: api.direccion || s.direccion }))
        toast.success('Datos encontrados. Completa y registra.')
      } else {
        toast.message('Cliente nuevo', { description: api.error || 'Completa los datos para registrarlo' })
      }
      setMostrarForm(true)
    } finally { setBuscando(false) }
  }

  const guardarYUsar = async () => {
    if (!f.nombre.trim()) { toast.error('El nombre es requerido'); return }
    setGuardando(true)
    try {
      const payload = {
        tipoIdentificacion: f.tipoIdentificacion, identificacion: f.identificacion, nombre: f.nombre,
        telefono: f.telefono, email: f.email, direccion: f.direccion,
      }
      // Existente → actualizar (corrección en caliente). Nuevo → crear.
      const res = clienteId
        ? await actualizarClienteRapidoAction(clienteId, payload)
        : await crearClienteRapidoAction(payload)
      if (res.success && res.cliente) {
        toast.success(clienteId ? 'Datos actualizados' : 'Cliente registrado')
        onSelect(res.cliente)
      } else {
        toast.error(res.error || 'No se pudo guardar el cliente')
      }
    } finally { setGuardando(false) }
  }

  const lbl = 'text-xs font-semibold text-gray-500 dark:text-gray-400'

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={onClose}>
      <div className="w-full max-w-lg bg-white dark:bg-[#0f0f1e] rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-white/5 sticky top-0 bg-white dark:bg-[#0f0f1e]">
          <h2 className="font-bold text-gray-900 dark:text-white">Cliente para la factura</h2>
          <button onClick={onClose} className="p-1 text-gray-400"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className={lbl}>Tipo *</label>
              <select value={f.tipoIdentificacion} onChange={(e) => set('tipoIdentificacion', e.target.value)} className="input">
                <option value="CEDULA">Cédula</option>
                <option value="RUC">RUC</option>
                <option value="PASAPORTE">Pasaporte</option>
                <option value="CONSUMIDOR_FINAL">Consumidor Final</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={lbl}>Identificación *</label>
              <div className="flex gap-1.5">
                <input value={f.identificacion} onChange={(e) => set('identificacion', e.target.value)} className="input font-mono" placeholder="Cédula o RUC" />
                <button onClick={buscar} disabled={buscando} className="btn-ghost shrink-0 px-2.5" title="Buscar / consultar">
                  {buscando ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                </button>
              </div>
            </div>
          </div>

          {mostrarForm && (
            <>
              {clienteId && (
                <p className="text-[11px] text-brand-600 dark:text-brand-400 font-medium">
                  Cliente existente — corrige lo que haga falta y se actualizará con la venta.
                </p>
              )}
              <div className="space-y-1.5">
                <label className={lbl}>Nombre / Razón social *</label>
                <input value={f.nombre} onChange={(e) => set('nombre', e.target.value)} className="input" maxLength={200} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className={lbl}>Teléfono</label>
                  <input value={f.telefono} onChange={(e) => set('telefono', e.target.value)} className="input" maxLength={20} />
                </div>
                <div className="space-y-1.5">
                  <label className={lbl}>Email</label>
                  <input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} className="input" maxLength={150} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className={lbl}>Dirección</label>
                <input value={f.direccion} onChange={(e) => set('direccion', e.target.value)} className="input" maxLength={300} />
              </div>
              <button onClick={guardarYUsar} disabled={guardando || !f.nombre} className="btn-primary w-full">
                {guardando ? <Loader2 size={16} className="animate-spin" /> : null}
                {clienteId ? 'Actualizar y usar en la venta' : 'Registrar y usar en la venta'}
              </button>
            </>
          )}

          <button onClick={() => onSelect({ id: '', nombre: 'CONSUMIDOR FINAL', identificacion: '9999999999999' })} className="w-full text-xs text-gray-400 hover:text-gray-600 pt-1">
            O facturar como Consumidor Final
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: venta exitosa ─────────────────────────────────────────────────────
function VentaExitosa({ venta, onClose }: { venta: any; onClose: () => void }) {
  const money = (n: number) => `$${n.toFixed(2)}`
  const [imprimiendo, setImprimiendo] = useState<string | null>(null)

  const imprimir = async (formato: 'termico' | 'a4') => {
    setImprimiendo(formato)
    try {
      const res = await obtenerTicketAction(venta.id)
      if ('ticket' in res) imprimirTicket(res.ticket, formato)
      else toast.error(res.error || 'No se pudo generar el comprobante')
    } finally { setImprimiendo(null) }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={onClose}>
      <div className="w-full max-w-xs bg-white dark:bg-[#0f0f1e] rounded-2xl shadow-xl p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <CheckCircle2 size={48} className="mx-auto text-green-500 mb-3" />
        <h2 className="font-black text-lg text-gray-900 dark:text-white">Venta registrada</h2>
        <p className="text-xs text-gray-400 font-mono mt-1">{venta.numero}</p>
        <div className="my-4 py-3 border-y border-gray-100 dark:border-white/5 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Total</span><span className="font-bold text-gray-900 dark:text-white">{money(venta.total)}</span></div>
          {venta.vuelto != null && venta.vuelto > 0 && (
            <div className="flex justify-between"><span className="text-gray-500">Vuelto</span><span className="font-bold text-green-600">{money(venta.vuelto)}</span></div>
          )}
          <div className="flex justify-between"><span className="text-gray-500">Comprobante</span><span className="font-semibold">{venta.requiereFactura ? 'Factura' : 'Ticket'}</span></div>
        </div>

        {/* Impresión del comprobante */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button onClick={() => imprimir('termico')} disabled={!!imprimiendo} className="btn-ghost text-xs h-9">
            {imprimiendo === 'termico' ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />} Ticket
          </button>
          <button onClick={() => imprimir('a4')} disabled={!!imprimiendo} className="btn-ghost text-xs h-9">
            {imprimiendo === 'a4' ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />} A4
          </button>
        </div>

        {venta.requiereFactura && (
          <p className="text-[11px] text-gray-400 mb-3">La factura electrónica se emitirá al SRI desde el módulo de Ventas.</p>
        )}
        <button onClick={onClose} className="btn-primary w-full">Nueva venta</button>
      </div>
    </div>
  )
}
