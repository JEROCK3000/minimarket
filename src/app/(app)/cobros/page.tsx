import type { Metadata } from 'next'
import { requerirTenant } from '@/lib/auth/tenant'
import { prisma } from '@/lib/db/prisma'
import { CobrosClient } from './CobrosClient'

export const metadata: Metadata = { title: 'Cobros (fiado)' }

export default async function CobrosPage() {
  const sesion = await requerirTenant()
  const ventas = await prisma.venta.findMany({
    where: { tenantId: sesion.tenantId, estado: 'COMPLETADA', saldoPendiente: { gt: 0 }, clienteId: { not: null } },
    select: { clienteId: true, fecha: true, saldoPendiente: true, diasCredito: true, cliente: { select: { nombre: true, identificacion: true, telefono: true } } },
  })
  const ahora = Date.now()
  const por = new Map<string, { id: string; nombre: string; identificacion: string; telefono: string | null; saldo: number; ventas: number; vencido: number; masAntigua: string }>()
  for (const v of ventas) {
    const c = por.get(v.clienteId!) ?? {
      id: v.clienteId!, nombre: v.cliente!.nombre, identificacion: v.cliente!.identificacion, telefono: v.cliente!.telefono,
      saldo: 0, ventas: 0, vencido: 0, masAntigua: v.fecha.toISOString(),
    }
    const saldo = Number(v.saldoPendiente)
    c.saldo += saldo
    c.ventas++
    if (v.diasCredito != null && v.fecha.getTime() + v.diasCredito * 86400000 < ahora) c.vencido += saldo
    if (v.fecha.toISOString() < c.masAntigua) c.masAntigua = v.fecha.toISOString()
    por.set(v.clienteId!, c)
  }
  const clientes = [...por.values()].sort((a, b) => b.saldo - a.saldo)
  return <CobrosClient clientes={clientes} />
}
