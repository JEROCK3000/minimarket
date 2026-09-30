import { NextRequest, NextResponse } from 'next/server'
import { requerirTenant } from '@/lib/auth/tenant'
import { prisma } from '@/lib/db/prisma'
import { leerImagenProducto } from '@/lib/productos/imagenes'

// GET /api/productos/:id/imagen — imagen WebP del producto, solo para usuarios del mismo tenant.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let sesion
  try {
    sesion = await requerirTenant()
  } catch {
    return new NextResponse(null, { status: 401 })
  }
  const { id } = await ctx.params
  const producto = await prisma.producto.findFirst({ where: { id, tenantId: sesion.tenantId }, select: { imagen: true } })
  if (!producto?.imagen) return new NextResponse(null, { status: 404 })
  const datos = await leerImagenProducto(sesion.tenantId, producto.imagen)
  if (!datos) return new NextResponse(null, { status: 404 })
  return new NextResponse(new Uint8Array(datos), {
    headers: {
      'Content-Type': 'image/webp',
      // La URL lleva ?v=<archivo>: cambia al reemplazar la imagen, así que se puede cachear.
      'Cache-Control': 'private, max-age=604800, immutable',
    },
  })
}
