import Link from 'next/link'
import { redirect } from 'next/navigation'
import { obtenerSesion } from '@/lib/auth/jwt'
import { requerirSuperadmin } from '@/lib/auth/session'
import { logoutAction } from '@/lib/auth/actions'
import { LogOut, ShieldCheck } from 'lucide-react'

/**
 * Panel del SUPERADMIN (Solinteec): configuración global y vista de los
 * minimarkets. No opera datos de negocio de ningún minimarket.
 */
export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const sesion = await obtenerSesion()
  if (!sesion) redirect('/login')
  if (sesion.rol !== 'SUPERADMIN') redirect('/dashboard')
  await requerirSuperadmin() // valida el rol contra la BD (no solo el token)

  const enlace = 'px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5'
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#070710]">
      <header className="h-14 border-b border-gray-100 dark:border-white/5 bg-white/80 dark:bg-[#0a0a16]/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-5xl mx-auto h-full px-4 flex items-center gap-3">
          <ShieldCheck size={20} className="text-brand-600 shrink-0" />
          <span className="font-black text-gray-900 dark:text-white hidden sm:inline">Panel Solinteec</span>
          <nav className="flex gap-1 ml-2">
            <Link href="/superadmin" className={enlace}>Minimarkets</Link>
            <Link href="/superadmin/configuracion" className={enlace}>Configuración global</Link>
          </nav>
          <form action={logoutAction} className="ml-auto">
            <button type="submit" className="btn-ghost h-9 px-3 text-xs" title="Cerrar sesión"><LogOut size={14} /> Salir</button>
          </form>
        </div>
      </header>
      <main className="max-w-5xl mx-auto p-4 sm:p-6">{children}</main>
    </div>
  )
}
