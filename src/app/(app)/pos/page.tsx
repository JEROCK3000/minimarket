import type { Metadata } from 'next'
import { requerirTenant } from '@/lib/auth/tenant'
import { prisma } from '@/lib/db/prisma'
import { POSClient } from './POSClient'
import { cajaAbierta, usaVariasCajas } from '@/lib/caja/estado'
import { promocionesDeHoy } from '@/lib/ventas/promociones-db'
import { usaControlCaja, leerConfigBalanza } from '@/lib/config/negocio'

export const metadata: Metadata = { title: 'Punto de Venta' }

export default async function POSPage() {
  const sesion = await requerirTenant()

  const [productos, categorias, apertura] = await Promise.all([
    prisma.producto.findMany({
      where: { tenantId: sesion.tenantId, activo: true, vendible: true },
      include: {
        categoria: { select: { nombre: true } },
        presentaciones: { where: { activo: true }, orderBy: { factor: 'asc' }, select: { id: true, nombre: true, factor: true, codigoBarras: true, precioVenta: true } },
        preciosEscala: { orderBy: { desde: 'asc' }, select: { desde: true, precioVenta: true } },
      },
      orderBy: { nombre: 'asc' },
    }),
    prisma.categoria.findMany({
      where: { tenantId: sesion.tenantId, activo: true },
      orderBy: { nombre: 'asc' },
      select: { id: true, nombre: true, icono: true },
    }),
    cajaAbierta(sesion.tenantId, sesion.sub),
  ])
  // Sin control de caja (Configuración → Operación) se vende sin abrirla.
  const puedeVender = !(await usaControlCaja(sesion.tenantId)) || !!apertura

  const productosPlanos = productos.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    codigoBarras: p.codigoBarras,
    codigoBalanza: p.codigoBalanza,
    categoriaNombre: p.categoria?.nombre ?? null,
    categoriaId: p.categoriaId,
    precioVenta: Number(p.precioVenta),
    ivaPorcentaje: Number(p.ivaPorcentaje),
    stock: Number(p.stock),
    unidad: p.unidad,
    imagen: p.imagen,
    presentaciones: p.presentaciones.map((x) => ({ id: x.id, nombre: x.nombre, factor: Number(x.factor), codigoBarras: x.codigoBarras, precioVenta: Number(x.precioVenta) })),
    escalas: p.preciosEscala.map((e) => ({ desde: Number(e.desde), precioVenta: Number(e.precioVenta) })),
  }))

  return (
    <POSClient
      productos={productosPlanos}
      categorias={categorias.map((c) => ({ id: c.id, nombre: c.nombre, icono: c.icono }))}
      cajaAbierta={puedeVender}
      balanza={await leerConfigBalanza(sesion.tenantId)}
      promociones={await promocionesDeHoy(sesion.tenantId)}
      cajasLibres={puedeVender ? null : await cajasLibresPara(sesion.tenantId)}
    />
  )
}

/** Varias cajas: las activas que nadie tiene abiertas (null en modo una sola caja). */
async function cajasLibresPara(tenantId: string) {
  if (!(await usaVariasCajas(tenantId))) return null
  const [cajas, abiertas] = await Promise.all([
    prisma.caja.findMany({ where: { tenantId, activa: true }, orderBy: { nombre: 'asc' }, select: { id: true, nombre: true } }),
    prisma.aperturaCaja.findMany({ where: { tenantId, cerradaAt: null }, select: { cajaId: true } }),
  ])
  const ocupadas = new Set(abiertas.map((a) => a.cajaId))
  return cajas.filter((c) => !ocupadas.has(c.id))
}
