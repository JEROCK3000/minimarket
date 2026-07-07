'use client'

import { useState } from 'react'
import { Banknote, CreditCard, ArrowLeftRight, Wallet, Loader2, CheckCircle2, Calculator } from 'lucide-react'
import { toast } from 'sonner'
import { registrarCierreAction } from './actions'

interface Resumen {
  totalVentas: number; ventasEfectivo: number; ventasTarjeta: number; ventasTransfer: number
  totalVendido: number; gastosEfectivo: number; efectivoEsperado: number
}
interface Cierre {
  id: string; fecha: string; usuario: string; totalVendido: number
  efectivoEsperado: number; efectivoContado: number; diferencia: number
}

export function CajaClient({ resumen, cierres }: { resumen: Resumen; cierres: Cierre[] }) {
  const [contado, setContado] = useState('')
  const [notas, setNotas] = useState('')
  const [loading, setLoading] = useState(false)
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
      } else toast.error(res.error || 'No se pudo registrar')
    } finally { setLoading(false) }
  }

  const tiles = [
    { label: 'Efectivo', valor: resumen.ventasEfectivo, icon: Banknote, color: 'text-green-600 bg-green-50 dark:bg-green-500/10' },
    { label: 'Tarjeta', valor: resumen.ventasTarjeta, icon: CreditCard, color: 'text-brand-600 bg-brand-50 dark:bg-brand-500/10' },
    { label: 'Transferencia', valor: resumen.ventasTransfer, icon: ArrowLeftRight, color: 'text-purple-600 bg-purple-50 dark:bg-purple-500/10' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">Cierre de Caja</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Resumen del día · {resumen.totalVentas} venta(s)</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {tiles.map((t) => (
          <div key={t.label} className="card">
            <div className={`w-9 h-9 rounded-xl grid place-items-center mb-3 ${t.color}`}><t.icon size={17} /></div>
            <p className="text-xl font-black text-gray-900 dark:text-white">{money(t.valor)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Ventas en {t.label.toLowerCase()}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Arqueo de efectivo */}
        <div className="card space-y-4">
          <h3 className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2"><Calculator size={16} className="text-brand-600" /> Arqueo de efectivo</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-500"><span>Ventas en efectivo</span><span>{money(resumen.ventasEfectivo)}</span></div>
            <div className="flex justify-between text-gray-500"><span>− Gastos pagados en efectivo</span><span>−{money(resumen.gastosEfectivo)}</span></div>
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
                <p className="text-xs text-gray-500 dark:text-gray-400">Total vendido hoy (todas las formas de pago)</p>
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
