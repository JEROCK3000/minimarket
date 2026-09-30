import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { requerirTenant } from '@/lib/auth/tenant'

// GET /api/productos/plantilla — plantilla .xlsx para importar productos (ADMIN)
export async function GET() {
  try {
    await requerirTenant('ADMIN')
  } catch {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const wb = new ExcelJS.Workbook()
  const hoja = wb.addWorksheet('Productos')
  hoja.mergeCells('A1:I1')
  hoja.getCell('A1').value = 'Plantilla de importación de productos — BORRA las 2 filas de ejemplo y llena desde la fila 4. Obligatorio: Nombre y Precio venta.'
  hoja.getCell('A1').font = { bold: true, color: { argb: 'FF2563EB' } }
  hoja.mergeCells('A2:I2')
  hoja.getCell('A2').value = 'Precios SIN IVA. IVA: 0 o 15 (también 5). Si una fila tiene un nombre o código ya registrado, se omite (no se modifica nada existente).'
  hoja.getCell('A2').font = { size: 10, color: { argb: 'FF6B7280' } }
  const enc = hoja.addRow(['Nombre', 'Código de barras', 'Categoría', 'Precio compra', 'Precio venta', 'IVA %', 'Stock inicial', 'Stock mínimo', 'Unidad'])
  enc.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
  })
  hoja.addRow(['Leche entera 1L', '7861001234565', 'Lácteos', 0.9, 1.05, 0, 24, 6, 'unidad'])
  hoja.addRow(['Gaseosa 500ml', '', 'Bebidas', 0.45, 0.6, 15, 48, 12, 'unidad'])
  hoja.columns = [30, 18, 16, 14, 14, 8, 13, 13, 10].map((width) => ({ width }))
  const buffer = await wb.xlsx.writeBuffer()
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="plantilla_productos.xlsx"',
    },
  })
}
