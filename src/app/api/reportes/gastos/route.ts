import { NextRequest, NextResponse } from 'next/server'
import { requerirTenant } from '@/lib/auth/tenant'
import { prisma } from '@/lib/db/prisma'
import { registrarLog } from '@/lib/logs/logger'
import ExcelJS from 'exceljs'
import { generarReportePdf, usd } from '@/lib/reports/pdf-reporte'

// GET /api/reportes/gastos?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&formato=excel|pdf
export async function GET(request: NextRequest) {
  let sesion
  try {
    sesion = await requerirTenant()
  } catch {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const desde = searchParams.get('desde') ? new Date(searchParams.get('desde')!) : new Date(new Date().setDate(1))
    const hasta = searchParams.get('hasta') ? new Date(searchParams.get('hasta')! + 'T23:59:59') : new Date()

    const gastos = await prisma.gasto.findMany({
      where: { tenantId: sesion.tenantId, fecha: { gte: desde, lte: hasta } },
      orderBy: { fecha: 'asc' },
    })
    const tenant = await prisma.tenant.findUnique({ where: { id: sesion.tenantId }, select: { nombre: true } })

    if (searchParams.get('formato') === 'pdf') {
      const porCategoria = new Map<string, number>()
      let total = 0
      const filas = gastos.map((g) => {
        total += Number(g.monto)
        porCategoria.set(g.categoria, (porCategoria.get(g.categoria) ?? 0) + Number(g.monto))
        return [g.fecha.toLocaleDateString('es-EC'), g.categoria, g.descripcion, usd(Number(g.monto))]
      })
      const pdf = generarReportePdf({
        empresa: tenant?.nombre || 'MiniMarket',
        titulo: 'Reporte de Gastos',
        subtitulo: `Del ${desde.toLocaleDateString('es-EC')} al ${hasta.toLocaleDateString('es-EC')} | ${gastos.length} gasto(s)`,
        columnas: [
          { header: 'Fecha', align: 'center' }, { header: 'Categoría' },
          { header: 'Descripción' }, { header: 'Monto', align: 'right' },
        ],
        filas,
        totales: ['', '', 'TOTAL', usd(total)],
        resumen: {
          titulo: 'Resumen por categoría',
          filas: [...porCategoria.entries()].map(([cat, monto]) => [cat, usd(monto)] as [string, string]),
        },
      })
      await registrarLog('AUDIT', 'REPORTES', `Reporte de gastos PDF generado por ${sesion.email}`, undefined, sesion.tenantId)
      return new NextResponse(pdf, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="gastos_${desde.toISOString().slice(0, 10)}_${hasta.toISOString().slice(0, 10)}.pdf"`,
        },
      })
    }

    const wb = new ExcelJS.Workbook()
    wb.creator = tenant?.nombre || 'MiniMarket'
    const sheet = wb.addWorksheet('Gastos')

    sheet.mergeCells('A1:D1')
    const title = sheet.getCell('A1')
    title.value = `${tenant?.nombre || 'MiniMarket'} — Reporte de Gastos`
    title.font = { size: 16, bold: true, color: { argb: 'FFD97706' } }
    title.alignment = { horizontal: 'center' }
    sheet.mergeCells('A2:D2')
    const sub = sheet.getCell('A2')
    sub.value = `Del ${desde.toLocaleDateString('es-EC')} al ${hasta.toLocaleDateString('es-EC')} | ${gastos.length} gasto(s)`
    sub.font = { size: 10, color: { argb: 'FF6B7280' } }
    sub.alignment = { horizontal: 'center' }
    sheet.addRow([])

    const header = sheet.addRow(['Fecha', 'Categoría', 'Descripción', 'Monto'])
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    })

    // Agrupar total por categoría
    const porCategoria = new Map<string, number>()
    let total = 0
    for (const g of gastos) {
      total += Number(g.monto)
      porCategoria.set(g.categoria, (porCategoria.get(g.categoria) ?? 0) + Number(g.monto))
      const row = sheet.addRow([g.fecha.toLocaleDateString('es-EC'), g.categoria, g.descripcion, Number(g.monto)])
      row.getCell(4).numFmt = '"$"#,##0.00'
    }
    const totalRow = sheet.addRow(['', '', 'TOTAL', total])
    totalRow.getCell(3).font = { bold: true }
    totalRow.getCell(4).font = { bold: true }
    totalRow.getCell(4).numFmt = '"$"#,##0.00'

    // Resumen por categoría
    sheet.addRow([]); sheet.addRow(['Resumen por categoría', '', '', ''])
    for (const [cat, monto] of porCategoria) {
      const r = sheet.addRow([cat, '', '', monto])
      r.getCell(4).numFmt = '"$"#,##0.00'
    }

    sheet.columns.forEach((col, i) => { col.width = [14, 20, 40, 14][i] || 14 })

    await registrarLog('AUDIT', 'REPORTES', `Reporte de gastos generado por ${sesion.email}`, undefined, sesion.tenantId)
    const buffer = await wb.xlsx.writeBuffer()
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="gastos_${desde.toISOString().slice(0, 10)}_${hasta.toISOString().slice(0, 10)}.xlsx"`,
      },
    })
  } catch (error: any) {
    await registrarLog('ERROR', 'REPORTES', `Error reporte gastos: ${error.message || error}`)
    return NextResponse.json({ error: 'No se pudo generar el reporte' }, { status: 500 })
  }
}
