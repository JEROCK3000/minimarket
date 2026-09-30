import { NextResponse } from 'next/server'
import { requerirTenant } from '@/lib/auth/tenant'
import { prisma } from '@/lib/db/prisma'
import { registrarLog } from '@/lib/logs/logger'

/** Sesión + nombre de la empresa para un reporte; `null` si no está autorizado. */
export async function contextoReporte(rol?: 'ADMIN') {
  try {
    const sesion = await requerirTenant(rol)
    const tenant = await prisma.tenant.findUnique({ where: { id: sesion.tenantId }, select: { nombre: true } })
    return { sesion, empresa: tenant?.nombre || 'MiniMarket' }
  } catch {
    return null
  }
}

export const noAutorizado = () => NextResponse.json({ error: 'No autorizado' }, { status: 401 })

export async function errorReporte(nombre: string, error: any, tenantId?: string) {
  await registrarLog('ERROR', 'REPORTES', `Error reporte ${nombre}: ${error?.message || error}`, undefined, tenantId)
  return NextResponse.json({ error: 'No se pudo generar el reporte' }, { status: 500 })
}

export const formatoDe = (sp: URLSearchParams) => (sp.get('formato') === 'pdf' ? 'pdf' : 'excel') as 'pdf' | 'excel'
