import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requerirTenant } from '@/lib/auth/tenant'
import { prisma } from '@/lib/db/prisma'
import { CATEGORIAS_MERMA, esCategoriaMerma } from '@/lib/inventario/mermas'
import { MermasClient } from './MermasClient'

export const metadata: Metadata = { title: 'Mermas' }

export default async function MermasPage() {
  const sesion = await requerirTenant()
  if (sesion.rol !== 'ADMIN') redirect('/dashboard')
  const desde = new Date(); desde.setDate(desde.getDate() - 90); desde.setHours(0, 0, 0, 0)
  const [movs, productos] = await Promise.all([
    prisma.movimientoInventario.findMany({
      where: { tenantId: sesion.tenantId, createdAt: { gte: desde }, cantidad: { lt: 0 }, OR: [{ tipo: 'MERMA' }, { categoria: { not: null } }] },
      include: { producto: { select: { nombre: true, unidad: true, precioCompra: true } } },
      orderBy: { createdAt: 'desc' }, take: 500,
    }),
    prisma.producto.findMany({
      where: { tenantId: sesion.tenantId, activo: true }, orderBy: { nombre: 'asc' },
      select: { id: true, nombre: true, codigoBarras: true, stock: true, unidad: true, precioCompra: true },
    }),
  ])
  return (
    <MermasClient
      mermas={movs.map((m) => {
        const cantidad = -Number(m.cantidad)
        const costo = m.costoUnitario !== null ? Number(m.costoUnitario) : Number(m.producto.precioCompra)
        return {
          id: m.id, fecha: m.createdAt.toISOString(), producto: m.producto.nombre, unidad: m.producto.unidad, cantidad, valor: cantidad * costo,
          tipo: m.categoria && esCategoriaMerma(m.categoria) ? m.categoria : 'OTRO', tipoTexto: m.categoria && esCategoriaMerma(m.categoria) ? CATEGORIAS_MERMA[m.categoria] : 'Sin clasificar',
          detalle: m.motivo ?? '', usuario: m.usuarioNombre ?? '—',
        }
      })}
      productos={productos.map((p) => ({ id: p.id, nombre: p.nombre, codigoBarras: p.codigoBarras ?? '', stock: Number(p.stock), unidad: p.unidad, costo: Number(p.precioCompra) }))}
    />
  )
}
