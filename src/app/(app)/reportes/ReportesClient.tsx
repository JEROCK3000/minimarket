'use client'

import { useState } from 'react'
import { FileSpreadsheet, FileText, Download, Loader2, Package, Wallet } from 'lucide-react'
import { toast } from 'sonner'

type Tipo = 'ventas' | 'gastos' | 'inventario'
type Formato = 'excel' | 'pdf'

export function ReportesClient() {
  const primerDia = new Date(new Date().setDate(1)).toISOString().slice(0, 10)
  const hoy = new Date().toISOString().slice(0, 10)
  const [desde, setDesde] = useState(primerDia)
  const [hasta, setHasta] = useState(hoy)
  const [cargando, setCargando] = useState<string | null>(null)

  const descargar = async (tipo: Tipo, formato: Formato) => {
    setCargando(`${tipo}-${formato}`)
    try {
      const params = new URLSearchParams()
      if (tipo !== 'inventario') { params.set('desde', desde); params.set('hasta', hasta) }
      if (formato === 'pdf') params.set('formato', 'pdf')
      const qs = params.toString()
      const res = await fetch(`/api/reportes/${tipo}${qs ? `?${qs}` : ''}`)
      if (!res.ok) throw new Error('No se pudo generar el reporte')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${tipo}.${formato === 'pdf' ? 'pdf' : 'xlsx'}`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Reporte descargado')
    } catch (err: any) {
      toast.error(err.message || 'Error al descargar')
    } finally {
      setCargando(null)
    }
  }

  const reportes = [
    { tipo: 'ventas' as const, titulo: 'Reporte de ventas', desc: 'Ventas con totales e IVA, por rango de fechas', icon: FileSpreadsheet, color: 'text-brand-600 bg-brand-50 dark:bg-brand-500/10', rango: true },
    { tipo: 'gastos' as const, titulo: 'Reporte de gastos', desc: 'Gastos por categoría con totales, por rango de fechas', icon: Wallet, color: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10', rango: true },
    { tipo: 'inventario' as const, titulo: 'Inventario y valorización', desc: 'Stock actual y valor del inventario a costo (foto de hoy)', icon: Package, color: 'text-green-600 bg-green-50 dark:bg-green-500/10', rango: false },
  ]

  return (
    <div className="space-y-6">
      <div className="card space-y-4">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Rango de fechas (para ventas y gastos)</p>
        <div className="grid grid-cols-2 gap-4 max-w-md">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="input" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="input" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {reportes.map((r) => (
          <div key={r.tipo} className="card flex flex-col">
            <div className={`w-10 h-10 rounded-xl grid place-items-center mb-3 ${r.color}`}><r.icon size={20} /></div>
            <h3 className="font-bold text-gray-900 dark:text-white text-sm">{r.titulo}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex-1">{r.desc}</p>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button onClick={() => descargar(r.tipo, 'excel')} disabled={cargando !== null} className="btn-primary h-9 text-xs">
                {cargando === `${r.tipo}-excel` ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                Excel
              </button>
              <button onClick={() => descargar(r.tipo, 'pdf')} disabled={cargando !== null} className="btn-ghost h-9 text-xs">
                {cargando === `${r.tipo}-pdf` ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                PDF
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
