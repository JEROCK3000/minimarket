import { NextResponse } from 'next/server'
import { hoyLocalISO } from '@/lib/utils/fechas'
import ExcelJS from 'exceljs'
import { generarReportePdf, usd } from '@/lib/reports/pdf-reporte'

/**
 * Reporte tabular genérico en Excel (.xlsx) o PDF con el mismo estilo que los
 * reportes existentes (ventas, gastos, inventario): título con la empresa,
 * contexto/filtros, encabezado oscuro, formatos de moneda/porcentaje, fila de
 * totales, fecha de generación y nombre de archivo fechado (AGENTS.md §8).
 */
export type TipoColumna = 'texto' | 'moneda' | 'numero' | 'porcentaje' | 'entero'
export interface ColumnaReporte { header: string; tipo?: TipoColumna; ancho?: number }

export interface DefinicionReporte {
  empresa: string
  titulo: string
  subtitulo: string
  archivo: string // sin extensión; se le agrega la fecha
  columnas: ColumnaReporte[]
  filas: (string | number | null)[][]
  totales?: (string | number | null)[]
  orientacion?: 'portrait' | 'landscape'
  formato: 'excel' | 'pdf'
}

const fmtPdf = (v: string | number | null, tipo: TipoColumna = 'texto') => {
  if (v === null || v === undefined || v === '') return ''
  if (typeof v !== 'number') return v
  if (tipo === 'moneda') return usd(v)
  if (tipo === 'porcentaje') return `${v.toFixed(1)}%`
  if (tipo === 'entero') return String(Math.round(v))
  if (tipo === 'numero') return Number.isInteger(v) ? String(v) : v.toFixed(3)
  return String(v)
}

export async function responderReporte(r: DefinicionReporte): Promise<NextResponse> {
  const fecha = hoyLocalISO()
  const alinear = (t?: TipoColumna) => (t && t !== 'texto' ? 'right' : 'left') as 'left' | 'right'

  if (r.formato === 'pdf') {
    const pdf = generarReportePdf({
      empresa: r.empresa,
      titulo: r.titulo,
      subtitulo: r.subtitulo,
      orientacion: r.orientacion,
      columnas: r.columnas.map((c) => ({ header: c.header, align: alinear(c.tipo) })),
      filas: r.filas.map((f) => f.map((v, i) => fmtPdf(v, r.columnas[i]?.tipo))),
      totales: r.totales?.map((v, i) => String(fmtPdf(v, r.columnas[i]?.tipo))),
    })
    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${r.archivo}_${fecha}.pdf"`,
      },
    })
  }

  const n = r.columnas.length
  const ultimaCol = String.fromCharCode(64 + Math.min(n, 26))
  const wb = new ExcelJS.Workbook()
  wb.creator = r.empresa
  wb.created = new Date()
  const sheet = wb.addWorksheet(r.titulo.slice(0, 31), { pageSetup: { paperSize: 9, orientation: r.orientacion ?? 'portrait' } })

  sheet.mergeCells(`A1:${ultimaCol}1`)
  const titulo = sheet.getCell('A1')
  titulo.value = `${r.empresa} — ${r.titulo}`
  titulo.font = { size: 16, bold: true, color: { argb: 'FF2563EB' } }
  titulo.alignment = { horizontal: 'center' }
  sheet.mergeCells(`A2:${ultimaCol}2`)
  const sub = sheet.getCell('A2')
  sub.value = `${r.subtitulo} | Generado el ${new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}`
  sub.font = { size: 10, color: { argb: 'FF6B7280' } }
  sub.alignment = { horizontal: 'center' }
  sheet.addRow([])

  const header = sheet.addRow(r.columnas.map((c) => c.header))
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  })

  const aplicarFormato = (row: ExcelJS.Row) => {
    r.columnas.forEach((c, i) => {
      const cell = row.getCell(i + 1)
      if (c.tipo === 'moneda') cell.numFmt = '"$"#,##0.00'
      else if (c.tipo === 'porcentaje') cell.numFmt = '0.0"%"'
      else if (c.tipo === 'numero') cell.numFmt = '#,##0.###'
      else if (c.tipo === 'entero') cell.numFmt = '#,##0'
    })
  }
  for (const f of r.filas) aplicarFormato(sheet.addRow(f))
  if (r.filas.length === 0) sheet.addRow(['Sin datos para el período seleccionado'])
  if (r.totales) {
    const t = sheet.addRow(r.totales)
    aplicarFormato(t)
    t.eachCell((cell) => { cell.font = { bold: true } })
  }
  sheet.columns.forEach((col, i) => { col.width = r.columnas[i]?.ancho ?? 14 })

  const buffer = await wb.xlsx.writeBuffer()
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${r.archivo}_${fecha}.xlsx"`,
    },
  })
}

/** Rango ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD (por defecto, el mes en curso). */
export function rangoFechas(sp: URLSearchParams) {
  const valida = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null)
  const d = valida(sp.get('desde'))
  const h = valida(sp.get('hasta'))
  const desde = d ? new Date(`${d}T00:00:00`) : new Date(new Date().setDate(1))
  if (!d) desde.setHours(0, 0, 0, 0)
  const hasta = h ? new Date(`${h}T23:59:59.999`) : new Date()
  const txt = `Del ${desde.toLocaleDateString('es-EC')} al ${hasta.toLocaleDateString('es-EC')}`
  return { desde, hasta, txt }
}
