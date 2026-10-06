/**
 * Resumen diario del negocio para el dueño (solo servidor; recibe tenantId, NO
 * es server action). Lo usan el envío automático (/api/cron/resumen-diario) y
 * el botón "Enviar ahora" de Configuración → Operación.
 */
import { prisma } from '@/lib/db/prisma'
import { calcularVenta } from '@/lib/ventas/totales'
import { vencimientosEnStock } from '@/lib/inventario/vencimientos'
import { CATEGORIAS_MERMA, esCategoriaMerma } from '@/lib/inventario/mermas'
import { hoyLocalISO } from '@/lib/utils/fechas'

export const CLAVE_RESUMEN = 'resumen_diario'
export const CLAVE_RESUMEN_ULTIMO = 'resumen_diario_ultimo'

export interface ConfigResumen { activo: boolean; emails: string[]; hora: number }
export function normalizarConfigResumen(v: unknown): ConfigResumen {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<ConfigResumen>
  const emails = Array.isArray(o.emails) ? o.emails.map(String).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)).slice(0, 3) : []
  const hora = Number(o.hora)
  return { activo: o.activo === true && emails.length > 0, emails, hora: Number.isInteger(hora) && hora >= 0 && hora <= 23 ? hora : 21 }
}
export async function leerConfigResumen(tenantId: string) {
  const c = await prisma.config.findFirst({ where: { tenantId, clave: CLAVE_RESUMEN }, select: { valor: true } })
  try { return normalizarConfigResumen(c ? JSON.parse(c.valor) : null) } catch { return normalizarConfigResumen(null) }
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** Datos del día `dia` (YYYY-MM-DD, hora local del servidor = Ecuador). */
export async function calcularResumenDiario(tenantId: string, dia: string) {
  const desde = new Date(`${dia}T00:00:00`)
  const hasta = new Date(`${dia}T23:59:59.999`)
  const rango = { gte: desde, lte: hasta }
  const [ventas, devoluciones, gastos, cierres, retiros, mermas, abonos, productos, vencen, fiados] = await Promise.all([
    prisma.venta.findMany({
      where: { tenantId, estado: 'COMPLETADA', fecha: rango },
      select: { total: true, descuento: true, formaPago: true, items: { select: { productoId: true, cantidad: true, precioUnitario: true, costoUnitario: true, factor: true, producto: { select: { nombre: true, ivaPorcentaje: true, precioCompra: true } } } } },
    }),
    prisma.devolucion.findMany({ where: { tenantId, createdAt: rango }, select: { total: true, reingresaStock: true, items: { select: { base: true, cantidad: true, ventaItem: { select: { costoUnitario: true } } } } } }),
    prisma.gasto.aggregate({ where: { tenantId, fecha: rango }, _sum: { monto: true }, _count: true }),
    prisma.cierreCaja.findMany({ where: { tenantId, createdAt: rango }, select: { usuarioNombre: true, diferencia: true, efectivoContado: true } }),
    prisma.movimientoCaja.aggregate({ where: { tenantId, tipo: 'RETIRO', createdAt: rango }, _sum: { monto: true } }),
    prisma.movimientoInventario.findMany({
      where: { tenantId, createdAt: rango, cantidad: { lt: 0 }, OR: [{ tipo: 'MERMA' }, { categoria: { not: null } }] },
      select: { cantidad: true, costoUnitario: true, categoria: true, producto: { select: { precioCompra: true } } },
    }),
    prisma.abonoVenta.aggregate({ where: { tenantId, createdAt: rango }, _sum: { monto: true } }),
    prisma.producto.findMany({ where: { tenantId, activo: true }, select: { nombre: true, stock: true, stockMinimo: true } }),
    vencimientosEnStock(tenantId, 7),
    prisma.venta.findMany({ where: { tenantId, estado: 'COMPLETADA', formaPago: 'CREDITO', saldoPendiente: { gt: 0 } }, select: { fecha: true, diasCredito: true, saldoPendiente: true } }),
  ])

  const porForma = new Map<string, number>()
  let venta = 0, base = 0, costo = 0
  const porProducto = new Map<string, { nombre: string; base: number }>()
  for (const v of ventas) {
    venta += Number(v.total)
    porForma.set(v.formaPago, (porForma.get(v.formaPago) ?? 0) + Number(v.total))
    const calc = calcularVenta(v.items.map((it) => ({ cantidad: Number(it.cantidad), precioUnitario: Number(it.precioUnitario), ivaPorcentaje: Number(it.producto.ivaPorcentaje) })), Number(v.descuento))
    v.items.forEach((it, i) => {
      const b = calc.lineas[i].base
      base += b
      costo += Number(it.cantidad) * (it.costoUnitario != null ? Number(it.costoUnitario) : Number(it.producto.precioCompra) * Number(it.factor))
      const p = porProducto.get(it.productoId) ?? { nombre: it.producto.nombre, base: 0 }
      p.base += b
      porProducto.set(it.productoId, p)
    })
  }
  let devuelto = 0
  for (const d of devoluciones) {
    devuelto += Number(d.total)
    for (const it of d.items) {
      base -= Number(it.base)
      if (d.reingresaStock && it.ventaItem.costoUnitario != null) costo -= Number(it.cantidad) * Number(it.ventaItem.costoUnitario)
    }
  }
  const perdidaMermas = new Map<string, number>()
  for (const m of mermas) {
    const valor = -Number(m.cantidad) * (m.costoUnitario != null ? Number(m.costoUnitario) : Number(m.producto.precioCompra))
    const t = m.categoria && esCategoriaMerma(m.categoria) ? CATEGORIAS_MERMA[m.categoria] : 'Sin clasificar'
    perdidaMermas.set(t, (perdidaMermas.get(t) ?? 0) + valor)
  }
  const ahora = Date.now()
  const carteraVencida = fiados
    .filter((f) => f.fecha.getTime() + (f.diasCredito ?? 30) * 86400000 < ahora)
    .reduce((s, f) => s + Number(f.saldoPendiente), 0)

  return {
    dia,
    ventas: { cantidad: ventas.length, total: r2(venta), devuelto: r2(devuelto), neto: r2(venta - devuelto), porForma: [...porForma.entries()].map(([f, t]) => ({ forma: f, total: r2(t) })) },
    utilidadEstimada: r2(base - costo),
    gastos: { total: r2(Number(gastos._sum.monto ?? 0)), cantidad: gastos._count },
    cierres: cierres.map((c) => ({ usuario: c.usuarioNombre ?? '—', diferencia: r2(Number(c.diferencia)), contado: r2(Number(c.efectivoContado)) })),
    retiros: r2(Number(retiros._sum.monto ?? 0)),
    mermas: { total: r2([...perdidaMermas.values()].reduce((a, b) => a + b, 0)), porTipo: [...perdidaMermas.entries()].map(([t, v]) => ({ tipo: t, valor: r2(v) })) },
    cobrosFiado: r2(Number(abonos._sum.monto ?? 0)),
    carteraVencida: r2(carteraVencida),
    agotados: productos.filter((p) => Number(p.stock) <= 0).map((p) => p.nombre),
    bajoMinimo: productos.filter((p) => Number(p.stock) > 0 && Number(p.stock) <= Number(p.stockMinimo)).map((p) => p.nombre),
    porVencer: vencen.map((v) => ({ nombre: v.nombre, dias: v.dias })),
    top: [...porProducto.values()].sort((a, b) => b.base - a.base).slice(0, 5).map((p) => ({ nombre: p.nombre, base: r2(p.base) })),
  }
}
export type ResumenDiario = Awaited<ReturnType<typeof calcularResumenDiario>>

/** Día a resumir según la hora de envío: por la mañana (antes de las 12) se envía el de ayer. */
export function diaAResumir(hora: number, ahora = new Date()) {
  if (hora >= 12) return hoyLocalISO(ahora)
  const ayer = new Date(ahora); ayer.setDate(ayer.getDate() - 1)
  return hoyLocalISO(ayer)
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const usd = (n: number) => `$${n.toFixed(2)}`
const FORMA: Record<string, string> = { EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', TRANSFERENCIA: 'Transferencia', CREDITO: 'Fiado' }

/** Correo HTML (estilos en línea para clientes de correo). */
export function htmlResumen(r: ResumenDiario, negocio: string) {
  const fecha = new Date(`${r.dia}T12:00:00`).toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const fila = (k: string, v: string, color = '#111827') => `<tr><td style="padding:6px 0;color:#6b7280;font-size:13px">${k}</td><td style="padding:6px 0;text-align:right;font-weight:bold;color:${color};font-size:13px">${v}</td></tr>`
  const seccion = (titulo: string, cuerpo: string) => `<h2 style="font-size:14px;color:#2563eb;margin:22px 0 6px;border-bottom:1px solid #e5e7eb;padding-bottom:4px">${titulo}</h2>${cuerpo}`
  const lista = (items: string[], max = 10) => items.length === 0 ? '<p style="font-size:13px;color:#9ca3af;margin:4px 0">Ninguno 👍</p>'
    : `<p style="font-size:13px;color:#374151;margin:4px 0;line-height:1.6">${items.slice(0, max).map(esc).join(' · ')}${items.length > max ? ` <span style="color:#9ca3af">y ${items.length - max} más</span>` : ''}</p>`
  const tarjeta = (t: string, v: string, color: string) => `<td style="width:33%;padding:10px;background:#f9fafb;border-radius:10px;text-align:center"><div style="font-size:11px;color:#6b7280">${t}</div><div style="font-size:20px;font-weight:900;color:${color}">${v}</div></td>`
  return `
<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:14px;color:#111827">
  <h1 style="font-size:20px;margin:0">${esc(negocio)}</h1>
  <p style="margin:2px 0 16px;color:#6b7280;font-size:13px">Resumen del ${esc(fecha)}</p>
  <table style="width:100%;border-spacing:6px"><tr>
    ${tarjeta('Ventas netas', usd(r.ventas.neto), '#16a34a')}${tarjeta('Utilidad estimada', usd(r.utilidadEstimada), '#2563eb')}${tarjeta('Gastos', usd(r.gastos.total), '#d97706')}
  </tr></table>
  ${seccion('Ventas', `<table style="width:100%">${fila('Ventas', `${r.ventas.cantidad} · ${usd(r.ventas.total)}`)}${r.ventas.porForma.map((f) => fila(`· ${FORMA[f.forma] ?? f.forma}`, usd(f.total), '#374151')).join('')}${r.ventas.devuelto > 0 ? fila('Devoluciones', `−${usd(r.ventas.devuelto)}`, '#dc2626') : ''}${r.cobrosFiado > 0 ? fila('Cobros de fiado', usd(r.cobrosFiado)) : ''}</table>`)}
  ${r.top.length ? seccion('Lo más vendido', `<table style="width:100%">${r.top.map((t, i) => fila(`${i + 1}. ${esc(t.nombre)}`, usd(t.base), '#374151')).join('')}</table>`) : ''}
  ${seccion('Caja', r.cierres.length === 0 ? '<p style="font-size:13px;color:#9ca3af;margin:4px 0">Sin cierres de caja este día.</p>'
    : `<table style="width:100%">${r.cierres.map((c) => fila(`Cierre de ${esc(c.usuario)}`, Math.abs(c.diferencia) < 0.01 ? 'Cuadrada ✓' : c.diferencia > 0 ? `Sobrante ${usd(c.diferencia)}` : `Faltante ${usd(-c.diferencia)}`, Math.abs(c.diferencia) < 0.01 ? '#16a34a' : '#dc2626')).join('')}${r.retiros > 0 ? fila('Retiros de efectivo', usd(r.retiros)) : ''}</table>`)}
  ${r.mermas.total > 0 ? seccion('Mermas', `<table style="width:100%">${r.mermas.porTipo.map((m) => fila(esc(m.tipo), usd(m.valor), '#dc2626')).join('')}</table>`) : ''}
  ${seccion(`Agotados (${r.agotados.length})`, lista(r.agotados))}
  ${seccion(`Bajo el stock mínimo (${r.bajoMinimo.length})`, lista(r.bajoMinimo))}
  ${seccion(`Vencen en 7 días o vencidos (${r.porVencer.length})`, lista(r.porVencer.map((v) => `${v.nombre} (${v.dias < 0 ? 'vencido' : v.dias === 0 ? 'hoy' : `${v.dias} d`})`)))}
  ${r.carteraVencida > 0 ? seccion('Fiado', `<table style="width:100%">${fila('Cartera vencida por cobrar', usd(r.carteraVencida), '#dc2626')}</table>`) : ''}
  <p style="font-size:11px;color:#9ca3af;margin-top:24px">Utilidad estimada = ventas sin IVA − costo de lo vendido (no incluye gastos). Resumen automático de ${esc(negocio)} · puedes desactivarlo en Configuración → Operación.</p>
</div>`
}

/** Calcula y envía el resumen de `dia` a los correos configurados. Lanza error si falla el SMTP. */
export async function enviarResumenTenant(tenantId: string, dia: string, emails: string[]) {
  const { enviarResumenDiario } = await import('@/lib/utils/email')
  const [r, tenant] = await Promise.all([calcularResumenDiario(tenantId, dia), prisma.tenant.findUnique({ where: { id: tenantId }, select: { nombre: true } })])
  const negocio = tenant?.nombre ?? 'MiniMarket'
  const fecha = new Date(`${dia}T12:00:00`).toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' })
  await enviarResumenDiario(tenantId, emails, `Resumen ${fecha} · ${negocio}: ventas ${`$${r.ventas.neto.toFixed(2)}`}`, htmlResumen(r, negocio))
  return r
}
