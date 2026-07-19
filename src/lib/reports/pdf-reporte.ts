import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

/**
 * Generador de reportes PDF tabulares (ventas, gastos, inventario).
 * Encabezado con empresa + título + contexto, tabla con estilos, fila de
 * totales, resumen opcional y pie con numeración de páginas.
 */

export interface ReportePdf {
  empresa: string
  titulo: string
  subtitulo: string // contexto / filtros aplicados (ej. rango de fechas)
  orientacion?: 'portrait' | 'landscape'
  columnas: { header: string; align?: 'left' | 'right' | 'center' }[]
  filas: (string | number)[][]
  totales?: string[] // fila final destacada (mismo nº de columnas)
  resumen?: { titulo: string; filas: [string, string][] } | null
}

export const usd = (n: number) => `$${n.toFixed(2)}`

const AZUL: [number, number, number] = [37, 99, 235]
const PIZARRA: [number, number, number] = [30, 41, 59]
const GRIS: [number, number, number] = [107, 114, 128]

export function generarReportePdf(r: ReportePdf): Uint8Array<ArrayBuffer> {
  const doc = new jsPDF({ orientation: r.orientacion ?? 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const M = 14

  // Encabezado
  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(...AZUL)
  doc.text(r.empresa, pageW / 2, 16, { align: 'center' })
  doc.setFontSize(12).setTextColor(...PIZARRA)
  doc.text(r.titulo, pageW / 2, 23, { align: 'center' })
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...GRIS)
  doc.text(r.subtitulo, pageW / 2, 29, { align: 'center' })

  const columnStyles: Record<number, { halign?: 'left' | 'right' | 'center' }> = {}
  r.columnas.forEach((c, i) => { if (c.align) columnStyles[i] = { halign: c.align } })

  autoTable(doc, {
    startY: 34,
    margin: { left: M, right: M },
    head: [r.columnas.map((c) => c.header)],
    body: r.filas,
    foot: r.totales ? [r.totales] : undefined,
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.8, textColor: PIZARRA },
    headStyles: { fillColor: PIZARRA, textColor: 255, fontStyle: 'bold', halign: 'center', fontSize: 8 },
    footStyles: { fillColor: [241, 245, 249], textColor: PIZARRA, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles,
  })

  if (r.resumen && r.resumen.filas.length > 0) {
    const y = (doc as any).lastAutoTable.finalY + 8
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...PIZARRA)
    doc.text(r.resumen.titulo, M, y)
    autoTable(doc, {
      startY: y + 3,
      margin: { left: M, right: M },
      tableWidth: 90,
      body: r.resumen.filas,
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.8, textColor: PIZARRA },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    })
  }

  // Pie de página: fecha de generación + numeración
  const paginas = doc.getNumberOfPages()
  const generado = `Generado el ${new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}`
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    const h = doc.internal.pageSize.getHeight()
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...GRIS)
    doc.text(generado, M, h - 8)
    doc.text(`Página ${i} de ${paginas}`, pageW - M, h - 8, { align: 'right' })
  }

  return new Uint8Array(doc.output('arraybuffer'))
}
