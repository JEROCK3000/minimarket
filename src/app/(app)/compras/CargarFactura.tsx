'use client'

import { useRef, useState } from 'react'
import { FileUp, Loader2, Search, ScanBarcode } from 'lucide-react'
import { toast } from 'sonner'
import { leerFacturaCompraAction, type CompraDesdeXml } from './xml-actions'

/**
 * Carga de la compra desde la factura electrónica del proveedor: archivo XML o
 * clave de acceso (49 dígitos, se puede leer con el lector de códigos de barras
 * desde el RIDE impreso: el sistema la descarga del SRI).
 */
export function CargarFactura({ onCargada }: { onCargada: (c: CompraDesdeXml) => void }) {
  const archivoRef = useRef<HTMLInputElement>(null)
  const [clave, setClave] = useState('')
  const [cargando, setCargando] = useState<'xml' | 'clave' | null>(null)

  const procesar = async (fd: FormData, tipo: 'xml' | 'clave') => {
    setCargando(tipo)
    try {
      const r = await leerFacturaCompraAction(fd)
      if ('error' in r) { toast.error(r.error); return }
      onCargada(r.compra)
      setClave('')
      const reconocidos = r.compra.lineas.filter((l) => l.productoId).length
      toast.success(`Factura ${r.compra.numFactura} cargada: ${reconocidos} de ${r.compra.lineas.length} productos reconocidos`)
    } finally { setCargando(null) }
  }
  const subirXml = (f: File | null) => {
    if (!f) return
    if (f.size > 2 * 1024 * 1024) { toast.error('El XML pesa más de 2 MB'); return }
    const fd = new FormData(); fd.append('xml', f); procesar(fd, 'xml')
  }
  const buscarClave = (valor = clave) => {
    const limpia = valor.replace(/\D/g, '')
    if (limpia.length !== 49) { toast.error('La clave de acceso tiene 49 dígitos'); return }
    const fd = new FormData(); fd.append('clave', limpia); procesar(fd, 'clave')
  }

  return (
    <div className="rounded-xl border border-dashed border-brand-300 dark:border-brand-500/30 bg-brand-50/40 dark:bg-brand-500/5 p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Cargar desde la factura electrónica</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">Sube el XML o escribe/escanea la clave de acceso del RIDE: se llenan el proveedor, el número y los productos.</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input ref={archivoRef} type="file" accept=".xml,text/xml,application/xml" className="sr-only"
          onChange={(e) => { subirXml(e.target.files?.[0] ?? null); e.target.value = '' }} />
        <button type="button" onClick={() => archivoRef.current?.click()} disabled={!!cargando} className="btn-ghost shrink-0 border border-gray-200 dark:border-white/10">
          {cargando === 'xml' ? <Loader2 size={15} className="animate-spin" /> : <FileUp size={15} />} Subir XML
        </button>
        <div className="flex flex-1 gap-2">
          <div className="relative flex-1">
            <ScanBarcode size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden />
            <input value={clave} inputMode="numeric" maxLength={60} aria-label="Clave de acceso"
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '')
                setClave(v)
                if (v.length === 49 && !cargando) buscarClave(v) // lector de códigos: busca solo
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarClave() } }}
              className="input pl-9 font-mono text-xs" placeholder="Clave de acceso (49 dígitos)" />
          </div>
          <button type="button" onClick={() => buscarClave()} disabled={!!cargando || clave.length !== 49} className="btn-primary shrink-0">
            {cargando === 'clave' ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} <span className="hidden sm:inline">Buscar en SRI</span>
          </button>
        </div>
      </div>
    </div>
  )
}
