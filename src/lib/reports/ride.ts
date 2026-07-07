import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface RideData {
  tipoDocumento?: 'FACTURA' | 'NOTA_CREDITO' // por defecto FACTURA
  emisor: {
    razonSocial: string; nombreComercial?: string | null; ruc: string
    dirMatriz: string; dirEstablecimiento: string; obligadoContabilidad: boolean; ambiente: number
  }
  factura: {
    numero: string; claveAcceso: string; numeroAutorizacion?: string | null
    fechaAutorizacion?: Date | null; fechaEmision: string; formaPago: string
  }
  // Solo para notas de crédito: comprobante que modifica y motivo
  notaCredito?: { docModificadoNumero: string; motivo: string } | null
  cliente: { nombre: string; identificacion: string; direccion?: string | null; email?: string | null }
  items: { codigo: string; descripcion: string; cantidad: number; precioUnitario: number; descuento: number; subtotal: number }[]
  totales: { subtotal15: number; subtotal0: number; subtotalSinImpuestos: number; descuento: number; iva: number; total: number }
  logo?: { base64: string; formato: 'PNG' | 'JPEG' } | null
}

const MORADO: [number, number, number] = [124, 77, 158]

function formaPagoTexto(fp: string): string {
  if (fp === 'TARJETA') return 'TARJETA DE DÉBITO/CRÉDITO'
  if (fp === 'TRANSFERENCIA') return 'OTROS CON UTILIZACIÓN DEL SISTEMA FINANCIERO'
  return 'SIN UTILIZACIÓN DEL SISTEMA FINANCIERO'
}

