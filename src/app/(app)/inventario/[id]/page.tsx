import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requerirTenant } from '@/lib/auth/tenant'
import { prisma } from '@/lib/db/prisma'
import { TomaClient } from './TomaClient'

export const metadata: Metadata = { title: 'Toma de inventario' }

export default async function TomaPage({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await requerirTenant()
  const { id } = await params
  const toma = await prisma.tomaInventario.findFirst({
    where: { id, tenantId: sesion.tenantId },
    include: { items: { select: { productoId: true, cantidadContada: true, stockAlContar: true, contadoPor: true } } },
  })
  if (!toma) notFound()
  const esAdmin = sesion.rol === 'ADMIN'
  const contados = new Set(toma.items.map((i) => i.productoId))
  // En curso: todos los productos del alcance; cerrada: solo los que se contaron.
  const productos = await prisma.producto.findMany({
    where: toma.estado === 'EN_CURSO'
      ? { tenantId: sesion.tenantId, activo: true, ...(toma.categoriaId ? { categoriaId: toma.categoriaId } : {}) }
      : { tenantId: sesion.tenantId, id: { in: [...contados] } },
    orderBy: { nombre: 'asc' },
    select: { id: true, nombre: true, codigoBarras: true, stock: true, unidad: true, precioCompra: true },
  })
  return (
    <TomaClient
      toma={{ id: toma.id, numero: toma.numero, alcance: toma.categoriaNombre ?? 'Todos los productos', estado: toma.estado, notas: toma.notas,
        aplicadaPor: toma.aplicadaPor, aplicadaAt: toma.aplicadaAt?.toISOString() ?? null, faltante: Number(toma.valorFaltante), sobrante: Number(toma.valorSobrante) }}
      esAdmin={esAdmin}
      productos={productos.map((p) => ({
        id: p.id, nombre: p.nombre, codigoBarras: p.codigoBarras ?? '', unidad: p.unidad,
        // El cajero cuenta "a ciegas": el stock y el costo solo llegan al navegador del ADMIN.
        stock: esAdmin ? Number(p.stock) : null, costo: esAdmin ? Number(p.precioCompra) : null,
      }))}
      conteos={toma.items.map((i) => ({
        productoId: i.productoId, cantidad: Number(i.cantidadContada), stockAlContar: esAdmin ? Number(i.stockAlContar) : null, contadoPor: i.contadoPor,
      }))}
    />
  )
}
