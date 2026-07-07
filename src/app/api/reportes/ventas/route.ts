import { NextRequest, NextResponse } from 'next/server'
import { requerirTenant } from '@/lib/auth/tenant'
import { prisma } from '@/lib/db/prisma'
import { registrarLog } from '@/lib/logs/logger'
import ExcelJS from 'exceljs'

// GET /api/reportes/ventas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
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

    const ventas = await prisma.venta.findMany({
      where: { tenantId: sesion.tenantId, fecha: { gte: desde, lte: hasta } },
      include: { cliente: { select: { nombre: true, identificacion: true } }, factura: { select: { estado: true } } },
      orderBy: { fecha: 'asc' },
    })

    const tenant = await prisma.tenant.findUnique({ where: { id: sesion.tenantId }, select: { nombre: true } })

    const wb = new ExcelJS.Workbook()
    wb.creator = tenant?.nombre || 'MiniMarket'
    wb.created = new Date()
    const sheet = wb.addWorksheet('Ventas', { pageSetup: { paperSize: 9, orientation: 'landscape' } })

    // Título
    sheet.mergeCells('A1:H1')
    const title = sheet.getCell('A1')
    title.value = `${tenant?.nombre || 'MiniMarket'} — Reporte de Ventas`
    title.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF2563EB' } }
    title.alignment = { horizontal: 'center' }

    sheet.mergeCells('A2:H2')
    const sub = sheet.getCell('A2')
    sub.value = `Del ${desde.toLocaleDateString('es-EC')} al ${hasta.toLocaleDateString('es-EC')} | ${ventas.length} venta(s)`
    sub.font = { size: 10, color: { argb: 'FF6B7280' } }
    sub.alignment = { horizontal: 'center' }
    sheet.addRow([])

    // Encabezados
    const header = sheet.addRow(['Nº', 'Fecha', 'Cliente', 'Identificación', 'Forma pago', 'Comprobante', 'Subtotal', 'IVA', 'Total'])
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    })

    let totalGeneral = 0
    for (const v of ventas) {
      totalGeneral += Number(v.total)
      const comp = !v.requiereFactura ? 'Ticket' : v.factura?.estado ?? 'Sin emitir'
      const row = sheet.addRow([
        v.numero,
        v.fecha.toLocaleDateString('es-EC'),
        v.cliente?.nombre ?? 'Consumidor final',
        v.cliente?.identificacion ?? '—',
        v.formaPago,
        comp,
        Number(v.subtotal),
        Number(v.iva),
        Number(v.total),
      ])
      ;[7, 8, 9].forEach((c) => { row.getCell(c).numFmt = '"$"#,##0.00' })
    }

    const totalRow = sheet.addRow(['', '', '', '', '', 'TOTAL', '', '', totalGeneral])
    totalRow.getCell(6).font = { bold: true }
    totalRow.getCell(9).font = { bold: true }
    totalRow.getCell(9).numFmt = '"$"#,##0.00'

    sheet.columns.forEach((col, i) => { col.width = [12, 12, 28, 16, 12, 14, 12, 10, 12][i] || 12 })

    await registrarLog('AUDIT', 'REPORTES', `Reporte de ventas Excel generado por ${sesion.email}`, undefined, sesion.tenantId)

    const buffer = await wb.xlsx.writeBuffer()
    const nombre = `ventas_${desde.toISOString().slice(0, 10)}_${hasta.toISOString().slice(0, 10)}.xlsx`
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${nombre}"`,
      },
    })
  } catch (error: any) {
    await registrarLog('ERROR', 'REPORTES', `Error generando reporte: ${error.message || error}`)
    return NextResponse.json({ error: 'No se pudo generar el reporte' }, { status: 500 })
  }
}
