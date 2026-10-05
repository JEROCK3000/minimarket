/**
 * Pedido sugerido (solo servidor; recibe tenantId, NO es server action).
 *   venta diaria = (vendido − devuelto en los últimos `dias`) / dias
 *   necesario    = venta diaria × cobertura + stock mínimo − stock actual
 * Se redondea hacia arriba (enteros para "unidad", décimas para peso/volumen)
 * y, si se aprendió el empaque del proveedor (XML), a empaques completos.
 */
import { prisma } from '@/lib/db/prisma'

export interface LineaPedido {
  productoId: string; nombre: string; unidad: string; stock: number; stockMinimo: number
  ventaDiaria: number; sugerido: number; factor: number; empaques: number | null; costo: number
}

const redondearArriba = (n: number, unidad: string) => (unidad === 'unidad' ? Math.ceil(n - 1e-9) : Math.ceil(n * 10 - 1e-9) / 10)

export async function calcularPedidoSugerido(tenantId: string, opciones: { proveedorId?: string; dias: number; cobertura: number }) {
  const desde = new Date(Date.now() - opciones.dias * 86400000)
  let productoIds: string[] | undefined
  let rucProveedor: string | null = null
  if (opciones.proveedorId) {
    const prov = await prisma.proveedor.findFirst({ where: { id: opciones.proveedorId, tenantId }, select: { identificacion: true } })
    if (!prov) return null
    rucProveedor = prov.identificacion
    const comprados = await prisma.compraItem.findMany({
      where: { compra: { tenantId, estado: 'ACTIVA', proveedorId: opciones.proveedorId } }, select: { productoId: true }, distinct: ['productoId'],
    })
    productoIds = comprados.map((c) => c.productoId)
  }
  const [productos, vendidos, devueltos, empaques] = await Promise.all([
    prisma.producto.findMany({
      where: { tenantId, activo: true, ...(productoIds ? { id: { in: productoIds } } : {}) },
      select: { id: true, nombre: true, unidad: true, stock: true, stockMinimo: true, precioCompra: true }, orderBy: { nombre: 'asc' },
    }),
    prisma.ventaItem.groupBy({ by: ['productoId'], where: { venta: { tenantId, estado: 'COMPLETADA', fecha: { gte: desde } } }, _sum: { cantidad: true } }),
    prisma.devolucionItem.groupBy({ by: ['productoId'], where: { devolucion: { tenantId, createdAt: { gte: desde } } }, _sum: { cantidad: true } }),
    rucProveedor
      ? prisma.productoCodigoProveedor.findMany({ where: { tenantId, proveedorRuc: rucProveedor, factor: { gt: 1 } }, select: { productoId: true, factor: true } })
      : Promise.resolve([] as { productoId: string; factor: unknown }[]),
  ])
  const vendido = new Map(vendidos.map((v) => [v.productoId, Number(v._sum.cantidad ?? 0)]))
  const devuelto = new Map(devueltos.map((v) => [v.productoId, Number(v._sum.cantidad ?? 0)]))
  const factorDe = new Map(empaques.map((e) => [e.productoId, Number(e.factor)]))

  const lineas: LineaPedido[] = productos.map((p) => {
    const ventaDiaria = Math.max(0, (vendido.get(p.id) ?? 0) - (devuelto.get(p.id) ?? 0)) / opciones.dias
    const necesario = ventaDiaria * opciones.cobertura + Number(p.stockMinimo) - Number(p.stock)
    const factor = factorDe.get(p.id) ?? 1
    let sugerido = necesario > 0 ? redondearArriba(necesario, p.unidad) : 0
    let empaquesN: number | null = null
    if (sugerido > 0 && factor > 1) { empaquesN = Math.ceil(sugerido / factor - 1e-9); sugerido = empaquesN * factor }
    return {
      productoId: p.id, nombre: p.nombre, unidad: p.unidad, stock: Number(p.stock), stockMinimo: Number(p.stockMinimo),
      ventaDiaria, sugerido, factor, empaques: empaquesN, costo: Number(p.precioCompra),
    }
  })
  return lineas
}
