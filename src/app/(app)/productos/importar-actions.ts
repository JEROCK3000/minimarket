'use server'

import ExcelJS from 'exceljs'
import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { bloqueoPorSuscripcion, limiteDelPlan } from '@/lib/saas/suscripcion'

const TAMANO_MAXIMO = 2 * 1024 * 1024 // 2 MB
const FILAS_MAXIMAS = 2000
const TARIFAS = [0, 5, 12, 13, 14, 15]

/** Encabezados aceptados (normalizados: minúsculas, sin tildes) → campo. */
const ENCABEZADOS: Record<string, keyof FilaProducto> = {
  nombre: 'nombre', producto: 'nombre',
  'codigo de barras': 'codigoBarras', codigo: 'codigoBarras', 'codigo barras': 'codigoBarras',
  categoria: 'categoria',
  'precio compra': 'precioCompra', 'precio de compra': 'precioCompra', costo: 'precioCompra',
  'precio venta': 'precioVenta', 'precio de venta': 'precioVenta', precio: 'precioVenta',
  iva: 'iva', 'iva %': 'iva', 'iva (%)': 'iva',
  stock: 'stock', 'stock inicial': 'stock',
  'stock minimo': 'stockMinimo',
  unidad: 'unidad',
}

interface FilaProducto {
  nombre: string; codigoBarras: string; categoria: string; precioCompra: number; precioVenta: number
  iva: number; stock: number; stockMinimo: number; unidad: string
}

const filaSchema = z.object({
  nombre: z.string().trim().min(1, 'falta el nombre').max(150, 'nombre demasiado largo'),
  codigoBarras: z.string().trim().max(50),
  categoria: z.string().trim().max(100),
  precioCompra: z.number().min(0, 'precio de compra negativo').max(9999999),
  precioVenta: z.number().positive('falta el precio de venta').max(9999999),
  iva: z.number().refine((v) => TARIFAS.includes(v), 'IVA no válido (0, 5, 12, 13, 14 o 15)'),
  stock: z.number().min(0, 'stock negativo').max(9999999),
  stockMinimo: z.number().min(0).max(9999999),
  unidad: z.string().trim().min(1).max(20),
})

const normalizar = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

function valorCelda(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    if ('text' in v && typeof v.text === 'string') return v.text
    if ('result' in v) return String(v.result ?? '')
    if ('richText' in v) return v.richText.map((r) => r.text).join('')
    if (v instanceof Date) return v.toISOString()
  }
  return String(v)
}
const numero = (s: string) => {
  const n = Number(s.replace(',', '.').replace(/[$\s]/g, ''))
  return Number.isFinite(n) ? n : NaN
}

export interface ResultadoImportacion {
  creados: number
  omitidos: { fila: number; nombre: string; motivo: string }[]
}

/**
 * Importa productos NUEVOS desde un .xlsx (plantilla en /api/productos/plantilla).
 * No modifica productos existentes: una fila con código de barras o nombre ya
 * registrados se omite y se informa. Crea las categorías que falten y registra el
 * stock inicial en el kardex. Solo ADMIN. Archivo validado por tamaño, extensión
 * y contenido (firma ZIP de .xlsx).
 */
