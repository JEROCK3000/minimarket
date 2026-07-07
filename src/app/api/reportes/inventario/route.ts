import { NextResponse } from 'next/server'
import { requerirTenant } from '@/lib/auth/tenant'
import { prisma } from '@/lib/db/prisma'
import { registrarLog } from '@/lib/logs/logger'
import ExcelJS from 'exceljs'

// GET /api/reportes/inventario — stock actual y valorización
export async function GET() {
  let sesion
  try {
    sesion = await requerirTenant()
  } catch {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const productos = await prisma.producto.findMany({
      where: { tenantId: sesion.tenantId, activo: true },
      include: { categoria: { select: { nombre: true } } },
      orderBy: [{ categoria: { nombre: 'asc' } }, { nombre: 'asc' }],
    })
    const tenant = await prisma.tenant.findUnique({ where: { id: sesion.tenantId }, select: { nombre: true } })

    const wb = new ExcelJS.Workbook()
    wb.creator = tenant?.nombre || 'MiniMarket'
    wb.created = new Date()
    const sheet = wb.addWorksheet('Inventario', { pageSetup: { paperSize: 9, orientation: 'landscape' } })

    sheet.mergeCells('A1:H1')
    const title = sheet.getCell('A1')
    title.value = `${tenant?.nombre || 'MiniMarket'} — Inventario y Valorización`
    title.font = { size: 16, bold: true, color: { argb: 'FF2563EB' } }
    title.alignment = { horizontal: 'center' }
    sheet.mergeCells('A2:H2')
    const sub = sheet.getCell('A2')
    sub.value = `Generado el ${new Date().toLocaleDateString('es-EC')} | ${productos.length} producto(s)`
    sub.font = { size: 10, color: { argb: 'FF6B7280' } }
    sub.alignment = { horizontal: 'center' }
    sheet.addRow([])

    const header = sheet.addRow(['Producto', 'Categoría', 'Código', 'Stock', 'Stock mín.', 'P. Compra', 'P. Venta', 'Valor stock (costo)'])
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    })

    let valorTotal = 0
    for (const p of productos) {
      const stock = Number(p.stock)
      const valor = stock * Number(p.precioCompra)
      valorTotal += valor
      const row = sheet.addRow([
        p.nombre, p.categoria?.nombre ?? '—', p.codigoBarras ?? '—',
        stock, Number(p.stockMinimo), Number(p.precioCompra), Number(p.precioVenta), valor,
      ])
      ;[6, 7, 8].forEach((c) => { row.getCell(c).numFmt = '"$"#,##0.00' })
      if (stock <= Number(p.stockMinimo)) {
        row.getCell(4).font = { color: { argb: 'FFD97706' }, bold: true }
      }
    }
    const total = sheet.addRow(['', '', '', '', '', '', 'TOTAL', valorTotal])
    total.getCell(7).font = { bold: true }
    total.getCell(8).font = { bold: true }
    total.getCell(8).numFmt = '"$"#,##0.00'

    sheet.columns.forEach((col, i) => { col.width = [30, 16, 16, 10, 10, 12, 12, 18][i] || 12 })

    await registrarLog('AUDIT', 'REPORTES', `Reporte de inventario generado por ${sesion.email}`, undefined, sesion.tenantId)
    const buffer = await wb.xlsx.writeBuffer()
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="inventario_${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    })
  } catch (error: any) {
    await registrarLog('ERROR', 'REPORTES', `Error reporte inventario: ${error.message || error}`)
    return NextResponse.json({ error: 'No se pudo generar el reporte' }, { status: 500 })
  }
}
