'use client'

import { useState } from 'react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend } from 'recharts'
import { FileBarChart, CreditCard } from 'lucide-react'

interface Props {
  datosMensuales: { name: string; Ventas: number; Gastos: number }[]
  datosDiarios: { name: string; Ventas: number; Gastos: number }[]
  datosMetodosPago: { name: string; value: number }[]
}

const COLORES_METODOS = ['#10B981', '#6366F1', '#8B5CF6', '#F59E0B', '#EF4444']
const tooltipStyle = {
  backgroundColor: '#0f0f1e',
  borderColor: 'rgba(255,255,255,0.08)',
  borderRadius: '12px',
  color: '#fff',
  fontSize: '11px',
  fontFamily: 'inherit',
}

export function DashboardCharts({ datosMensuales, datosDiarios, datosMetodosPago }: Props) {
  const [viewType, setViewType] = useState<'mensual' | 'diario'>('diario')

  const currentData = viewType === 'mensual' ? datosMensuales : datosDiarios
  const tieneDatos = currentData.some((d) => d.Ventas > 0 || d.Gastos > 0)
  const tieneMetodos = datosMetodosPago.length > 0

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Tendencia (AreaChart) */}
      <div className="card lg:col-span-2 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
          <div className="flex items-center gap-2">
            <FileBarChart size={18} className="text-green-500" />
            <h3 className="font-bold text-gray-900 dark:text-white text-sm">
              {viewType === 'mensual' ? 'Tendencia del año (mensual)' : 'Tendencia de este mes (diaria)'}
            </h3>
          </div>
          <div className="flex bg-gray-100 dark:bg-white/5 p-1 rounded-xl border border-gray-200/50 dark:border-white/5 self-start sm:self-auto">
            {(['mensual', 'diario'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setViewType(t)}
                className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all ${
                  viewType === t
                    ? 'bg-white dark:bg-[#1a1a2e] text-green-600 dark:text-green-400 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {t === 'mensual' ? 'Mensual' : 'Diario'}
              </button>
            ))}
          </div>
        </div>

        {!tieneDatos ? (
          <div className="h-64 flex items-center justify-center text-center text-gray-500 text-xs">
            No hay datos para graficar en el período seleccionado.
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={currentData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorVentas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorGastos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#6B7280" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#6B7280" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value: any, name: any) => [`$${Number(value).toFixed(2)}`, name]} />
                <Legend verticalAlign="top" height={32} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px', paddingBottom: '10px' }} />
                <Area type="monotone" dataKey="Ventas" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorVentas)" name="Ventas" />
                <Area type="monotone" dataKey="Gastos" stroke="#EF4444" strokeWidth={2} fillOpacity={1} fill="url(#colorGastos)" name="Gastos" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Métodos de pago (PieChart) */}
      <div className="card space-y-4 flex flex-col">
        <div className="flex items-center gap-2 mb-2">
          <CreditCard size={18} className="text-purple-500" />
          <h3 className="font-bold text-gray-900 dark:text-white text-sm">Métodos de pago utilizados</h3>
        </div>
        {!tieneMetodos ? (
          <div className="h-56 flex items-center justify-center text-center text-gray-500 text-xs">
            Sin ventas registradas este mes.
          </div>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={datosMetodosPago} cx="50%" cy="45%" innerRadius={55} outerRadius={75} paddingAngle={3} dataKey="value">
                  {datosMetodosPago.map((_, i) => (
                    <Cell key={i} fill={COLORES_METODOS[i % COLORES_METODOS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(value: any) => [`$${Number(value).toFixed(2)}`, 'Monto']} />
                <Legend verticalAlign="bottom" align="center" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