export async function importarProductosAction(formData: FormData): Promise<ResultadoImportacion | { error: string }> {
  const sesion = await requerirTenant('ADMIN')
  {
    const bloqueo = await bloqueoPorSuscripcion(sesion.tenantId)
    if (bloqueo) return { error: bloqueo }
  }
  const archivo = formData.get('archivo')
  if (!(archivo instanceof File)) return { error: 'Selecciona un archivo .xlsx' }
  if (archivo.size === 0 || archivo.size > TAMANO_MAXIMO) return { error: 'El archivo debe pesar menos de 2 MB' }
  if (!/\.xlsx$/i.test(archivo.name)) return { error: 'Solo se aceptan archivos .xlsx (Excel)' }
  const buffer = Buffer.from(await archivo.arrayBuffer())
  if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) return { error: 'El archivo no es un Excel válido' }

  let filas: { n: number; datos: Partial<Record<keyof FilaProducto, string>> }[]
  try {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer)
    const hoja = wb.worksheets[0]
    if (!hoja) return { error: 'El archivo no tiene hojas' }
    // Primera fila con "nombre" y "precio…" es el encabezado (la plantilla trae título arriba).
    let filaEncabezado = 0
    const columnas = new Map<number, keyof FilaProducto>()
    hoja.eachRow({ includeEmpty: false }, (row, n) => {
      if (filaEncabezado) return
      const mapa = new Map<number, keyof FilaProducto>()
      row.eachCell((cell, col) => { const campo = ENCABEZADOS[normalizar(valorCelda(cell.value))]; if (campo) mapa.set(col, campo) })
      const campos = new Set(mapa.values())
      if (campos.has('nombre') && campos.has('precioVenta')) { filaEncabezado = n; mapa.forEach((v, k) => columnas.set(k, v)) }
    })
    if (!filaEncabezado) return { error: 'No se encontró el encabezado: usa la plantilla (columnas "Nombre" y "Precio venta" como mínimo)' }
    filas = []
    hoja.eachRow({ includeEmpty: false }, (row, n) => {
      if (n <= filaEncabezado) return
      const datos: Partial<Record<keyof FilaProducto, string>> = {}
      columnas.forEach((campo, col) => { datos[campo] = valorCelda(row.getCell(col).value).trim() })
      if (Object.values(datos).some((v) => v)) filas.push({ n, datos })
    })
  } catch (error: any) {
    await registrarLog('WARN', 'PRODUCTOS', `Importación: archivo ilegible (${error.message || error})`, undefined, sesion.tenantId)
    return { error: 'No se pudo leer el archivo Excel' }
  }
  if (filas.length === 0) return { error: 'El archivo no tiene productos debajo del encabezado' }
  if (filas.length > FILAS_MAXIMAS) return { error: `Máximo ${FILAS_MAXIMAS} productos por archivo` }

  const [existentes, categorias] = await Promise.all([
    prisma.producto.findMany({ where: { tenantId: sesion.tenantId }, select: { nombre: true, codigoBarras: true } }),
    prisma.categoria.findMany({ where: { tenantId: sesion.tenantId }, select: { id: true, nombre: true } }),
  ])
  const nombres = new Set(existentes.map((p) => normalizar(p.nombre)))
  const codigos = new Set(existentes.map((p) => p.codigoBarras).filter(Boolean) as string[])
  const catPorNombre = new Map(categorias.map((c) => [normalizar(c.nombre), c.id]))

  const resultado: ResultadoImportacion = { creados: 0, omitidos: [] }
  for (const { n, datos } of filas) {
    const parsed = filaSchema.safeParse({
      nombre: datos.nombre ?? '', codigoBarras: datos.codigoBarras ?? '', categoria: datos.categoria ?? '',
      precioCompra: datos.precioCompra ? numero(datos.precioCompra) : 0,
      precioVenta: numero(datos.precioVenta ?? ''),
      iva: datos.iva === undefined || datos.iva === '' ? 15 : numero(datos.iva.replace('%', '')),
      stock: datos.stock ? numero(datos.stock) : 0,
      stockMinimo: datos.stockMinimo ? numero(datos.stockMinimo) : 0,
      unidad: datos.unidad || 'unidad',
    })
    const nombreFila = datos.nombre || '(sin nombre)'
    if (!parsed.success) { resultado.omitidos.push({ fila: n, nombre: nombreFila, motivo: parsed.error.errors[0]?.message || 'datos inválidos' }); continue }
    const d = parsed.data
    if (nombres.has(normalizar(d.nombre))) { resultado.omitidos.push({ fila: n, nombre: d.nombre, motivo: 'ya existe un producto con ese nombre' }); continue }
    if (d.codigoBarras && codigos.has(d.codigoBarras)) { resultado.omitidos.push({ fila: n, nombre: d.nombre, motivo: 'ya existe ese código de barras' }); continue }
    if (await limiteDelPlan(sesion.tenantId, 'productos')) { resultado.omitidos.push({ fila: n, nombre: d.nombre, motivo: 'límite de productos de tu plan' }); continue }

    try {
      let categoriaId: string | null = null
      if (d.categoria) {
        categoriaId = catPorNombre.get(normalizar(d.categoria)) ?? null
        if (!categoriaId) {
          const cat = await prisma.categoria.create({ data: { tenantId: sesion.tenantId, nombre: d.categoria } })
          categoriaId = cat.id
          catPorNombre.set(normalizar(d.categoria), cat.id)
        }
      }
      await prisma.$transaction(async (tx) => {
        const p = await tx.producto.create({
          data: {
            tenantId: sesion.tenantId, nombre: d.nombre, codigoBarras: d.codigoBarras || null, categoriaId,
            precioCompra: d.precioCompra, precioVenta: d.precioVenta, ivaPorcentaje: d.iva,
            stock: d.stock, stockMinimo: d.stockMinimo, unidad: d.unidad,
          },
        })
        if (d.stock > 0) {
          await tx.movimientoInventario.create({
            data: { tenantId: sesion.tenantId, productoId: p.id, tipo: 'AJUSTE', cantidad: d.stock, stockPrevio: 0, stockNuevo: d.stock, motivo: 'Stock inicial (importación Excel)' },
          })
        }
      })
      nombres.add(normalizar(d.nombre))
      if (d.codigoBarras) codigos.add(d.codigoBarras)
      resultado.creados++
    } catch (error: any) {
      resultado.omitidos.push({ fila: n, nombre: d.nombre, motivo: error.code === 'P2002' ? 'duplicado' : 'error al guardar' })
    }
  }

  await registrarLog('AUDIT', 'PRODUCTOS', `Importación Excel: ${resultado.creados} creado(s), ${resultado.omitidos.length} omitido(s)`, undefined, sesion.tenantId)
  revalidatePath('/productos')
  return resultado
}
