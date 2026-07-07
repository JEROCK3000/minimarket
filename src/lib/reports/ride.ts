import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface RideData {
  emisor: { razonSocial: string; nombreComercial?: string | null; ruc: string; dirMatriz: string; ambiente: number }
  factura: { numero: string; claveAcceso: string; numeroAutorizacion?: string | null; fechaAutorizacion?: Date | null; fechaEmision: string }
  cliente: { nombre: string; identificacion: string }
  items: { descripcion: string; cantidad: number; precioUnitario: number; subtotal: number }[]
  totales: { subtotal: number; descuento: number; iva: number; total: number }
  logo?: { base64: string; formato: 'PNG' | 'JPEG' } | null
}

/** Genera el RIDE (representación impresa) de una factura como PDF, devuelto en base64. */
export function generarRidePDF(d: RideData): string {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const money = (n: number) => `$${n.toFixed(2)}`

  // ─── Recuadro de FACTURA (derecha) ────────────────────────────────────────
  const boxX = 125, boxW = 71
  doc.setDrawColor(210); doc.roundedRect(boxX, 12, boxW, 34, 2, 2)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(30)
  doc.text('FACTURA', boxX + 4, 19)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(60)
  doc.text(`Nº ${d.factura.numero}`, boxX + 4, 24)
  doc.text(`Ambiente: ${d.emisor.ambiente === 2 ? 'PRODUCCIÓN' : 'PRUEBAS'}`, boxX + 4, 28)
  doc.text('Clave de acceso:', boxX + 4, 33)
  doc.setFontSize(6)
  doc.text(d.factura.claveAcceso, boxX + 4, 37, { maxWidth: boxW - 8 })

  // ─── Bloque del emisor (izquierda), ancho limitado para no invadir el recuadro ─
  const LEFT = 14
  const LEFT_MAX = boxX - LEFT - 6 // ~105mm, evita solaparse con el recuadro
  let y = 15

  // Logo (si existe): arriba-izquierda, manteniendo proporción dentro de 32x20mm
  if (d.logo?.base64) {
    try {
      const props = doc.getImageProperties(d.logo.base64)
      const maxW = 32, maxH = 20
      const ratio = Math.min(maxW / props.width, maxH / props.height)
      const w = props.width * ratio, h = props.height * ratio
      doc.addImage(d.logo.base64, d.logo.formato, LEFT, 12, w, h)
      y = 12 + h + 5
    } catch {
      // logo inválido → se ignora, sigue sin logo
    }
  }

  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(20)
  const titulo = d.emisor.nombreComercial || d.emisor.razonSocial
  doc.text(titulo, LEFT, y, { maxWidth: LEFT_MAX })
  y += 6

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(70)
  if (d.emisor.nombreComercial && d.emisor.nombreComercial !== d.emisor.razonSocial) {
    doc.text(d.emisor.razonSocial, LEFT, y, { maxWidth: LEFT_MAX }); y += 4
  }
  doc.text(`RUC: ${d.emisor.ruc}`, LEFT, y); y += 4
  const dirLineas = doc.splitTextToSize(d.emisor.dirMatriz, LEFT_MAX)
  doc.text(dirLineas, LEFT, y); y += dirLineas.length * 4

  // ─── Datos del cliente y fechas (debajo de ambos bloques) ─────────────────
  let yc = Math.max(y + 3, 50)
  doc.setFontSize(9); doc.setTextColor(30)
  doc.setFont('helvetica', 'bold'); doc.text('Cliente:', LEFT, yc)
  doc.setFont('helvetica', 'normal')
  doc.text(`${d.cliente.nombre}  ·  ${d.cliente.identificacion}`, LEFT + 16, yc, { maxWidth: 176 })
  yc += 5
  doc.text(`Fecha de emisión: ${d.factura.fechaEmision}`, LEFT, yc); yc += 4
  if (d.factura.numeroAutorizacion) {
    doc.setFontSize(7); doc.text(`Autorización: ${d.factura.numeroAutorizacion}`, LEFT, yc); yc += 3
  }

  // ─── Tabla de items ───────────────────────────────────────────────────────
  autoTable(doc, {
    startY: yc + 3,
    head: [['Cant.', 'Descripción', 'P. Unit.', 'Subtotal']],
    body: d.items.map((it) => [String(it.cantidad), it.descripcion, money(it.precioUnitario), money(it.subtotal)]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    columnStyles: { 0: { halign: 'center', cellWidth: 18 }, 2: { halign: 'right', cellWidth: 26 }, 3: { halign: 'right', cellWidth: 28 } },
    margin: { left: LEFT, right: 14 },
  })

  // ─── Totales ──────────────────────────────────────────────────────────────
  const finalY = (doc as any).lastAutoTable.finalY + 6
  const xLabel = 140, xVal = 196
  doc.setFontSize(9); doc.setTextColor(40)
  const line = (label: string, val: string, yy: number, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.text(label, xLabel, yy); doc.text(val, xVal, yy, { align: 'right' })
  }
  line('Subtotal', money(d.totales.subtotal), finalY)
  line('Descuento', money(d.totales.descuento), finalY + 5)
  line('IVA', money(d.totales.iva), finalY + 10)
  doc.setDrawColor(210); doc.line(xLabel, finalY + 12.5, xVal, finalY + 12.5)
  line('TOTAL', money(d.totales.total), finalY + 17, true)

  doc.setFontSize(7); doc.setTextColor(150)
  doc.text('Documento generado electrónicamente. Válido como comprobante autorizado por el SRI.', LEFT, 285)

  return doc.output('datauristring').split(',')[1] // base64 puro
}
