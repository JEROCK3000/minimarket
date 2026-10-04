import { prisma } from '@/lib/db/prisma'

/**
 * Suscripción SaaS de un minimarket (misma lógica que SmartianERP: BillingService
 * + BillingMiddleware), adaptada: GRACIA y SUSPENDIDO NO se guardan, se CALCULAN
 * con la fecha de vencimiento en cada consulta. Así no depende de un cron diario.
 *
 *   CANCELADO                    → sin acceso (ni login)
 *   suspensión manual            → SUSPENDIDO (decidida por el superadmin)
 *   sin fechaExpiracion          → estado guardado (ACTIVO / PRUEBA), sin vencimiento
 *   hasta fechaExpiracion        → ACTIVO / PRUEBA
 *   hasta 3 días después         → GRACIA (acceso completo + aviso)
 *   después                      → SUSPENDIDO (consulta sí; vender, facturar, crear no)
 *
 * Solo servidor: recibe tenantId, no es server action.
 */
export const DIAS_GRACIA = 3
export const DIAS_AVISO = 7
const DIA = 86400000

export type EstadoSuscripcion = 'PRUEBA' | 'ACTIVO' | 'GRACIA' | 'SUSPENDIDO' | 'CANCELADO'

export interface Suscripcion {
  estado: EstadoSuscripcion
  /** Días hasta el vencimiento (negativo si ya venció); null si no vence */
  diasRestantes: number | null
  fechaExpiracion: Date | null
  graciaHasta: Date | null
  plan: { nombre: string; maxUsuarios: number | null; maxProductos: number | null; maxFacturasMes: number | null } | null
}

export function calcularEstado(
  t: { estado: string; suspendidoManual: boolean; fechaExpiracion: Date | null },
  ahora = new Date(),
): Pick<Suscripcion, 'estado' | 'diasRestantes' | 'graciaHasta'> {
  if (t.estado === 'CANCELADO') return { estado: 'CANCELADO', diasRestantes: null, graciaHasta: null }
  const base: EstadoSuscripcion = t.estado === 'PRUEBA' ? 'PRUEBA' : 'ACTIVO'
  const venc = t.fechaExpiracion
  const diasRestantes = venc ? Math.ceil((venc.getTime() - ahora.getTime()) / DIA) : null
  const graciaHasta = venc ? new Date(venc.getTime() + DIAS_GRACIA * DIA) : null
  if (t.suspendidoManual) return { estado: 'SUSPENDIDO', diasRestantes, graciaHasta }
  if (!venc || ahora <= venc) return { estado: base, diasRestantes, graciaHasta }
  if (graciaHasta && ahora <= graciaHasta) return { estado: 'GRACIA', diasRestantes, graciaHasta }
  return { estado: 'SUSPENDIDO', diasRestantes, graciaHasta }
}

export async function obtenerSuscripcion(tenantId: string): Promise<Suscripcion> {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      estado: true, suspendidoManual: true, fechaExpiracion: true,
      plan: { select: { nombre: true, maxUsuarios: true, maxProductos: true, maxFacturasMes: true } },
    },
  })
  if (!t) return { estado: 'CANCELADO', diasRestantes: null, fechaExpiracion: null, graciaHasta: null, plan: null }
  return { ...calcularEstado(t), fechaExpiracion: t.fechaExpiracion, plan: t.plan }
}

/**
 * Para acciones que CREAN u OPERAN (vender, facturar, nota de crédito, crear
 * productos/compras/usuarios). Devuelve el mensaje de bloqueo o null si se
 * puede operar. Consultar, descargar RIDE/XML y reportes nunca se bloquean.
 */
export async function bloqueoPorSuscripcion(tenantId: string): Promise<string | null> {
  const s = await obtenerSuscripcion(tenantId)
  if (s.estado === 'CANCELADO') return 'La cuenta de este negocio está cancelada.'
  if (s.estado === 'SUSPENDIDO') {
    return 'Tu suscripción está suspendida: puedes consultar tu información, pero no vender, facturar ni registrar. Contacta a Solinteec para reactivarla.'
  }
  return null
}

export type Recurso = 'usuarios' | 'productos' | 'facturasMes'

/** Verifica el límite del plan para un recurso. Devuelve el mensaje o null. */
export async function limiteDelPlan(tenantId: string, recurso: Recurso, agregar = 1): Promise<string | null> {
  const s = await obtenerSuscripcion(tenantId)
  const max = recurso === 'usuarios' ? s.plan?.maxUsuarios : recurso === 'productos' ? s.plan?.maxProductos : s.plan?.maxFacturasMes
  if (max === null || max === undefined) return null // sin plan o ilimitado
  let usados: number
  if (recurso === 'usuarios') usados = await prisma.usuario.count({ where: { tenantId, activo: true } })
  else if (recurso === 'productos') usados = await prisma.producto.count({ where: { tenantId, activo: true } })
  else {
    const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0)
    usados = await prisma.facturaSRI.count({ where: { tenantId, estado: 'AUTORIZADA', fechaAutorizacion: { gte: inicioMes } } })
  }
  if (usados + agregar <= max) return null
  const nombre = recurso === 'usuarios' ? 'usuarios activos' : recurso === 'productos' ? 'productos' : 'facturas este mes'
  return `Tu plan ${s.plan?.nombre ?? ''} permite hasta ${max} ${nombre} (tienes ${usados}). Mejora tu plan para continuar.`
}
