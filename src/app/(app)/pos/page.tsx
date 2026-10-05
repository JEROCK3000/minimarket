import type { Metadata } from 'next'
import { requerirTenant } from '@/lib/auth/tenant'
import { prisma } from '@/lib/db/prisma'
import { POSClient } from './POSClient'
import { cajaAbierta } from '@/lib/caja/estado'
import { usaControlCaja, leerConfigBalanza } from '@/lib/config/negocio'

export const metadata: Metadata = { title: 'Punto de Venta' }

export default async function POSPage() {
  const sesion = await requerirTenant()

  const [productos, categorias, apertura] = await Promise.all([
    prisma.producto.findMany({
      where: { tenantId: sesion.tenantId, activo: true, vendible: true },
      include: { categoria: { select: { nombre: true } } },
      orderBy: { nombre: 'asc' },
    }),
    prisma.categoria.findMany({
      where: { tenantId: sesion.tenantId, activo: true },
      orderBy: { nombre: 'asc' },
      select: { id: true, nombre: true, icono: true },
    }),
    cajaAbierta(sesion.tenantId),
  ])
  // Sin control de caja (Configuración → Operación) se vende sin abrirla.
  const puedeVender = !(await usaControlCaja(sesion.tenantId)) || !!apertura

  const productosPlanos = productos.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    codigoBarras: p.codigoBarras,
    codigoBalanza: p.codigoBalanza,
    categoriaNombre: p.categoria?.nombre ?? null,
    precioVenta: Number(p.precioVenta),
    ivaPorcentaje: Number(p.ivaPorcentaje),
    stock: Number(p.stock),
    unidad: p.unidad,
    imagen: p.imagen,
  }))

  return (
    <POSClient
      productos={productosPlanos}
      categorias={categorias.map((c) => ({ id: c.id, nombre: c.nombre, icono: c.icono }))}
      cajaAbierta={puedeVender}
      balanza={await leerConfigBalanza(sesion.tenantId)}
    />
  )
}
