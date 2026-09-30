/**
 * Tickets en bytes ESC/POS crudos para impresora térmica de 80 mm.
 *
 * Portado de ecofacturacion (src/FactelBundle/Sri/RideEscPosBase.php y
 * RideFacturaEscPos.php), que a su vez viene de SmartianERP: mismos comandos,
 * mismo ancho (42 columnas), página de códigos CP850 (tildes y eñe probadas
 * físicamente) y corte total tras 8 líneas de avance. El navegador envía estos
 * bytes al agente local (print-agent/, puerto 9448), que los reenvía por socket
 * al puerto 9100 de la impresora: única forma confiable de que el corte funcione.
 */
import type { TotalesVenta } from '@/lib/ventas/totales'
import { NOMBRE_FORMA_PAGO_SRI } from '@/lib/sri/impuestos'

const INIT = '\x1B\x40'                 // ESC @  inicializar
const PAGINA_CP850 = '\x1B\x74\x02'     // ESC t 2
const NEGRITA_ON = '\x1B\x45\x01'
const NEGRITA_OFF = '\x1B\x45\x00'
const CENTRO = '\x1B\x61\x01'
const IZQUIERDA = '\x1B\x61\x00'
const DOBLE_ALTO_ON = '\x1D\x21\x01'    // GS ! 1  (doble alto, para el TOTAL)
const TAMANO_NORMAL = '\x1D\x21\x00'
const CORTE_TOTAL = '\x1D\x56\x00'      // GS V 0

export const ANCHO = 42

// ─── Codificación CP850 ───────────────────────────────────────────────────────
const CP850: Record<string, number> = {
  'Ç': 0x80, 'ü': 0x81, 'é': 0x82, 'â': 0x83, 'ä': 0x84, 'à': 0x85, 'ç': 0x87, 'ê': 0x88, 'è': 0x8a,
  'ï': 0x8b, 'î': 0x8c, 'ì': 0x8d, 'Ä': 0x8e, 'É': 0x90, 'ô': 0x93, 'ö': 0x94, 'ò': 0x95, 'û': 0x96,
  'ù': 0x97, 'Ö': 0x99, 'Ü': 0x9a, 'á': 0xa0, 'í': 0xa1, 'ó': 0xa2, 'ú': 0xa3, 'ñ': 0xa4, 'Ñ': 0xa5,
  'ª': 0xa6, 'º': 0xa7, '¿': 0xa8, '¡': 0xad, 'Á': 0xb5, 'Â': 0xb6, 'À': 0xb7, 'Ê': 0xd2, 'Ë': 0xd3,
  'È': 0xd4, 'Í': 0xd6, 'Î': 0xd7, 'Ï': 0xd8, 'Ì': 0xde, 'Ó': 0xe0, 'Ô': 0xe2, 'Ò': 0xe3, 'Ú': 0xe9,
  'Û': 0xea, 'Ù': 0xeb, '°': 0xf8,
}

/** Convierte el texto armado (con comandos ESC/POS, todos ASCII) a bytes CP850. */
export function codificar(texto: string): Buffer {
  const bytes: number[] = []
  for (const ch of texto) {
    const code = ch.codePointAt(0)!
    if (code < 0x80) { bytes.push(code); continue }
    const cp = CP850[ch]
    if (cp !== undefined) { bytes.push(cp); continue }
    // Sin equivalente: quitar diacríticos ("ã" → "a") o '?' como último recurso.
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '')
    bytes.push(base.length === 1 && base.charCodeAt(0) < 0x80 ? base.charCodeAt(0) : 0x3f)
  }
  return Buffer.from(bytes)
}

// ─── Utilitarios de formato ───────────────────────────────────────────────────
/** Limpia saltos y caracteres de control que vengan en los datos. */
const limpio = (s: string | null | undefined) => String(s ?? '').replace(/[\x00-\x1F\x7F]+/g, ' ').trim()

