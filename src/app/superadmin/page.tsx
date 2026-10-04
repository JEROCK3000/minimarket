import type { Metadata } from 'next'
import Link from 'next/link'
import { prisma } from '@/lib/db/prisma'
import { requerirSuperadmin } from '@/lib/auth/session'
import { leerConfigGlobal, CLAVE_RUC_PROVEEDOR } from '@/lib/config/global'
import { AlertTriangle } from 'lucide-react'

export const metadata: Metadata = { title: 'Panel Solinteec' }

export default async function SuperadminPage() {
  await requerirSuperadmin()
  const [tenants, ruc] = await Promise.all([
    prisma.tenant.findMany({
      orderBy: { nombre: 'asc' },
      select: {
        id: true, nombre: true, activo: true, createdAt: true,
        _count: { select: { usuarios: true, productos: true, ventas: true } },
      },
    }),
    leerConfigGlobal(CLAVE_RUC_PROVEEDOR),
  ])
  const emisores = await prisma.emisorSRI.findMany({ select: { tenantId: true, ruc: true, ambiente: true } })
  const emisorDe = new Map(emisores.map((e) => [e.tenantId, e]))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">Minimarkets</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Negocios que usan el sistema (vista de solo lectura).</p>
      </div>
      {!ruc && (
        <div className="card flex items-start gap-3 border-amber-400/40 bg-amber-50/60 dark:bg-amber-500/5 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <p>
            No hay <strong>RUC Proveedor</strong> configurado: las facturas se emiten sin ese campo (Res. SRI NAC-DGERCGC26-00000027).{' '}
            <Link href="/superadmin/configuracion" className="underline font-semibold">Configurarlo</Link>
          </p>
        </div>
      )}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/5 text-left text-xs text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 font-semibold">Minimarket</th>
                <th className="px-4 py-3 font-semibold">Emisor SRI</th>
                <th className="px-4 py-3 font-semibold text-center">Usuarios</th>
                <th className="px-4 py-3 font-semibold text-center">Productos</th>
                <th className="px-4 py-3 font-semibold text-center">Ventas</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => {
                const e = emisorDe.get(t.id)
                return (
                  <tr key={t.id} className="border-b border-gray-50 dark:border-white/5">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900 dark:text-white">{t.nombre}</p>
                      <p className="text-xs text-gray-400">desde {t.createdAt.toLocaleDateString('es-EC')}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                      {e ? <><span className="font-mono">{e.ruc}</span> · {e.ambiente === 2 ? 'Producción' : 'Pruebas'}</> : <span className="text-gray-400">Sin configurar</span>}
                    </td>
                    <td className="px-4 py-3 text-center">{t._count.usuarios}</td>
                    <td className="px-4 py-3 text-center">{t._count.productos}</td>
                    <td className="px-4 py-3 text-center">{t._count.ventas}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.activo ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-gray-100 text-gray-500 dark:bg-white/5'}`}>
                        {t.activo ? 'ACTIVO' : 'INACTIVO'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
