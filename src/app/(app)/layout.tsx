import { redirect } from 'next/navigation'
import { obtenerSesion } from '@/lib/auth/jwt'
import { logoutAction } from '@/lib/auth/actions'
import { prisma } from '@/lib/db/prisma'
import { Sidebar } from '@/components/layout/Sidebar'
import { LogOut } from 'lucide-react'
import { usaControlCaja } from '@/lib/config/negocio'
import { obtenerSuscripcion } from '@/lib/saas/suscripcion'
import { AvisoSuscripcion } from '@/components/layout/AvisoSuscripcion'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sesion = await obtenerSesion()
  if (!sesion) redirect('/login')
  // El superadmin global no opera un minimarket: su lugar es el panel Solinteec.
  if (sesion.rol === 'SUPERADMIN' && !sesion.tenantId) redirect('/superadmin')

  const tenant = sesion.tenantId
    ? await prisma.tenant.findUnique({ where: { id: sesion.tenantId }, select: { nombre: true } })
    : null
  const usarCaja = sesion.tenantId ? await usaControlCaja(sesion.tenantId) : true
  const suscripcion = sesion.tenantId ? await obtenerSuscripcion(sesion.tenantId) : null
  const nombreTenant = tenant?.nombre || process.env.NEXT_PUBLIC_APP_NAME || 'MiniMarket'

  return (
    <div className="min-h-screen flex bg-gray-50 dark:bg-[#070710]">
      <Sidebar nombreTenant={nombreTenant} rol={sesion.rol} usarCaja={usarCaja} />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-gray-100 dark:border-white/5 bg-white/80 dark:bg-[#0a0a16]/80 backdrop-blur sticky top-0 z-20 flex items-center justify-end px-4 gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-semibold text-gray-900 dark:text-white leading-tight">{sesion.nombre}</p>
            <p className="text-[10px] text-gray-400 leading-tight">{sesion.rol}</p>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="btn-ghost h-9 px-3 text-xs" title="Cerrar sesión">
              <LogOut size={14} /> Salir
            </button>
          </form>
        </header>
        {suscripcion && <AvisoSuscripcion s={suscripcion} />}

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  )
}
