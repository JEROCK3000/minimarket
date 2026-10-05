'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { leerFacturaProveedor, codigoArticulo, normalizarNombre, ErrorXmlFactura, TAMANO_MAX_XML, type FacturaProveedor } from '@/lib/compras/xml-factura'
import { descargarFacturaPorClave } from '@/lib/compras/sri-descarga'

export type Coincidencia = 'APRENDIDO' | 'CODIGO_BARRAS' | 'NOMBRE' | null

export interface LineaXml {
  codigo: string // código del artículo en el proveedor (se aprende al guardar)
  codigoBarras: string // candidato a código de barras para crear el producto
  descripcion: string
  cantidad: number
  costoUnitario: number
  ivaPorcentaje: number
  subtotal: number
  productoId: string | null
  coincidencia: Coincidencia
  factor: number // unidades por empaque (aprendido; 1 por defecto)
}

export interface CompraDesdeXml {
  claveAcceso: string
  numFactura: string
  fechaEmision: string
  proveedor: FacturaProveedor['proveedor'] & { id: string | null; nombreRegistrado: string | null }
  totales: FacturaProveedor['totales']
  lineas: LineaXml[]
  avisos: string[]
  duplicada: string | null // número de la compra ya registrada con esta factura
}

const pareceCodigoBarras = (c: string) => /^\d{8,14}$/.test(c)

/**
 * Lee una factura de proveedor (archivo XML o clave de acceso → SRI) y prepara
 * la compra: proveedor existente o nuevo, productos reconocidos (equivalencia
 * aprendida, código de barras o nombre) y avisos. No guarda nada.
 */
export async function leerFacturaCompraAction(formData: FormData): Promise<{ success: true; compra: CompraDesdeXml } | { error: string }> {
  const sesion = await requerirTenant('ADMIN')
  try {
    let xml: string
    const clave = String(formData.get('clave') ?? '').replace(/\D/g, '')
    const archivo = formData.get('xml')
    if (clave) {
      xml = await descargarFacturaPorClave(clave)
    } else if (archivo instanceof File && archivo.size > 0) {
      if (archivo.size > TAMANO_MAX_XML) return { error: 'El XML pesa más de 2 MB' }
      if (!/\.xml$/i.test(archivo.name) && !/xml/.test(archivo.type)) return { error: 'Sube el archivo .xml de la factura' }
      xml = await archivo.text()
    } else {
      return { error: 'Sube el XML o escribe la clave de acceso' }
    }
    const f = leerFacturaProveedor(xml)
    const t = sesion.tenantId
    const avisos: string[] = []

    // Proveedor por RUC (o por la cédula, si lo registraron así)
    const prov = await prisma.proveedor.findFirst({
      where: { tenantId: t, identificacion: { in: [f.proveedor.ruc, f.proveedor.ruc.slice(0, 10)] } },
      select: { id: true, nombre: true },
    })

    // ¿Ya se registró? (por clave de acceso o por proveedor + nº de factura)
    const previa = await prisma.compra.findFirst({
      where: {
        tenantId: t, estado: 'ACTIVA',
        OR: [
          ...(f.claveAcceso ? [{ claveAcceso: f.claveAcceso }] : []),
          ...(prov ? [{ proveedorId: prov.id, numFactura: f.numFactura }] : []),
        ],
      },
      select: { numero: true },
    })

    // ¿La factura es para este negocio?
    const [emisor, tenant] = await Promise.all([
      prisma.emisorSRI.findFirst({ where: { tenantId: t }, select: { ruc: true } }),
      prisma.tenant.findUnique({ where: { id: t }, select: { ruc: true } }),
    ])
    const rucPropio = emisor?.ruc || tenant?.ruc
    if (rucPropio && f.comprador.identificacion && f.comprador.identificacion !== rucPropio && f.comprador.identificacion !== rucPropio.slice(0, 10)) {
      avisos.push(`La factura está a nombre de ${f.comprador.razonSocial || f.comprador.identificacion} (${f.comprador.identificacion}), no de tu negocio.`)
    }
    if (f.ambiente === '1') avisos.push('Es una factura de AMBIENTE DE PRUEBAS del SRI: no tiene validez tributaria.')

    // Reconocer productos: 1) equivalencia aprendida 2) código de barras 3) nombre exacto
    const codigos = f.items.map(codigoArticulo)
    const aprendidos = await prisma.productoCodigoProveedor.findMany({
      where: { tenantId: t, proveedorRuc: f.proveedor.ruc, codigo: { in: codigos }, producto: { activo: true } },
      select: { codigo: true, productoId: true, factor: true },
    })
    const porAprendido = new Map(aprendidos.map((a) => [a.codigo, a]))
    const candidatosBarras = [...new Set(f.items.flatMap((i) => [i.codigoAuxiliar, i.codigoPrincipal]).filter(Boolean))]
    const porBarras = new Map(
      (await prisma.producto.findMany({ where: { tenantId: t, activo: true, codigoBarras: { in: candidatosBarras } }, select: { id: true, codigoBarras: true } }))
        .map((p) => [p.codigoBarras!, p.id]),
    )
    let porNombre: Map<string, string> | null = null

    const lineas: LineaXml[] = []
    for (const it of f.items) {
      const codigo = codigoArticulo(it)
      const base = {
        codigo, descripcion: it.descripcion, cantidad: it.cantidad, costoUnitario: it.costoUnitario, ivaPorcentaje: it.ivaPorcentaje, subtotal: it.subtotal,
        codigoBarras: [it.codigoAuxiliar, it.codigoPrincipal].find(pareceCodigoBarras) ?? '',
      }
      const ap = porAprendido.get(codigo)
      if (ap) { lineas.push({ ...base, productoId: ap.productoId, coincidencia: 'APRENDIDO', factor: Number(ap.factor) || 1 }); continue }
      const idBarras = porBarras.get(it.codigoAuxiliar) ?? porBarras.get(it.codigoPrincipal)
      if (idBarras) { lineas.push({ ...base, productoId: idBarras, coincidencia: 'CODIGO_BARRAS', factor: 1 }); continue }
      if (!porNombre) {
        const todos = await prisma.producto.findMany({ where: { tenantId: t, activo: true }, select: { id: true, nombre: true } })
        porNombre = new Map(todos.map((p) => [normalizarNombre(p.nombre), p.id]))
      }
      const idNombre = porNombre.get(normalizarNombre(it.descripcion))
      lineas.push({ ...base, productoId: idNombre ?? null, coincidencia: idNombre ? 'NOMBRE' : null, factor: 1 })
    }

    await registrarLog('INFO', 'COMPRAS', `Factura de proveedor leída ${f.numFactura} (${lineas.length} ítems, ${lineas.filter((l) => l.productoId).length} reconocidos) vía ${clave ? 'clave SRI' : 'XML'}`, undefined, t)
    return {
      success: true,
      compra: {
        claveAcceso: f.claveAcceso, numFactura: f.numFactura, fechaEmision: f.fechaEmision,
        proveedor: { ...f.proveedor, id: prov?.id ?? null, nombreRegistrado: prov?.nombre ?? null },
        totales: f.totales, lineas, avisos, duplicada: previa?.numero ?? null,
      },
    }
  } catch (error: any) {
    if (error instanceof ErrorXmlFactura) return { error: error.message }
    await registrarLog('ERROR', 'COMPRAS', `Error leyendo factura de proveedor: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo leer la factura' }
  }
}
