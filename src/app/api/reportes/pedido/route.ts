import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { registrarLog } from '@/lib/logs/logger'
import { responderReporte } from '@/lib/reports/tabla'
import { contextoReporte, noAutorizado, errorReporte } from '../_comun'

const schema = z.object({
  formato: z.enum(['excel', 'pdf']),
  proveedorId: z.string().max(40).optional().or(z.literal('')),
  items: z.array(z.object({ productoId: z.string().min(1).max(40), cantidad: z.number().positive().max(9999999), empaques: z.number().int().positive().max(999999).nullable().optional(), factor: z.number().positive().max(100000).optional() })).min(1).max(3000),
})

// POST /api/reportes/pedido — pedido al proveedor (Excel/PDF) con las cantidades revisadas (solo ADMIN).
// Nombres y costos se leen de la BD (no se confía en lo que manda el navegador).
export async function POST(request: NextRequest) {
  const ctx = await contextoReporte('ADMIN')
  if (!ctx) return noAutorizado()
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const d = parsed.data
  try {
    const [productos, prov] = await Promise.all([
      prisma.producto.findMany({ where: { tenantId: ctx.sesion.tenantId, id: { in: d.items.map((i) => i.productoId) } }, select: { id: true, nombre: true, unidad: true, precioCompra: true, codigoBarras: true } }),
      d.proveedorId ? prisma.proveedor.findFirst({ where: { id: d.proveedorId, tenantId: ctx.sesion.tenantId }, select: { nombre: true, identificacion: true } }) : null,
    ])
    const porId = new Map(productos.map((p) => [p.id, p]))
    const filas = d.items.filter((i) => porId.has(i.productoId)).map((i) => {
      const p = porId.get(i.productoId)!
      return { p, i, costo: Number(p.precioCompra), subtotal: i.cantidad * Number(p.precioCompra) }
    })
    const total = filas.reduce((s, f) => s + f.subtotal, 0)
    await registrarLog('AUDIT', 'COMPRAS', `Pedido sugerido exportado (${d.formato}, ${filas.length} productos) por ${ctx.sesion.email}`, undefined, ctx.sesion.tenantId)
    return responderReporte({
      formato: d.formato, empresa: ctx.empresa, archivo: 'pedido_proveedor',
      titulo: `Pedido${prov ? ` a ${prov.nombre}` : ''}`,
      subtitulo: `${prov?.identificacion ? `RUC ${prov.identificacion} | ` : ''}${filas.length} producto(s) | valores referenciales al último costo`,
      columnas: [
        { header: 'Producto', ancho: 36 }, { header: 'Código', ancho: 16 }, { header: 'Cantidad', tipo: 'numero', ancho: 11 },
        { header: 'Unidad', ancho: 12 }, { header: 'Empaques', ancho: 14 }, { header: 'Costo ref.', tipo: 'moneda', ancho: 12 }, { header: 'Subtotal', tipo: 'moneda', ancho: 13 },
      ],
      filas: filas.map((f) => [f.p.nombre, f.p.codigoBarras ?? '', f.i.cantidad, f.p.unidad, f.i.empaques && f.i.factor ? `${f.i.empaques} x ${f.i.factor}` : '', f.costo, f.subtotal]),
      totales: ['TOTAL ESTIMADO', null, null, null, null, null, total],
    })
  } catch (error) {
    return errorReporte('pedido', error, ctx.sesion.tenantId)
  }
}
