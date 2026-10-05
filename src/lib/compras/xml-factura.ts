import { XMLParser } from 'fast-xml-parser'

/**
 * Lectura de la factura electrónica (XML SRI) de un PROVEEDOR para cargar una
 * compra. Acepta el XML del comprobante (<factura>) o el de la autorización
 * (<autorizacion><comprobante><![CDATA[...]]>), con o sin prefijos de namespace.
 * Solo servidor. Sin DTD/entidades externas (se rechazan antes de parsear).
 */
export class ErrorXmlFactura extends Error {}

export interface ItemFacturaProveedor {
  codigoPrincipal: string
  codigoAuxiliar: string
  descripcion: string
  cantidad: number
  /** Costo unitario neto (precioTotalSinImpuesto / cantidad: ya incluye el descuento). */
  costoUnitario: number
  descuento: number
  subtotal: number
  ivaPorcentaje: number
}

export interface FacturaProveedor {
  claveAcceso: string
  ambiente: string // '1' pruebas | '2' producción
  proveedor: { ruc: string; razonSocial: string; nombreComercial: string; direccion: string }
  numFactura: string // 001-001-000000123
  fechaEmision: string // YYYY-MM-DD
  comprador: { identificacion: string; razonSocial: string }
  totales: { subtotal: number; descuento: number; iva: number; total: number }
  items: ItemFacturaProveedor[]
}

export const TAMANO_MAX_XML = 2 * 1024 * 1024
const MAX_ITEMS = 500

// Tarifa por código de porcentaje (tabla 17 del SRI) cuando el XML no trae <tarifa>.
const TARIFA_POR_CODIGO: Record<string, number> = { '0': 0, '2': 12, '3': 14, '4': 15, '5': 5, '6': 0, '7': 0, '8': 8, '10': 13 }

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false, // los códigos conservan ceros a la izquierda
  trimValues: true,
  processEntities: true,
  htmlEntities: false,
  isArray: (nombre) => ['detalle', 'impuesto', 'totalImpuesto', 'autorizacion'].includes(nombre),
})

const txt = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim())
const num = (v: unknown) => {
  const n = Number(txt(v).replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

/** Busca el nodo <factura> (o el texto de <comprobante> para volver a parsear). */
function buscar(nodo: any, profundidad = 0): { factura?: any; comprobante?: string } {
  if (!nodo || typeof nodo !== 'object' || profundidad > 8) return {}
  if (nodo.factura && typeof nodo.factura === 'object') return { factura: nodo.factura }
  if (typeof nodo.comprobante === 'string' && nodo.comprobante.includes('<')) return { comprobante: nodo.comprobante }
  for (const v of Object.values(nodo)) {
    for (const hijo of Array.isArray(v) ? v : [v]) {
      const r = buscar(hijo, profundidad + 1)
      if (r.factura || r.comprobante) return r
    }
  }
  return {}
}

function parsear(xml: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new ErrorXmlFactura('El archivo XML no es válido')
  try { return parser.parse(xml) } catch { throw new ErrorXmlFactura('El archivo no es un XML válido') }
}

export function leerFacturaProveedor(xml: string): FacturaProveedor {
  if (!xml || xml.length > TAMANO_MAX_XML) throw new ErrorXmlFactura('El XML está vacío o es demasiado grande')
  let r = buscar(parsear(xml.replace(/^﻿/, '')))
  if (!r.factura && r.comprobante) r = buscar(parsear(r.comprobante))
  const f = r.factura
  if (!f) throw new ErrorXmlFactura('El XML no contiene una factura electrónica del SRI')

  const it = f.infoTributaria ?? {}
  const inf = f.infoFactura ?? {}
  if (txt(it.codDoc) && txt(it.codDoc) !== '01') {
    throw new ErrorXmlFactura('El XML no es una factura (puede ser una nota de crédito, retención o guía)')
  }
  const ruc = txt(it.ruc)
  if (!/^\d{13}$/.test(ruc)) throw new ErrorXmlFactura('El XML no trae un RUC de proveedor válido')

  const [d, m, a] = txt(inf.fechaEmision).split('/')
  const fechaEmision = a && m && d ? `${a}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` : ''

  const detalles: any[] = f.detalles?.detalle ?? []
  if (detalles.length === 0) throw new ErrorXmlFactura('La factura no tiene productos')
  if (detalles.length > MAX_ITEMS) throw new ErrorXmlFactura(`La factura tiene más de ${MAX_ITEMS} productos`)

  const items: ItemFacturaProveedor[] = detalles.map((det) => {
    const cantidad = num(det.cantidad)
    const subtotal = num(det.precioTotalSinImpuesto)
    const iva = (det.impuestos?.impuesto ?? []).find((i: any) => txt(i.codigo) === '2')
    const ivaPorcentaje = iva ? (txt(iva.tarifa) ? num(iva.tarifa) : TARIFA_POR_CODIGO[txt(iva.codigoPorcentaje)] ?? 0) : 0
    return {
      codigoPrincipal: txt(det.codigoPrincipal ?? det.codigoInterno).slice(0, 50),
      codigoAuxiliar: txt(det.codigoAuxiliar ?? det.codigoAdicional).slice(0, 50),
      descripcion: txt(det.descripcion).slice(0, 150) || 'Producto sin descripción',
      cantidad,
      costoUnitario: cantidad > 0 ? Math.round((subtotal / cantidad) * 10000) / 10000 : num(det.precioUnitario),
      descuento: num(det.descuento),
      subtotal,
      ivaPorcentaje,
    }
  })

  const ivaTotal = (inf.totalConImpuestos?.totalImpuesto ?? [])
    .filter((t: any) => txt(t.codigo) === '2')
    .reduce((s: number, t: any) => s + num(t.valor), 0)

  return {
    claveAcceso: txt(it.claveAcceso),
    ambiente: txt(it.ambiente),
    proveedor: { ruc, razonSocial: txt(it.razonSocial).slice(0, 150), nombreComercial: txt(it.nombreComercial).slice(0, 150), direccion: txt(inf.dirEstablecimiento || it.dirMatriz).slice(0, 300) },
    numFactura: [txt(it.estab), txt(it.ptoEmi), txt(it.secuencial)].filter(Boolean).join('-'),
    fechaEmision,
    comprador: { identificacion: txt(inf.identificacionComprador), razonSocial: txt(inf.razonSocialComprador) },
    totales: { subtotal: num(inf.totalSinImpuestos), descuento: num(inf.totalDescuento), iva: ivaTotal, total: num(inf.importeTotal) },
    items,
  }
}

/** Código que identifica el artículo del proveedor (para aprender la equivalencia). */
export const codigoArticulo = (i: Pick<ItemFacturaProveedor, 'codigoPrincipal' | 'codigoAuxiliar' | 'descripcion'>) =>
  (i.codigoPrincipal || i.codigoAuxiliar || i.descripcion).slice(0, 50)

/** Normaliza nombres para comparar (minúsculas, sin tildes ni espacios repetidos). */
export const normalizarNombre = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
