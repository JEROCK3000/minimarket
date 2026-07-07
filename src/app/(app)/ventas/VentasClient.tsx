'use client'

import { useState } from 'react'
import { Receipt, FileText, Loader2, CheckCircle2, AlertCircle, Clock, Download, Mail, Eye, Ban } from 'lucide-react'
import { toast } from 'sonner'
import { emitirFacturaVentaAction } from './sri-actions'
import { descargarRideAction, enviarFacturaEmailAction } from './factura-actions'
import { anularVentaAction } from './actions'
import { obtenerVistaPreviaFacturaAction } from './preview-actions'

interface VentaRow {
  id: string; numero: string; cliente: string; items: number; total: number
  formaPago: string; requiereFactura: boolean; facturaEstado: string | null; estado: string; fecha: string
}

export function VentasClient({ ventas, hayEmisor, puedeAnular }: { ventas: VentaRow[]; hayEmisor: boolean; puedeAnular: boolean }) {
  const [emitiendo, setEmitiendo] = useState<string | null>(null)
  const [accion, setAccion] = useState<string | null>(null)
  const [preview, setPreview] = useState<any>(null)
  const [confirmarAnular, setConfirmarAnular] = useState<VentaRow | null>(null)
  const money = (n: number) => `$${n.toFixed(2)}`
  const fecha = (iso: string) => new Date(iso).toLocaleString('es-EC', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  const emitir = async (id: string) => {
    setEmitiendo(id)
    const t = toast.loading('Emitiendo factura al SRI... (puede tardar unos segundos)')
    try {
      const r: any = await emitirFacturaVentaAction(id)
      if (r?.success) {
        toast.success(`Factura autorizada por el SRI (Aut. ${r.numeroAutorizacion?.slice(0, 12)}...)`, { id: t })
      } else {
        // Mensaje real del SRI (ej. rechazos), no el genérico de Next
        toast.error(r?.error || 'No se pudo emitir la factura', { id: t, duration: 8000 })
      }
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo emitir la factura', { id: t })
    } finally {
      setEmitiendo(null)
    }
  }

  const descargarPDF = async (id: string) => {
    setAccion(id + '-pdf')
    try {
      const res = await descargarRideAction(id)
      if (res.success && res.pdfBase64) {
        const bin = atob(res.pdfBase64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
        const a = document.createElement('a'); a.href = url; a.download = `Factura-${res.numeroFactura}.pdf`; a.click()
        URL.revokeObjectURL(url)
      } else toast.error(res.error || 'No se pudo generar el PDF')
    } finally { setAccion(null) }
  }

  const enviarEmail = async (id: string) => {
    setAccion(id + '-mail')
    const prom = enviarFacturaEmailAction(id)
    toast.promise(prom.then((r) => { if (!r.success) throw new Error(r.error); return r }), {
      loading: 'Enviando factura por correo...',
      success: (r: any) => `Factura enviada a ${r.email}`,
      error: (e) => e.message || 'No se pudo enviar',
    })
    try { await prom } catch {} finally { setAccion(null) }
  }

  const verPrevia = async (id: string) => {
    setAccion(id + '-prev')
    try {
      const res = await obtenerVistaPreviaFacturaAction(id)
      if (res.success) setPreview(res)
      else toast.error(res.error || 'No se pudo obtener la vista previa')
    } finally { setAccion(null) }
  }

  const anular = async (v: VentaRow) => {
    setAccion(v.id + '-anul')
    const prom = anularVentaAction(v.id)
    toast.promise(prom.then((r) => { if (!r.success) throw new Error(r.error); return r }), {
      loading: 'Anulando venta y revirtiendo stock...',
      success: 'Venta anulada. El stock fue devuelto al inventario.',
      error: (e) => e.message || 'No se pudo anular',
    })
    try { await prom } catch {} finally { setAccion(null); setConfirmarAnular(null) }
  }

  const badge = (v: VentaRow) => {
    if (v.estado === 'ANULADA') return <span className="inline-flex items-center gap-1 text-xs text-red-500 font-semibold"><Ban size={12} /> Anulada</span>
    if (!v.requiereFactura) return <span className="inline-flex items-center gap-1 text-xs text-gray-400"><Receipt size={12} /> Ticket</span>
    switch (v.facturaEstado) {
      case 'AUTORIZADA': return <span className="inline-flex items-center gap-1 text-xs text-green-600 font-semibold"><CheckCircle2 size={12} /> Autorizada</span>
      case 'RECHAZADA': return <span className="inline-flex items-center gap-1 text-xs text-red-500 font-semibold"><AlertCircle size={12} /> Rechazada</span>
      case 'PENDIENTE': return <span className="inline-flex items-center gap-1 text-xs text-amber-500 font-semibold"><Clock size={12} /> Pendiente</span>
      default: return <span className="inline-flex items-center gap-1 text-xs text-gray-400"><FileText size={12} /> Sin emitir</span>
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">Ventas</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{ventas.length} venta(s)</p>
      </div>

      {!hayEmisor && (
        <div className="card border-amber-400/30 bg-amber-50/50 dark:bg-amber-400/5 text-sm text-amber-700 dark:text-amber-400">
          Para emitir facturas electrónicas configura primero el emisor en <strong>Configuración → Facturación SRI</strong>.
        </div>
      )}

      {ventas.length === 0 ? (
        <div className="card text-center py-16">
          <Receipt size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Aún no hay ventas. Usa el Punto de Venta.</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/5 text-left text-xs text-gray-500 dark:text-gray-400">
                  <th className="px-4 py-3 font-semibold">Nº</th>
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold">Cliente</th>
                  <th className="px-4 py-3 font-semibold text-right">Total</th>
                  <th className="px-4 py-3 font-semibold">Comprobante</th>
                  <th className="px-4 py-3 font-semibold text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {ventas.map((v) => {
                  const anulada = v.estado === 'ANULADA'
                  const puedeEmitir = !anulada && v.requiereFactura && v.facturaEstado !== 'AUTORIZADA' && hayEmisor
                  const puedeAnularEsta = puedeAnular && !anulada && v.facturaEstado !== 'AUTORIZADA'
                  return (
                    <tr key={v.id} className={`border-b border-gray-50 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5 ${anulada ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 font-mono font-semibold text-gray-900 dark:text-white">{v.numero}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{fecha(v.fecha)}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{v.cliente}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-white">{money(v.total)}</td>
                      <td className="px-4 py-3">{badge(v)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {puedeEmitir && (
                            <>
                              <button onClick={() => verPrevia(v.id)} disabled={accion === v.id + '-prev'} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 hover:text-brand-600 transition" title="Vista previa de la factura">
                                {accion === v.id + '-prev' ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />}
                              </button>
                              <button onClick={() => emitir(v.id)} disabled={emitiendo === v.id} className="btn-primary h-8 px-3 text-xs">
                                {emitiendo === v.id ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                                {v.facturaEstado === 'RECHAZADA' || v.facturaEstado === 'PENDIENTE' ? 'Reintentar' : 'Emitir'}
                              </button>
                            </>
                          )}
                          {v.facturaEstado === 'AUTORIZADA' && (
                            <>
                              <button onClick={() => descargarPDF(v.id)} disabled={accion === v.id + '-pdf'} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 hover:text-brand-600 transition" title="Descargar PDF (RIDE)">
                                {accion === v.id + '-pdf' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                              </button>
                              <button onClick={() => enviarEmail(v.id)} disabled={accion === v.id + '-mail'} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 hover:text-brand-600 transition" title="Enviar por correo">
                                {accion === v.id + '-mail' ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
                              </button>
                            </>
                          )}
                          {puedeAnularEsta && (
                            <button onClick={() => setConfirmarAnular(v)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500 transition" title="Anular venta">
                              <Ban size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal vista previa de factura */}
      {preview && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={() => setPreview(null)}>
          <div className="w-full max-w-md bg-white dark:bg-[#0f0f1e] rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-white/5">
              <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2"><Eye size={16} /> Vista previa de factura</h2>
              <button onClick={() => setPreview(null)} className="p-1 text-gray-400">✕</button>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <div className="text-xs text-gray-400">
                <p className="font-semibold text-gray-900 dark:text-white">{preview.emisor.razonSocial}</p>
                <p>RUC: {preview.emisor.ruc} · Ambiente: {preview.emisor.ambiente}</p>
              </div>
              <div className="flex justify-between border-y border-gray-100 dark:border-white/5 py-2">
                <span className="text-gray-500">Factura Nº (proyectada)</span>
                <span className="font-mono font-semibold text-gray-900 dark:text-white">{preview.numeroFactura}</span>
              </div>
              <div className="text-xs">
                <span className="text-gray-500">Cliente: </span>
                <span className="text-gray-900 dark:text-white">{preview.cliente.nombre} · {preview.cliente.identificacion}</span>
              </div>
              <div className="space-y-1">
                {preview.items.map((it: any, i: number) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-gray-600 dark:text-gray-300">{it.cantidad} × {it.nombre}</span>
                    <span className="text-gray-900 dark:text-white">${it.subtotal.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-100 dark:border-white/5 pt-2 space-y-1 text-xs">
                <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>${preview.totales.subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between text-gray-500"><span>IVA</span><span>${preview.totales.iva.toFixed(2)}</span></div>
                <div className="flex justify-between font-black text-gray-900 dark:text-white text-sm"><span>Total</span><span>${preview.totales.total.toFixed(2)}</span></div>
              </div>
              <p className="text-[11px] text-gray-400 pt-1">Esta es una proyección. El número definitivo se asigna al emitir al SRI.</p>
            </div>
          </div>
        </div>
      )}

      {/* Confirmación de anulación */}
      {confirmarAnular && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={() => setConfirmarAnular(null)}>
          <div className="w-full max-w-sm bg-white dark:bg-[#0f0f1e] rounded-2xl shadow-xl p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <Ban size={40} className="mx-auto text-red-500 mb-3" />
            <h2 className="font-bold text-lg text-gray-900 dark:text-white">¿Anular la venta {confirmarAnular.numero}?</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">El stock de los productos se devolverá al inventario. Esta acción no se puede deshacer.</p>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setConfirmarAnular(null)} className="btn-ghost flex-1">Cancelar</button>
              <button onClick={() => anular(confirmarAnular)} disabled={accion === confirmarAnular.id + '-anul'} className="btn flex-1 bg-red-600 hover:bg-red-700 text-white">
                {accion === confirmarAnular.id + '-anul' ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />} Anular
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
