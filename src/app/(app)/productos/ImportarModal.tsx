'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2, Upload, Download, CheckCircle2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { importarProductosAction, type ResultadoImportacion } from './importar-actions'

/** Importación de productos nuevos desde Excel (ADMIN). */
export function ImportarModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [archivo, setArchivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null)

  const importar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!archivo) return
    if (archivo.size > 2 * 1024 * 1024) { toast.error('El archivo debe pesar menos de 2 MB'); return }
    setEnviando(true)
    try {
      const fd = new FormData()
      fd.append('archivo', archivo)
      const r = await importarProductosAction(fd)
      if ('error' in r) { toast.error(r.error); return }
      setResultado(r)
      if (r.creados > 0) { toast.success(`${r.creados} producto(s) importado(s)`); router.refresh() }
    } catch {
      toast.error('No se pudo importar el archivo')
    } finally { setEnviando(false) }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={onClose}>
      <div className="w-full max-w-lg bg-white dark:bg-[#0f0f1e] rounded-2xl shadow-xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/5">
          <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2"><Upload size={17} /> Importar productos</h2>
          <button onClick={onClose} className="p-1 text-gray-400" aria-label="Cerrar"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto p-6 space-y-4">
          {!resultado ? (
            <form onSubmit={importar} className="space-y-4">
              <ol className="text-sm text-gray-600 dark:text-gray-300 space-y-1.5 list-decimal pl-5">
                <li>Descarga la plantilla, borra las filas de ejemplo y llena tus productos (precios <strong>sin IVA</strong>).</li>
                <li>Súbela aquí. Solo se crean productos <strong>nuevos</strong>: si un nombre o código ya existe, esa fila se omite.</li>
              </ol>
              <a href="/api/productos/plantilla" className="btn-ghost text-sm inline-flex"><Download size={15} /> Descargar plantilla</a>
              <div className="space-y-1.5">
                <label htmlFor="imp-archivo" className="text-xs font-semibold text-gray-500 dark:text-gray-400">Archivo Excel (.xlsx, máx. 2 MB)</label>
                <input
                  id="imp-archivo" type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-600 dark:text-gray-300 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700 dark:file:bg-white/10 dark:file:text-gray-200"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
                <button type="submit" disabled={!archivo || enviando} className="btn-primary">
                  {enviando ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Importar
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 size={18} /> {resultado.creados} producto(s) creado(s)
              </div>
              {resultado.omitidos.length > 0 && (
                <div className="space-y-2">
                  <p className="flex items-center gap-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
                    <AlertTriangle size={16} /> {resultado.omitidos.length} fila(s) omitida(s)
                  </p>
                  <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-100 dark:border-white/5">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-gray-500 border-b border-gray-100 dark:border-white/5">
                          <th className="px-3 py-2 font-semibold">Fila</th><th className="px-3 py-2 font-semibold">Producto</th><th className="px-3 py-2 font-semibold">Motivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resultado.omitidos.map((o, i) => (
                          <tr key={i} className="border-b border-gray-50 dark:border-white/5 last:border-0">
                            <td className="px-3 py-1.5 font-mono text-gray-500">{o.fila}</td>
                            <td className="px-3 py-1.5 text-gray-800 dark:text-gray-200">{o.nombre}</td>
                            <td className="px-3 py-1.5 text-gray-600 dark:text-gray-300">{o.motivo}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button onClick={() => { setResultado(null); setArchivo(null) }} className="btn-ghost">Importar otro archivo</button>
                <button onClick={onClose} className="btn-primary">Listo</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
