import type { Metadata } from 'next'
import Link from 'next/link'
import { prisma } from '@/lib/db/prisma'
import { RegistroForm } from './RegistroForm'

export const metadata: Metadata = { title: 'Registra tu minimarket' }
export const dynamic = 'force-dynamic' // los planes cambian desde el panel

export default async function RegistroPage() {
  const planes = await prisma.planSuscripcion.findMany({
    where: { activo: true }, orderBy: { orden: 'asc' },
    select: { id: true, nombre: true, descripcion: true, precioMensual: true, precioAnual: true, maxUsuarios: true, maxProductos: true, maxFacturasMes: true, diasPrueba: true },
  })
  return (
    <main className="min-h-screen px-4 py-10 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-[#0a0a16] dark:to-[#111827]">
      <div className="w-full max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">{process.env.NEXT_PUBLIC_APP_NAME || 'MiniMarket'}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Registra tu negocio: punto de venta, inventario y facturación electrónica.</p>
        </div>
        {planes.length === 0 ? (
          <div className="card text-center text-sm text-gray-500">Por ahora no hay planes disponibles. Contáctanos para darte de alta.</div>
        ) : (
          <RegistroForm planes={planes.map((p) => ({ ...p, descripcion: p.descripcion ?? '', precioMensual: Number(p.precioMensual), precioAnual: Number(p.precioAnual) }))} />
        )}
        <p className="text-center text-sm text-gray-500 mt-6">¿Ya tienes cuenta? <Link href="/login" className="text-brand-600 dark:text-brand-400 font-semibold hover:underline">Inicia sesión</Link></p>
        <p className="text-center text-xs text-gray-400 mt-4">© {new Date().getFullYear()} Solinteec</p>
      </div>
    </main>
  )
}