/** Genera el RIDE de la factura como PDF (formato estándar SRI Ecuador). Devuelve base64. */
export function generarRidePDF(d: RideData): string {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const money = (n: number) => `$${n.toFixed(2)}`
  const M = 12 // margen
  const W = 210 - M * 2 // ancho útil = 186
  doc.setTextColor(30)

  // ═══ ENCABEZADO ═══════════════════════════════════════════════════════════
  const headTop = 12
  const rightX = 118, rightW = M + W - rightX // recuadro derecho

  // Recuadro derecho (datos tributarios) — el borde se dibuja al final con la altura real
  doc.setDrawColor(180); doc.setLineWidth(0.3)
  let ry = headTop + 6
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30)
  doc.text(`R.U.C.: ${d.emisor.ruc}`, rightX + 3, ry); ry += 6
  doc.setFontSize(11)
  doc.text(d.tipoDocumento === 'NOTA_CREDITO' ? 'NOTA DE CRÉDITO' : 'FACTURA', rightX + 3, ry); ry += 5
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
  doc.text(`No.: ${d.factura.numero}`, rightX + 3, ry); ry += 4.5
  doc.setFont('helvetica', 'bold'); doc.text('NÚMERO DE AUTORIZACIÓN:', rightX + 3, ry); ry += 3.5
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5)
  const autLineas = doc.splitTextToSize(d.factura.numeroAutorizacion || 'N/A', rightW - 6)
  doc.text(autLineas, rightX + 3, ry); ry += autLineas.length * 3 + 1.5
  doc.setFontSize(8)
  const fechaAuth = d.factura.fechaAutorizacion
    ? new Intl.DateTimeFormat('es-EC', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'America/Guayaquil' }).format(d.factura.fechaAutorizacion)
    : '—'
  doc.setFont('helvetica', 'bold'); doc.text('FECHA Y HORA DE AUTORIZACIÓN:', rightX + 3, ry); ry += 3.5
  doc.setFont('helvetica', 'normal'); doc.text(fechaAuth, rightX + 3, ry); ry += 4.5
  doc.setFont('helvetica', 'bold'); doc.text('AMBIENTE: ', rightX + 3, ry)
  doc.setFont('helvetica', 'normal'); doc.text(d.emisor.ambiente === 2 ? 'PRODUCCIÓN' : 'PRUEBAS', rightX + 24, ry); ry += 4
  doc.setFont('helvetica', 'bold'); doc.text('EMISIÓN: ', rightX + 3, ry)
  doc.setFont('helvetica', 'normal'); doc.text('NORMAL', rightX + 22, ry); ry += 5
  doc.setFont('helvetica', 'bold'); doc.text('CLAVE DE ACCESO:', rightX + 3, ry); ry += 3.5
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5)
  const claveLineas = doc.splitTextToSize(d.factura.claveAcceso, rightW - 6)
  doc.text(claveLineas, rightX + 3, ry); ry += claveLineas.length * 3
  // Borde del recuadro con la altura real del contenido + margen inferior
  const rightBottom = ry + 3
  doc.rect(rightX, headTop, rightW, rightBottom - headTop)

  // Bloque izquierdo: logo + datos del emisor
  let lx = M, logoW = 0
  if (d.logo?.base64) {
    try {
      const props = doc.getImageProperties(d.logo.base64)
      const maxW = 34, maxH = 34
      const ratio = Math.min(maxW / props.width, maxH / props.height)
      const w = props.width * ratio, h = props.height * ratio
      doc.addImage(d.logo.base64, d.logo.formato, M, headTop, w, h)
      logoW = w + 4
    } catch { /* logo inválido: ignorar */ }
  }
  const tx = lx + logoW
  const txMax = rightX - tx - 4
  let ly = headTop + 5
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(20)
  doc.text(d.emisor.nombreComercial || d.emisor.razonSocial, tx, ly, { maxWidth: txMax }); ly += 7
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(60)
  const put = (label: string, val: string) => {
    const lineas = doc.splitTextToSize(`${label}${val}`, txMax)
    doc.text(lineas, tx, ly); ly += lineas.length * 4
  }
  put('Razón Social: ', d.emisor.razonSocial)
  put('Dirección Matriz: ', d.emisor.dirMatriz)
  ly += 1
  put('Dirección Sucursal: ', d.emisor.dirEstablecimiento)
  ly += 1
  put('Obligado a llevar contabilidad: ', d.emisor.obligadoContabilidad ? 'SÍ' : 'NO')

  // ═══ DATOS DEL CLIENTE (recuadro ancho completo) ══════════════════════════
  let cy = Math.max(rightBottom, ly) + 4
  const cliBoxTop = cy
  doc.setDrawColor(180)
  doc.setTextColor(30); doc.setFontSize(8.5)
  cy += 5
  doc.setFont('helvetica', 'bold'); doc.text('Razón Social / Nombres y Apellidos: ', M + 2, cy)
  doc.setFont('helvetica', 'normal')
  const nomLineas = doc.splitTextToSize(d.cliente.nombre, W - 70)
  doc.text(nomLineas, M + 62, cy); cy += Math.max(nomLineas.length * 4, 5)
  doc.setFont('helvetica', 'bold'); doc.text('Identificación: ', M + 2, cy)
  doc.setFont('helvetica', 'normal'); doc.text(d.cliente.identificacion, M + 28, cy)
  doc.setFont('helvetica', 'bold'); doc.text('Fecha Emisión: ', M + 120, cy)
  doc.setFont('helvetica', 'normal'); doc.text(d.factura.fechaEmision, M + 145, cy); cy += 5
  doc.setFont('helvetica', 'bold'); doc.text('Dirección: ', M + 2, cy)
  doc.setFont('helvetica', 'normal')
  const dirLineas = doc.splitTextToSize(d.cliente.direccion || '—', W - 90)
  doc.text(dirLineas, M + 22, cy)
  doc.setFont('helvetica', 'bold'); doc.text('Correo: ', M + 120, cy)
  doc.setFont('helvetica', 'normal'); doc.text(d.cliente.email || '—', M + 133, cy, { maxWidth: W - 123 })
  cy += Math.max(dirLineas.length * 4, 5) + 2 // margen inferior
  // Dibujar el recuadro del cliente ahora que sé su alto
  doc.rect(M, cliBoxTop, W, cy - cliBoxTop)

  // ═══ Bloque de nota de crédito (comprobante que modifica + motivo) ════════
  if (d.tipoDocumento === 'NOTA_CREDITO' && d.notaCredito) {
    cy += 3
    const ncTop = cy
    cy += 5
    doc.setFontSize(8.5); doc.setTextColor(30)
    doc.setFont('helvetica', 'bold'); doc.text('Comprobante que se modifica: ', M + 2, cy)
    doc.setFont('helvetica', 'normal'); doc.text(`FACTURA  ${d.notaCredito.docModificadoNumero}`, M + 52, cy); cy += 5
    doc.setFont('helvetica', 'bold'); doc.text('Motivo: ', M + 2, cy)
    doc.setFont('helvetica', 'normal')
    const motLineas = doc.splitTextToSize(d.notaCredito.motivo, W - 24)
    doc.text(motLineas, M + 18, cy); cy += Math.max(motLineas.length * 4, 5) + 2
    doc.rect(M, ncTop, W, cy - ncTop)
  }

  // ═══ TABLA DE ITEMS ═══════════════════════════════════════════════════════
  autoTable(doc, {
    startY: cy + 4,
    head: [['Cód.', 'Cant.', 'Descripción', 'P. Unitario', 'Descuento', 'P. Total']],
    body: d.items.map((it) => [
      it.codigo, String(it.cantidad), it.descripcion,
      money(it.precioUnitario), money(it.descuento), money(it.subtotal),
    ]),
    styles: { fontSize: 8, cellPadding: 2, textColor: 60 },
    headStyles: { fillColor: MORADO, textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 16, halign: 'center' }, 1: { cellWidth: 16, halign: 'center' },
      3: { cellWidth: 26, halign: 'right' }, 4: { cellWidth: 24, halign: 'right' }, 5: { cellWidth: 26, halign: 'right' },
    },
    margin: { left: M, right: M },
  })

  // ═══ PIE: forma de pago (izq) + totales (der) ═════════════════════════════
  const py = (doc as any).lastAutoTable.finalY + 6

  // Forma de pago
  doc.setDrawColor(180)
  doc.rect(M, py, 92, 18)
  doc.setFillColor(...MORADO); doc.rect(M, py, 92, 6, 'F')
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
  doc.text('Forma de Pago', M + 2, py + 4); doc.text('Valor', M + 70, py + 4)
  doc.setTextColor(50); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
  doc.text(formaPagoTexto(d.factura.formaPago), M + 2, py + 11, { maxWidth: 62 })
  doc.text(money(d.totales.total), M + 70, py + 11)

  // Totales
  const tX = 120, vX = M + W
  let tY = py + 2
  doc.setFontSize(8.5); doc.setTextColor(40)
  const fila = (label: string, val: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.text(label, tX, tY); doc.text(val, vX, tY, { align: 'right' }); tY += 4.5
  }
  fila('SUBTOTAL 15%:', money(d.totales.subtotal15))
  fila('SUBTOTAL 0%:', money(d.totales.subtotal0))
  fila('SUBTOTAL SIN IMPUESTOS:', money(d.totales.subtotalSinImpuestos))
  fila('TOTAL DESCUENTO:', money(d.totales.descuento))
  fila('IVA 15%:', money(d.totales.iva))
  tY += 1.5
  doc.setDrawColor(180); doc.line(tX, tY, vX, tY)
  tY += 4.5
  fila('VALOR TOTAL:', money(d.totales.total), true)

  doc.setFontSize(7); doc.setTextColor(150)
  doc.text('Documento generado electrónicamente. Válido como comprobante autorizado por el SRI.', M, 288)

  return doc.output('datauristring').split(',')[1]
}
