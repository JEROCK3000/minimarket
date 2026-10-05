'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Banknote, CreditCard, ArrowLeftRight, Wallet, Loader2, CheckCircle2, Calculator, DoorOpen, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react'
import { toast } from 'sonner'
import { registrarCierreAction, abrirCajaAction, registrarMovimientoCajaAction } from './actions'

interface Resumen {
  totalVentas: number; ventasEfectivo: number; ventasTarjeta: number; ventasTransfer: number
  totalVendido: number; gastosEfectivo: number; fondoInicial: number; efectivoEsperado: number
  ventasCredito: number; abonosEfectivo: number; abonosOtros: number; pagosProveedorEfectivo: number
  ingresosEfectivo: number; retirosEfectivo: number; devolucionesEfectivo: number; devolucionesTotal: number
  movimientos: { id: string; tipo: string; monto: number; motivo: string; usuario: string; fecha: string }[]
}
interface Apertura { id: string; usuario: string; fondoInicial: number; abiertaAt: string }
interface Cierre {
  id: string; fecha: string; usuario: string; totalVendido: number
  efectivoEsperado: number; efectivoContado: number; diferencia: number
}

export function CajaClient({ resumen, desde, origenDesde, apertura, cierres }: {
  resumen: Resumen; desde: string; origenDesde: 'APERTURA' | 'ULTIMO_CIERRE' | 'HOY'; apertura: Apertura | null; cierres: Cierre[]
}) {
  const router = useRouter()
  const [fondo, setFondo] = useState('')
  const [abriendo, setAbriendo] = useState(false)
  const [contado, setContado] = useState('')
  const [notas, setNotas] = useState('')
  const [loading, setLoading] = useState(false)
  // Retiro / ingreso de efectivo durante el turno
  const [mov, setMov] = useState<{ tipo: 'RETIRO' | 'INGRESO'; monto: string; motivo: string } | null>(null)
  const [guardandoMov, setGuardandoMov] = useState(false)
  const guardarMovimiento = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!mov) return
    setGuardandoMov(true)
    try {
      const r = await registrarMovimientoCajaAction({ tipo: mov.tipo, monto: Number(mov.monto), motivo: mov.motivo })
      if ('error' in r) { toast.error(r.error); return }
      toast.success(`${mov.tipo === 'RETIRO' ? 'Retiro' : 'Ingreso'} de ${money(Number(mov.monto))} registrado`)
      setMov(null); router.refresh()
    } finally { setGuardandoMov(false) }
  }
  const money = (n: number) => `$${n.toFixed(2)}`
  const fecha = (iso: string) => new Date(iso).toLocaleString('es-EC', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  const diferencia = contado !== '' ? Number(contado) - resumen.efectivoEsperado : null

  const cerrar = async () => {
    if (contado === '') { toast.error('Ingresa el efectivo contado'); return }
    setLoading(true)
    try {
      const res = await registrarCierreAction({ efectivoContado: Number(contado), notas })
      if (res.success) {
        const d = res.diferencia ?? 0
        toast.success(`Cierre registrado. ${Math.abs(d) < 0.01 ? 'Caja cuadrada ✓' : d > 0 ? `Sobrante ${money(d)}` : `Faltante ${money(Math.abs(d))}`}`)
        setContado(''); setNotas('')
        router.refresh()
      } else toast.error(res.error || 'No se pudo registrar')
    } finally { setLoading(false) }
  }

  const abrirCaja = async () => {
    setAbriendo(true)
    try {
      const res = await abrirCajaAction({ fondoInicial: Number(fondo || 0) })
      if ('error' in res) { toast.error(res.error); return }
      toast.success('Caja abierta')
      setFondo('')
      router.refresh()
    } finally { setAbriendo(false) }
  }
  const textoDesde = origenDesde === 'APERTURA' ? 'desde la apertura' : origenDesde === 'ULTIMO_CIERRE' ? 'desde el último cierre' : 'desde el inicio del día'

  const tiles = [
    { label: 'Efectivo', valor: resumen.ventasEfectivo, icon: Banknote, color: 'text-green-600 bg-green-50 dark:bg-green-500/10' },
    { label: 'Tarjeta', valor: resumen.ventasTarjeta, icon: CreditCard, color: 'text-brand-600 bg-brand-50 dark:bg-brand-500/10' },
    { label: 'Transferencia', valor: resumen.ventasTransfer, icon: ArrowLeftRight, color: 'text-purple-600 bg-purple-50 dark:bg-purple-500/10' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">Cierre de Caja</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Período actual {textoDesde} ({fecha(desde)}) · {resumen.totalVentas} venta(s)
        </p>
      </div>

      {/* Apertura de caja */}
      {apertura ? (
        <div className="card flex flex-wrap items-center gap-3 border-emerald-400/30 bg-emerald-50/40 dark:bg-emerald-500/5">
          <DoorOpen size={20} className="text-emerald-600" />
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Caja abierta por <strong>{apertura.usuario}</strong> el {fecha(apertura.abiertaAt)} con un fondo de <strong>{money(apertura.fondoInicial)}</strong>.
          </p>
        </div>
      ) : (
        <div className="card flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <h3 className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2"><DoorOpen size={16} className="text-brand-600" /> Abrir caja</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Registra el efectivo con el que empiezas (fondo o sencillo) para que el arqueo cuadre. Es opcional.</p>
          </div>
          <input type="number" step="0.01" min="0" value={fondo} onChange={(e) => setFondo(e.target.value)} className="input sm:w-40" placeholder="Fondo $0.00" aria-label="Fondo inicial" />
          <button onClick={abrirCaja} disabled={abriendo} className="btn-primary">
            {abriendo ? <Loader2 size={16} className="animate-spin" /> : <DoorOpen size={16} />} Abrir caja
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {tiles.map((t) => (
          <div key={t.label} className="card">
            <div className={`w-9 h-9 rounded-xl grid place-items-center mb-3 ${t.color}`}><t.icon size={17} /></div>
            <p className="text-xl font-black text-gray-900 dark:text-white">{money(t.valor)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Ventas en {t.label.toLowerCase()}</p>
          </div>
        ))}
      </div>

      {/* Movimientos de efectivo del turno */}
      {apertura && (
        <div className="card space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2"><Wallet size={16} className="text-brand-600" /> Movimientos de efectivo</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Retiros (a la caja fuerte, entrega al dueño) e ingresos (más cambio) durante el turno. Entran al arqueo.</p>
            </div>
            {!mov && (
              <div className="flex gap-2">
                <button type="button" onClick={() => setMov({ tipo: 'RETIRO', monto: '', motivo: '' })} className="btn-ghost text-sm border border-gray-200 dark:border-white/10"><ArrowUpFromLine size={15} /> Retiro</button>
                <button type="button" onClick={() => setMov({ tipo: 'INGRESO', monto: '', motivo: '' })} className="btn-ghost text-sm border border-gray-200 dark:border-white/10"><ArrowDownToLine size={15} /> Ingreso</button>
              </div>
            )}
          </div>
          {mov && (
            <form onSubmit={guardarMovimiento} className={`rounded-xl border p-3 flex flex-col sm:flex-row sm:items-end gap-2 ${mov.tipo === 'RETIRO' ? 'border-amber-200 dark:border-amber-500/20 bg-amber-50/50 dark:bg-amber-500/5' : 'border-emerald-200 dark:border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-500/5'}`}>
              <div className="space-y-1">
                <label htmlFor="mc-monto" className="text-xs font-semibold text-gray-500 dark:text-gray-400">{mov.tipo === 'RETIRO' ? 'Monto a retirar' : 'Monto que ingresa'}</label>
                <input id="mc-monto" type="number" step="0.01" min="0.01" value={mov.monto} onChange={(e) => setMov({ ...mov, monto: e.target.value })} className="input sm:w-36" required autoFocus />
              </div>
              <div className="space-y-1 flex-1">
                <label htmlFor="mc-motivo" className="text-xs font-semibold text-gray-500 dark:text-gray-400">Motivo</label>
                <input id="mc-motivo" value={mov.motivo} onChange={(e) => setMov({ ...mov, motivo: e.target.value })} className="input" maxLength={200} required
                  placeholder={mov.tipo === 'RETIRO' ? 'Ej. entregado a Juan (dueño) / a la caja fuerte' : 'Ej. cambio en monedas traído del banco'} />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setMov(null)} className="btn-ghost" disabled={guardandoMov}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={guardandoMov}>{guardandoMov ? <Loader2 size={16} className="animate-spin" /> : mov.tipo === 'RETIRO' ? <ArrowUpFromLine size={16} /> : <ArrowDownToLine size={16} />} Registrar</button>
              </div>
            </form>
          )}
          {resumen.movimientos.length > 0 ? (
            <ul className="divide-y divide-gray-50 dark:divide-white/5 text-sm">
              {resumen.movimientos.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${m.tipo === 'RETIRO' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'}`}>{m.tipo}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 dark:text-white truncate">{m.motivo}</p>
                    <p className="text-xs text-gray-400">{fecha(m.fecha)} · {m.usuario}</p>
                  </div>
                  <span className={`font-semibold shrink-0 ${m.tipo === 'RETIRO' ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{m.tipo === 'RETIRO' ? '−' : '+'}{money(m.monto)}</span>
                </li>
              ))}
            </ul>
          ) : !mov && <p className="text-xs text-gray-400">Sin movimientos en este turno.</p>}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Arqueo de efectivo */}
        <div className="card space-y-4">
          <h3 className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2"><Calculator size={16} className="text-brand-600" /> Arqueo de efectivo</h3>
          <div className="space-y-2 text-sm">
            {resumen.fondoInicial > 0 && (
              <div className="flex justify-between text-gray-500"><span>Fondo inicial</span><span>{money(resumen.fondoInicial)}</span></div>
            )}
            <div className="flex justify-between text-gray-500"><span>+ Ventas en efectivo</span><span>{money(resumen.ventasEfectivo)}</span></div>
            {resumen.abonosEfectivo > 0 && (
              <div className="flex justify-between text-gray-500"><span>+ Cobros de fiado en efectivo</span><span>{money(resumen.abonosEfectivo)}</span></div>
            )}
            {resumen.ingresosEfectivo > 0 && (
              <div className="flex justify-between text-gray-500"><span>+ Ingresos de efectivo</span><span>{money(resumen.ingresosEfectivo)}</span></div>
            )}
            <div className="flex justify-between text-gray-500"><span>− Gastos pagados en efectivo</span><span>−{money(resumen.gastosEfectivo)}</span></div>
            {resumen.pagosProveedorEfectivo > 0 && (
              <div className="flex justify-between text-gray-500"><span>− Pagos a proveedores en efectivo</span><span>−{money(resumen.pagosProveedorEfectivo)}</span></div>
            )}
            {resumen.devolucionesEfectivo > 0 && (
              <div className="flex justify-between text-gray-500"><span>− Devoluciones a clientes en efectivo</span><span>−{money(resumen.devolucionesEfectivo)}</span></div>
            )}
            {resumen.retirosEfectivo > 0 && (
              <div className="flex justify-between text-gray-500"><span>− Retiros de efectivo</span><span>−{money(resumen.retirosEfectivo)}</span></div>
            )}
            <div className="flex justify-between font-bold text-gray-900 dark:text-white border-t border-gray-100 dark:border-white/5 pt-2">
              <span>Efectivo esperado en caja</span><span>{money(resumen.efectivoEsperado)}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Efectivo contado físicamente</label>
            <input type="number" step="0.01" value={contado} onChange={(e) => setContado(e.target.value)} className="input" placeholder="0.00" />
          </div>

          {diferencia !== null && (
            <div className={`rounded-xl p-3 text-sm font-semibold ${Math.abs(diferencia) < 0.01 ? 'bg-green-50 dark:bg-green-500/10 text-green-600' : diferencia > 0 ? 'bg-brand-50 dark:bg-brand-500/10 text-brand-600' : 'bg-red-50 dark:bg-red-500/10 text-red-500'}`}>
              {Math.abs(diferencia) < 0.01 ? '✓ Caja cuadrada' : diferencia > 0 ? `Sobrante: ${money(diferencia)}` : `Faltante: ${money(Math.abs(diferencia))}`}
            </div>
          )}

          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} className="input min-h-[60px] py-2" placeholder="Notas del cierre (opcional)" />

          <button onClick={cerrar} disabled={loading} className="btn-primary w-full">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Registrar cierre de caja
          </button>
        </div>

        {/* Total del día + historial */}
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-white/10 grid place-items-center"><Wallet size={20} className="text-gray-600 dark:text-gray-300" /></div>
              <div>
                <p className="text-2xl font-black text-gray-900 dark:text-white">{money(resumen.totalVendido)}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total vendido en el período (todas las formas de pago)</p>
                {resumen.devolucionesTotal > 0 && <p className="text-xs text-red-500 mt-0.5">Devoluciones del período: −{money(resumen.devolucionesTotal)}</p>}
                {(resumen.ventasCredito > 0 || resumen.abonosOtros > 0) && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {resumen.ventasCredito > 0 && <>Fiado: {money(resumen.ventasCredito)} (por cobrar)</>}
                    {resumen.ventasCredito > 0 && resumen.abonosOtros > 0 && ' · '}
                    {resumen.abonosOtros > 0 && <>Cobros con tarjeta/transferencia: {money(resumen.abonosOtros)}</>}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="font-bold text-gray-900 dark:text-white text-sm mb-3">Cierres recientes</h3>
            {cierres.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">Aún no hay cierres registrados.</p>
            ) : (
              <div className="space-y-2">
                {cierres.map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-xs border-b border-gray-50 dark:border-white/5 pb-2 last:border-0">
                    <div>
                      <p className="text-gray-900 dark:text-white font-medium">{fecha(c.fecha)}</p>
                      <p className="text-gray-400">{c.usuario} · vendido {money(c.totalVendido)}</p>
                    </div>
                    <span className={`font-bold ${Math.abs(c.diferencia) < 0.01 ? 'text-green-600' : c.diferencia > 0 ? 'text-brand-600' : 'text-red-500'}`}>
                      {Math.abs(c.diferencia) < 0.01 ? 'Cuadrada' : (c.diferencia > 0 ? '+' : '') + money(c.diferencia)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
