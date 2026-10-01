'use client'

import { useState } from 'react'
import { FileSpreadsheet, FileText, Download, Loader2, Package, Wallet, TrendingUp, Users, Truck, Calculator, Snowflake, CalendarClock, HandCoins } from 'lucide-react'
import { toast } from 'sonner'
import { hoyLocalISO, inicioMesLocalISO } from '@/lib/utils/fechas'

type Tipo = 'ventas' | 'gastos' | 'inventario' | 'utilidad' | 'cajeros' | 'compras' | 'cierres' | 'sin-movimiento' | 'por-vencer' | 'cartera'
type Formato = 'excel' | 'pdf'

interface DefReporte {
  tipo: Tipo; titulo: string; desc: string; icon: typeof Package; color: string
  rango: boolean; soloAdmin?: boolean; dias?: boolean
}

const REPORTES: DefReporte[] = [
  { tipo: 'ventas', titulo: 'Ventas', desc: 'Ventas con totales e IVA', icon: FileSpreadsheet, color: 'text-brand-600 bg-brand-50 dark:bg-brand-500/10', rango: true },
  { tipo: 'utilidad', titulo: 'Utilidad por producto', desc: 'Venta neta, costo, utilidad y margen de cada producto', icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10', rango: true, soloAdmin: true },
  { tipo: 'cajeros', titulo: 'Ventas por cajero', desc: 'Ventas, ticket promedio, descuentos y anulaciones por usuario', icon: Users, color: 'text-purple-600 bg-purple-50 dark:bg-purple-500/10', rango: true, soloAdmin: true },
  { tipo: 'compras', titulo: 'Compras', desc: 'Compras del período por proveedor (anuladas no suman)', icon: Truck, color: 'text-sky-600 bg-sky-50 dark:bg-sky-500/10', rango: true, soloAdmin: true },
  { tipo: 'cartera', titulo: 'Cartera por cobrar', desc: 'Ventas fiadas pendientes con antigüedad y vencimiento (al día de hoy)', icon: HandCoins, color: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10', rango: false, soloAdmin: true },
  { tipo: 'gastos', titulo: 'Gastos', desc: 'Gastos por categoría con totales', icon: Wallet, color: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10', rango: true },
  { tipo: 'cierres', titulo: 'Cierres de caja', desc: 'Historial de cierres con arqueo y diferencias', icon: Calculator, color: 'text-rose-600 bg-rose-50 dark:bg-rose-500/10', rango: true, soloAdmin: true },
  { tipo: 'inventario', titulo: 'Inventario y valorización', desc: 'Stock actual y valor del inventario a costo (foto de hoy)', icon: Package, color: 'text-green-600 bg-green-50 dark:bg-green-500/10', rango: false },
  { tipo: 'por-vencer', titulo: 'Productos por vencer', desc: 'En stock vencidos o que vencen dentro de los días indicados', icon: CalendarClock, color: 'text-orange-600 bg-orange-50 dark:bg-orange-500/10', rango: false, dias: true },
  { tipo: 'sin-movimiento', titulo: 'Productos sin movimiento', desc: 'Con stock y sin ventas en los últimos días (capital inmovilizado)', icon: Snowflake, color: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-500/10', rango: false, dias: true },
]

/** Nombre del archivo desde Content-Disposition (viene fechado del servidor). */
function nombreArchivo(res: Response, respaldo: string) {
  const m = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')
  return m?.[1] || respaldo
}

export function ReportesClient({ esAdmin }: { esAdmin: boolean }) {
  const primerDia = inicioMesLocalISO()
  const hoy = hoyLocalISO()
  const [desde, setDesde] = useState(primerDia)
  const [hasta, setHasta] = useState(hoy)
  const [dias, setDias] = useState('30')
  const [cargando, setCargando] = useState<string | null>(null)

  const descargar = async (r: DefReporte, formato: Formato) => {
    if (r.rango && desde > hasta) { toast.error('La fecha "desde" es posterior a "hasta"'); return }
    setCargando(`${r.tipo}-${formato}`)
    try {
      const params = new URLSearchParams()
      if (r.rango) { params.set('desde', desde); params.set('hasta', hasta) }
      if (r.dias) params.set('dias', dias || '30')
      if (formato === 'pdf') params.set('formato', 'pdf')
      const qs = params.toString()
      const res = await fetch(`/api/reportes/${r.tipo}${qs ? `?${qs}` : ''}`)
      if (!res.ok) throw new Error(res.status === 401 ? 'No tienes permiso para este reporte' : 'No se pudo generar el reporte')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nombreArchivo(res, `${r.tipo}.${formato === 'pdf' ? 'pdf' : 'xlsx'}`)
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Reporte descargado')
    } catch (err: any) {
      toast.error(err.message || 'Error al descargar')
    } finally {
      setCargando(null)
    }
  }

  const visibles = REPORTES.filter((r) => !r.soloAdmin || esAdmin)
  const lbl = 'text-xs font-semibold text-gray-500 dark:text-gray-400'

  return (
    <div className="space-y-6">
      <div className="card flex flex-col sm:flex-row gap-4 sm:items-end">
        <div className="grid grid-cols-2 gap-4 flex-1 max-w-md">
          <div className="space-y-1.5">
            <label className={lbl} htmlFor="r-desde">Desde</label>
            <input id="r-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="input" />
          </div>
          <div className="space-y-1.5">
            <label className={lbl} htmlFor="r-hasta">Hasta</label>
            <input id="r-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="input" />
          </div>
        </div>
        <div className="space-y-1.5 w-40">
          <label className={lbl} htmlFor="r-dias">Días (sin venta / por vencer)</label>
          <input id="r-dias" type="number" min={1} max={365} value={dias} onChange={(e) => setDias(e.target.value)} className="input" />
        </div>
        <p className="text-[11px] text-gray-400 sm:pb-2">El rango aplica a los reportes con fechas; "días", a productos sin movimiento y por vencer.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibles.map((r) => (
          <div key={r.tipo} className="card flex flex-col">
            <div className={`w-10 h-10 rounded-xl grid place-items-center mb-3 ${r.color}`}><r.icon size={20} /></div>
            <h3 className="font-bold text-gray-900 dark:text-white text-sm">{r.titulo}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex-1">{r.desc}</p>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button onClick={() => descargar(r, 'excel')} disabled={cargando !== null} className="btn-primary h-9 text-xs">
                {cargando === `${r.tipo}-excel` ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Excel
              </button>
              <button onClick={() => descargar(r, 'pdf')} disabled={cargando !== null} className="btn-ghost h-9 text-xs">
                {cargando === `${r.tipo}-pdf` ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} PDF
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
