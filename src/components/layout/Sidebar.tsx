'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard, Package, ShoppingCart, Truck, Receipt,
  Wallet, FileText, Settings, Menu, X, Store, Users, Calculator,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'

const MODULOS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/pos', label: 'Punto de Venta', icon: ShoppingCart, destacado: true },
  { href: '/productos', label: 'Productos', icon: Package },
  { href: '/compras', label: 'Compras', icon: Truck },
  { href: '/ventas', label: 'Ventas', icon: Receipt },
  { href: '/clientes', label: 'Clientes', icon: Users },
  { href: '/gastos', label: 'Gastos', icon: Wallet },
  { href: '/caja', label: 'Cierre de Caja', icon: Calculator },
  { href: '/reportes', label: 'Reportes', icon: FileText },
  { href: '/configuracion', label: 'Configuración', icon: Settings },
]

export function Sidebar({ nombreTenant }: { nombreTenant: string }) {
  const pathname = usePathname()
  const [abierto, setAbierto] = useState(false)

  const nav = (
    <nav className="flex flex-col gap-1">
      {MODULOS.map((m) => {
        const activo = pathname === m.href || pathname.startsWith(m.href + '/')
        return (
          <Link
            key={m.href}
            href={m.href}
            onClick={() => setAbierto(false)}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition',
              activo
                ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5',
              m.destacado && !activo && 'text-brand-600 dark:text-brand-400'
            )}
          >
            <m.icon size={18} />
            {m.label}
          </Link>
        )
      })}
    </nav>
  )

  return (
    <>
      {/* Botón móvil */}
      <button
        onClick={() => setAbierto(true)}
        className="lg:hidden fixed top-3 left-3 z-30 p-2 rounded-lg bg-white dark:bg-[#0a0a16] border border-gray-200 dark:border-white/10 shadow"
        aria-label="Abrir menú"
      >
        <Menu size={20} />
      </button>

      {/* Overlay móvil */}
      {abierto && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/40" onClick={() => setAbierto(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:sticky top-0 z-40 h-screen w-64 shrink-0 flex flex-col gap-4 p-4',
          'bg-white dark:bg-[#0a0a16] border-r border-gray-100 dark:border-white/5',
          'transition-transform lg:translate-x-0',
          abierto ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-black text-gray-900 dark:text-white">
            <div className="w-9 h-9 rounded-xl bg-brand-600 grid place-items-center text-white">
              <Store size={18} />
            </div>
            <span className="text-sm leading-tight">{nombreTenant}</span>
          </div>
          <button onClick={() => setAbierto(false)} className="lg:hidden p-1" aria-label="Cerrar menú">
            <X size={20} />
          </button>
        </div>
        {nav}
      </aside>
    </>
  )
}
