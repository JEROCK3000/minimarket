'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, FileSpreadsheet, FileText, MessageCircle, Loader2, ClipboardList, Info } from 'lucide-react'
import { toast } from 'sonner'
import type { LineaPedido } from '@/lib/compras/pedido-sugerido'

const money = (n: number) => `$${n.toFixed(2)}`
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''))

/** Teléfono ecuatoriano a formato internacional para wa.me (09xxxxxxxx → 5939xxxxxxxx). */
function telefonoWhatsApp(tel: string | null) {
  const d = (tel ?? '').replace(/\D/g, '')
  if (/^09\d{8}$/.test(d)) return `593${d.slice(1)}`
  if (/^5939\d{8}$/.test(d)) return d
  return ''
}

export function PedidoClient({ negocio, proveedores, proveedorId, dias, cobertura, lineas }: {
  negocio: string; proveedores: { id: string; nombre: string; telefono: string | null }[]
  proveedorId: string; dias: number; cobertura: number; lineas: LineaPedido[]
}) {
  const router = useRouter()
  const [cantidades, setCantidades] = useState<Record<string, string>>(() => Object.fromEntries(lineas.map((l) => [l.productoId, l.sugerido > 0 ? num(l.sugerido) : ''])))
  const [verTodos, setVerTodos] = useState(false)
  const [exportando, setExportando] = useState<'excel' | 'pdf' | null>(null)
  const proveedor = proveedores.find((p) => p.id === proveedorId)

  const navegar = (cambios: Record<string, string | number>) => {
    const sp = new URLSearchParams({ proveedor: proveedorId, dias: String(dias), cobertura: String(cobertura), ...Object.fromEntries(Object.entries(cambios).map(([k, v]) => [k, String(v)])) })
    router.push(`/compras/pedido?${sp}`)
  }
  const visibles = verTodos ? lineas : lineas.filter((l) => l.sugerido > 0 || Number(cantidades[l.productoId]) > 0)
  const items = useMemo(() => lineas
    .map((l) => ({ l, cantidad: Number(cantidades[l.productoId]) || 0 }))
    .filter((x) => x.cantidad > 0), [lineas, cantidades])
  const total = items.reduce((s, x) => s + x.cantidad * x.l.costo, 0)
  const empaquesDe = (l: LineaPedido, cantidad: number) => (l.factor > 1 ? Math.ceil(cantidad / l.factor - 1e-9) : null)

  const exportar = async (formato: 'excel' | 'pdf') => {
    setExportando(formato)
    try {
      const res = await fetch('/api/reportes/pedido', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formato, proveedorId, items: items.map((x) => ({ productoId: x.l.productoId, cantidad: x.cantidad, empaques: empaquesDe(x.l, x.cantidad), factor: x.l.factor })) }),
      })
      if (!res.ok) { toast.error('No se pudo generar el pedido'); return }
      const nombre = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || `pedido.${formato === 'pdf' ? 'pdf' : 'xlsx'}`
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a'); a.href = url; a.download = nombre; a.click(); URL.revokeObjectURL(url)
    } finally { setExportando(null) }
  }

  const whatsapp = () => {
    const lineasTxt = items.map((x) => {
      const e = empaquesDe(x.l, x.cantidad)
      return `• ${num(x.cantidad)} ${x.l.unidad === 'unidad' ? 'u' : x.l.unidad}${e ? ` (${e} x ${x.l.factor})` : ''} — ${x.l.nombre}`
    })
    const texto = `*Pedido de ${negocio}*\n${new Date().toLocaleDateString('es-EC')}\n\n${lineasTxt.join('\n')}\n\nGracias.`
    const tel = telefonoWhatsApp(proveedor?.telefono ?? null)
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener,noreferrer')
  }

  const lbl = 'text-xs font-semibold text-gray-500 dark:text-gray-400'
  return (
    <div className="space-y-6">
      <div>
        <Link href="/compras" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-600"><ArrowLeft size={15} /> Compras</Link>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white mt-1">Pedido sugerido</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Qué pedir según lo que vendes, tu stock actual y el stock mínimo de cada producto.</p>
      </div>

      <div className="card space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="pd-prov" className={lbl}>Proveedor</label>
            <select id="pd-prov" value={proveedorId} onChange={(e) => navegar({ proveedor: e.target.value })} className="input">
              <option value="">Todos los productos</option>{proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="pd-dias" className={lbl}>Analizar ventas de los últimos</label>
            <select id="pd-dias" value={dias} onChange={(e) => navegar({ dias: e.target.value })} className="input">
              {[7, 15, 30, 60, 90].map((d) => <option key={d} value={d}>{d} días</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="pd-cob" className={lbl}>Comprar para cubrir</label>
            <select id="pd-cob" value={cobertura} onChange={(e) => navegar({ cobertura: e.target.value })} className="input">
              {[3, 7, 10, 15, 30, 45].map((d) => <option key={d} value={d}>{d} días</option>)}
            </select>
          </div>
        </div>
        <p className="text-xs text-gray-500 flex gap-1.5"><Info size={13} className="shrink-0 mt-0.5" />
          Sugerido = venta diaria × días a cubrir + stock mínimo − stock actual. {proveedorId ? 'Solo productos que le has comprado a este proveedor; las cajas se redondean según sus facturas XML.' : 'Elige un proveedor para ver solo sus productos.'}</p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
          <input type="checkbox" checked={verTodos} onChange={(e) => setVerTodos(e.target.checked)} /> Ver también los que no necesitan pedido
        </label>
        <span className="text-xs text-gray-400">{lineas.filter((l) => l.sugerido > 0).length} producto(s) por pedir</span>
      </div>

      <div className="card p-0 overflow-x-auto">
        {visibles.length === 0 ? (
          <div className="py-14 text-center">
            <ClipboardList size={36} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-sm text-gray-500">{lineas.length === 0 ? (proveedorId ? 'Aún no has registrado compras a este proveedor.' : 'No hay productos.') : 'Con el stock actual no hace falta pedir nada.'}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-white/5">
                <th className="px-4 py-3 font-semibold">Producto</th><th className="px-4 py-3 font-semibold text-right">Stock</th>
                <th className="px-4 py-3 font-semibold text-right">Vende/día</th><th className="px-4 py-3 font-semibold text-right">Pedir</th>
                <th className="px-4 py-3 font-semibold text-right">Costo ref.</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((l) => {
                const cant = Number(cantidades[l.productoId]) || 0
                const e = empaquesDe(l, cant)
                return (
                  <tr key={l.productoId} className="border-b border-gray-50 dark:border-white/5 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-white">{l.nombre}{l.factor > 1 && <span className="block text-[11px] text-gray-400">Empaque del proveedor: {l.factor} {l.unidad}</span>}</td>
                    <td className={`px-4 py-2.5 text-right ${l.stock <= l.stockMinimo ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-600 dark:text-gray-300'}`}>{num(l.stock)}<span className="block text-[10px] text-gray-400">mín. {num(l.stockMinimo)}</span></td>
                    <td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-300">{l.ventaDiaria > 0 ? num(Math.round(l.ventaDiaria * 100) / 100) : '—'}</td>
                    <td className="px-4 py-2.5 text-right">
                      <input type="number" step="any" min="0" value={cantidades[l.productoId] ?? ''} placeholder="0"
                        onChange={(ev) => setCantidades((c) => ({ ...c, [l.productoId]: ev.target.value }))}
                        className="input h-9 w-24 text-right ml-auto" aria-label={`Cantidad a pedir de ${l.nombre}`} />
                      {e && <span className="block text-[10px] text-gray-400 mt-0.5">{e} empaque(s)</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{cant > 0 ? money(cant * l.costo) : money(l.costo)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card flex flex-col sm:flex-row sm:items-center justify-between gap-3 sticky bottom-4">
        <p className="text-sm text-gray-600 dark:text-gray-300"><strong>{items.length}</strong> producto(s) · total estimado <strong className="text-gray-900 dark:text-white">{money(total)}</strong></p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => exportar('excel')} disabled={items.length === 0 || !!exportando} className="btn-ghost text-sm">{exportando === 'excel' ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />} Excel</button>
          <button onClick={() => exportar('pdf')} disabled={items.length === 0 || !!exportando} className="btn-ghost text-sm">{exportando === 'pdf' ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />} PDF</button>
          <button onClick={whatsapp} disabled={items.length === 0} className="btn-primary bg-emerald-600 hover:bg-emerald-700 text-sm" title={proveedor?.telefono ? `Enviar a ${proveedor.telefono}` : 'Elige el contacto en WhatsApp'}>
            <MessageCircle size={15} /> WhatsApp
          </button>
        </div>
      </div>
    </div>
  )
}