/** Envuelve a ANCHO columnas sin cortar palabras (las muy largas sí se parten). */
export function envolver(texto: string, ancho = ANCHO): string {
  const lineas: string[] = []
  let actual = ''
  for (const palabra of limpio(texto).split(/\s+/).filter(Boolean)) {
    let p = palabra
    while (p.length > ancho) {
      if (actual) { lineas.push(actual); actual = '' }
      lineas.push(p.slice(0, ancho)); p = p.slice(ancho)
    }
    if (!actual) actual = p
    else if (actual.length + 1 + p.length <= ancho) actual += ' ' + p
    else { lineas.push(actual); actual = p }
  }
  if (actual) lineas.push(actual)
  return lineas.map((l) => l + '\n').join('')
}

const separador = () => '-'.repeat(ANCHO) + '\n'
const dinero = (n: number) => `$${n.toFixed(2)}`

/** "etiqueta ........ $valor"; si no caben juntos, la etiqueta baja a su propia línea. */
function fila(etiqueta: string, valor: string): string {
  const espacios = ANCHO - etiqueta.length - valor.length
  if (espacios >= 1) return etiqueta + ' '.repeat(espacios) + valor + '\n'
  return envolver(etiqueta) + valor.padStart(ANCHO) + '\n'
}

const cantidadTxt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, ''))

// ─── Datos de entrada ─────────────────────────────────────────────────────────
export interface DatosEmisor {
  razonSocial: string
  nombreComercial: string | null
  ruc: string
  dirMatriz: string
  dirEstablecimiento: string | null
  contribuyenteEspecial: string | null
  obligadoContabilidad: boolean
  ambiente: number // 1 pruebas, 2 producción
}

export interface ItemTicket { descripcion: string; cantidad: number; precioUnitario: number }

export interface DatosFacturaTicket {
  emisor: DatosEmisor
  numero: string            // 001-001-000000123
  fechaEmision: string      // dd/MM/yyyy
  cliente: { nombre: string; identificacion: string; direccion: string | null }
  items: ItemTicket[]
  totales: TotalesVenta     // mismo cálculo que la factura electrónica
  formaPagoSri: string      // código SRI ('01', '19', '20'…)
  pagoCon: number | null
  numeroAutorizacion: string | null
  fechaAutorizacion: string | null
  claveAcceso: string
}

export interface DatosTicketVenta {
  negocio: { nombre: string; ruc: string | null; direccion: string | null }
  numero: string
  fecha: string
  cliente: { nombre: string; identificacion: string | null }
  items: ItemTicket[]
  totales: TotalesVenta
  formaPago: string // EFECTIVO | TARJETA | TRANSFERENCIA
  pagoCon: number | null
  facturaPendiente: boolean
}

// ─── Bloques comunes ──────────────────────────────────────────────────────────
function bloqueDetalle(items: ItemTicket[], totales: TotalesVenta): string {
  let out = ''
  items.forEach((it, i) => {
    const l = totales.lineas[i]
    out += NEGRITA_ON + envolver(limpio(it.descripcion).toUpperCase()) + NEGRITA_OFF
    out += fila(`${cantidadTxt(it.cantidad)} x $${it.precioUnitario.toFixed(4)}`, dinero(l ? l.subtotal : it.cantidad * it.precioUnitario))
  })
  return out + separador()
}

function bloqueTotales(totales: TotalesVenta): string {
  let out = fila('SUBTOTAL', dinero(totales.subtotal))
  if (totales.descuento > 0) out += fila('DESCUENTO', '-' + dinero(totales.descuento))
  for (const t of totales.porTarifa) out += fila(`SUBTOTAL ${t.tarifa}%`, dinero(t.base))
  for (const t of totales.porTarifa) if (t.tarifa > 0) out += fila(`IVA ${t.tarifa}%`, dinero(t.iva))
  out += NEGRITA_ON + DOBLE_ALTO_ON + fila('TOTAL', dinero(totales.total)) + TAMANO_NORMAL + NEGRITA_OFF
  return out
}

