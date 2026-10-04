'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FileText, Mail, KeyRound, Printer, SlidersHorizontal, BadgeCheck } from 'lucide-react'

const TABS = [
  { href: '/configuracion', label: 'Facturación SRI', icon: FileText },
  { href: '/configuracion/correo', label: 'Correo', icon: Mail },
  { href: '/configuracion/operacion', label: 'Operación', icon: SlidersHorizontal },
  { href: '/configuracion/impresora', label: 'Impresora', icon: Printer },
  { href: '/configuracion/seguridad', label: 'Seguridad', icon: KeyRound },
  { href: '/configuracion/suscripcion', label: 'Suscripción', icon: BadgeCheck },
]

export function ConfigTabs() {
  const pathname = usePathname()
  return (
    <div className="flex gap-1 border-b border-gray-100 dark:border-white/5 overflow-x-auto">
      {TABS.map((t) => {
        const activo = pathname === t.href
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
              activo
                ? 'border-brand-600 text-gray-900 dark:text-white'
                : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <t.icon size={15} /> {t.label}
          </Link>
        )
      })}
    </div>
  )
}
