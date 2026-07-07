import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface RideData {
  emisor: { razonSocial: string; nombreComercial?: string | null; ruc: string; dirMatriz: string; ambiente: number }
  factura: { numero: string; claveAcceso: string; numeroAutorizacion?: string | null; fechaAutorizacion?: Date | null; fechaEmision: string }
  cliente: { nombre: string; identificacion: string }
  items: { descripcion: string; cantidad: number; precioUnitario: number; subtotal: number }[]
  totales: { subtotal: number; descuento: number; iva: number; total: number }
}

/** Genera el RIDE (representación impresa) de una factura como PDF, devuelto en base64. */
export function generarRidePDF(d: RideData): string {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const money = (n: number) => `$${n.toFixed(2)}`
  let y = 15

  doc.setFont('helvetica', 'bold'); doc.setFontSize(15)
  doc.text(d.emisor.nombreComercial || d.emisor.razonSocial, 14, y)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); y += 6
  doc.text(d.emisor.razonSocial, 14, y); y += 4
  doc.text(`RUC: ${d.emisor.ruc}`, 14, y); y += 4
  doc.text(d.emisor.dirMatriz, 14, y)

  // Recuadro de factura (derecha)
  doc.setDrawColor(200); doc.roundedRect(120, 12, 76, 30, 2, 2)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.text('FACTURA', 124, 18)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
  doc.text(`Nº ${d.factura.numero}`, 124, 23)
  doc.text(`Ambiente: ${d.emisor.ambiente === 2 ? 'PRODUCCIÓN' : 'PRUEBAS'}`, 124, 27)
  doc.text('Clave de acceso:', 124, 32)
  doc.setFontSize(6); doc.text(d.factura.claveAcceso, 124, 36, { maxWidth: 70 })

  y = 50
  doc.setFontSize(9); doc.setFont('helvetica', 'bold')
  doc.text('Cliente:', 14, y)
  doc.setFont('helvetica', 'normal')
  doc.text(`${d.cliente.nombre}  ·  ${d.cliente.identificacion}`, 30, y)
  y += 4
  doc.text(`Fecha de emisión: ${d.factura.fechaEmision}`, 14, y)
  if (d.factura.numeroAutorizacion) { y += 4; doc.text(`Autorización: ${d.factura.numeroAutorizacion}`, 14, y) }

  autoTable(doc, {
    startY: y + 4,
    head: [['Cant.', 'Descripción', 'P. Unit.', 'Subtotal']],
    body: d.items.map((it) => [String(it.cantidad), it.descripcion, money(it.precioUnitario), money(it.subtotal)]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    columnStyles: { 0: { halign: 'center', cellWidth: 18 }, 2: { halign: 'right', cellWidth: 26 }, 3: { halign: 'right', cellWidth: 28 } },
  })

  const finalY = (doc as any).lastAutoTable.finalY + 6
  const xLabel = 140, xVal = 196
  doc.setFontSize(9)
  const line = (label: string, val: string, yy: number, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.text(label, xLabel, yy); doc.text(val, xVal, yy, { align: 'right' })
  }
  line('Subtotal', money(d.totales.subtotal), finalY)
  line('Descuento', money(d.totales.descuento), finalY + 5)
  line('IVA', money(d.totales.iva), finalY + 10)
  line('TOTAL', money(d.totales.total), finalY + 16, true)

  doc.setFontSize(7); doc.setTextColor(150)
  doc.text('Documento generado electrónicamente. Válido como comprobante autorizado por el SRI.', 14, 285)

  return doc.output('datauristring').split(',')[1] // base64 puro
}