function bloquePago(etiqueta: string, total: number, pagoCon: number | null): string {
  let out = NEGRITA_ON + 'FORMA DE PAGO\n' + NEGRITA_OFF
  out += fila(etiqueta, dinero(total))
  if (pagoCon != null && pagoCon > total) {
    out += fila('Recibido', dinero(pagoCon))
    out += fila('Cambio', dinero(pagoCon - total))
  }
  return out + separador()
}

const cierre = (texto: string) =>
  CENTRO + envolver(texto) + IZQUIERDA + '\n'.repeat(8) + CORTE_TOTAL

// ─── Documentos ───────────────────────────────────────────────────────────────
/** RIDE de una factura AUTORIZADA en formato ticket (equivale a RideFacturaEscPos). */
export function ticketFactura(d: DatosFacturaTicket): Buffer {
  const e = d.emisor
  let out = INIT + PAGINA_CP850 + CENTRO
  out += NEGRITA_ON + envolver(limpio(e.razonSocial).toUpperCase()) + NEGRITA_OFF
  if (e.nombreComercial && e.nombreComercial !== e.razonSocial) out += envolver(e.nombreComercial)
  out += `RUC: ${e.ruc}\n`
  out += envolver(`Dir. Matriz: ${e.dirMatriz}`)
  if (e.dirEstablecimiento) out += envolver(`Dir. Establec.: ${e.dirEstablecimiento}`)
  if (e.contribuyenteEspecial) out += envolver(`Contribuyente Especial: ${e.contribuyenteEspecial}`)
  out += `OBLIGADO CONTABILIDAD: ${e.obligadoContabilidad ? 'SI' : 'NO'}\n`
  out += separador()
  out += NEGRITA_ON + 'FACTURA\n' + d.numero + '\n' + NEGRITA_OFF
  if (e.ambiente !== 2) out += NEGRITA_ON + 'AMBIENTE DE PRUEBAS\n' + NEGRITA_OFF
  out += separador() + IZQUIERDA

  out += envolver(`Cliente: ${limpio(d.cliente.nombre).toUpperCase()}`)
  out += `Identificacion: ${limpio(d.cliente.identificacion)}\n`
  if (d.cliente.direccion) out += envolver(`Direccion: ${d.cliente.direccion}`)
  out += `Fecha: ${d.fechaEmision}\n` + separador()

  out += bloqueDetalle(d.items, d.totales)
  out += bloqueTotales(d.totales) + separador()
  out += bloquePago(NOMBRE_FORMA_PAGO_SRI[d.formaPagoSri] ?? d.formaPagoSri, d.totales.total, d.pagoCon)

  out += CENTRO + 'No. AUTORIZACION:\n'
  out += NEGRITA_ON + envolver(d.numeroAutorizacion || d.claveAcceso) + NEGRITA_OFF
  if (d.fechaAutorizacion) out += `FECHA AUT.: ${d.fechaAutorizacion}\n`
  out += 'CLAVE DE ACCESO\n' + NEGRITA_ON + envolver(d.claveAcceso) + NEGRITA_OFF
  out += separador()
  out += cierre('Este documento es una representacion impresa de un comprobante electronico autorizado por el SRI. ¡Gracias por su compra!')
  return codificar(out)
}

/** Ticket de venta (NO fiscal): venta sin factura o con factura aún no autorizada. */
export function ticketVenta(d: DatosTicketVenta): Buffer {
  let out = INIT + PAGINA_CP850 + CENTRO
  out += NEGRITA_ON + envolver(limpio(d.negocio.nombre).toUpperCase()) + NEGRITA_OFF
  if (d.negocio.ruc) out += `RUC: ${d.negocio.ruc}\n`
  if (d.negocio.direccion) out += envolver(d.negocio.direccion)
  out += separador()
  out += NEGRITA_ON + 'TICKET DE VENTA\n' + NEGRITA_OFF + `${d.numero}\n` + separador() + IZQUIERDA

  out += `Fecha: ${d.fecha}\n`
  out += envolver(`Cliente: ${limpio(d.cliente.nombre).toUpperCase()}`)
  if (d.cliente.identificacion) out += `Identificacion: ${limpio(d.cliente.identificacion)}\n`
  out += separador()

  out += bloqueDetalle(d.items, d.totales)
  out += bloqueTotales(d.totales) + separador()
  const pago = d.formaPago === 'TARJETA' ? 'TARJETA' : d.formaPago === 'TRANSFERENCIA' ? 'TRANSFERENCIA' : 'EFECTIVO'
  out += bloquePago(pago, d.totales.total, d.pagoCon)

  const leyenda = d.facturaPendiente
    ? 'Su factura electronica se emitira al SRI y se enviara a su correo. Este ticket no es un comprobante tributario.'
    : 'Documento no valido como comprobante tributario. ¡Gracias por su compra!'
  out += cierre(leyenda)
  return codificar(out)
}

/** Ticket corto para probar la conexión con la impresora desde Configuración. */
export function ticketPrueba(nombreNegocio: string, ip: string): Buffer {
  let out = INIT + PAGINA_CP850 + CENTRO
  out += NEGRITA_ON + DOBLE_ALTO_ON + 'PRUEBA DE IMPRESION\n' + TAMANO_NORMAL + NEGRITA_OFF
  out += envolver(limpio(nombreNegocio).toUpperCase()) + separador() + IZQUIERDA
  out += `Impresora: ${ip}\n`
  out += `Fecha: ${new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}\n`
  out += 'Tildes y eñe: áéíóú ÁÉÍÓÚ ñÑ ¿? ¡!\n' + separador()
  out += cierre('Si lees esto y el papel se corto solo, la impresora esta lista.')
  return codificar(out)
}

// ─── Etiquetas de precio ──────────────────────────────────────────────────────
export interface EtiquetaPrecio { negocio: string; nombre: string; precioFinal: number; unidad: string; codigoBarras: string | null }

const DOBLE_ANCHO_ALTO = '\x1D\x21\x11' // GS ! 0x11

/** ¿EAN-13 válido (13 dígitos con dígito de control correcto)? */
function esEan13(c: string) {
  if (!/^\d{13}$/.test(c)) return false
  const suma = c.slice(0, 12).split('').reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0)
  return (10 - (suma % 10)) % 10 === Number(c[12])
}

/** Código de barras ESC/POS (GS k): EAN-13 si aplica, si no CODE128 (juego B, ASCII imprimible). */
function codigoDeBarras(codigo: string): string {
  const alto = '\x1D\x68\x50'   // GS h 80 puntos
  const ancho = '\x1D\x77\x02'  // GS w 2
  const hri = '\x1D\x48\x02'    // GS H 2: texto debajo
  if (esEan13(codigo)) return alto + ancho + hri + '\x1D\x6B\x43\x0D' + codigo  // GS k 67 13
  const datos = '{B' + codigo.replace(/[^\x20-\x7E]/g, '').slice(0, 40)
  return alto + ancho + hri + '\x1D\x6B\x49' + String.fromCharCode(datos.length) + datos // GS k 73 n
}

/** Etiquetas de precio (una o varias, con separador y un solo corte al final). */
export function etiquetasPrecio(etiquetas: EtiquetaPrecio[]): Buffer {
  let out = INIT + PAGINA_CP850
  etiquetas.forEach((e, i) => {
    out += CENTRO
    out += envolver(limpio(e.negocio).toUpperCase())
    out += NEGRITA_ON + envolver(limpio(e.nombre).toUpperCase()) + NEGRITA_OFF
    out += DOBLE_ANCHO_ALTO + NEGRITA_ON + `$${e.precioFinal.toFixed(2)}\n` + NEGRITA_OFF + TAMANO_NORMAL
    out += `PVP por ${limpio(e.unidad)} - IVA incluido\n`
    const codigo = limpio(e.codigoBarras)
    if (codigo) out += '\n' + codigoDeBarras(codigo) + '\n'
    out += IZQUIERDA
    out += i < etiquetas.length - 1 ? '\n' + '- '.repeat(ANCHO / 2) + '\n\n' : ''
  })
  out += '\n'.repeat(6) + CORTE_TOTAL
  return codificar(out)
}
