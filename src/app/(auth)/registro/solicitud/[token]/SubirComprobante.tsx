'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { subirComprobanteAction } from '../../actions'

export function SubirComprobante({ token, yaSubido }: { token: string; yaSubido: boolean }) {
  const router = useRouter()
  const [archivo, setArchivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const subir = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!archivo) return
    if (archivo.size > 5 * 1024 * 1024) { toast.error('El archivo debe pesar menos de 5 MB'); return }
    setEnviando(true)
    try {
      const fd = new FormData(); fd.append('comprobante', archivo)
      const r = await subirComprobanteAction(token, fd)
      if ('error' in r) { toast.error(r.error); return }
      toast.success('Comprobante enviado. Te avisaremos al activar tu cuenta.'); setArchivo(null); router.refresh()
    } finally { setEnviando(false) }
  }
  return (
    <form onSubmit={subir} className="space-y-2">
      <label htmlFor="comprobante" className="text-xs font-semibold text-gray-500 dark:text-gray-400">{yaSubido ? 'Reemplazar comprobante' : 'Comprobante de pago (imagen o PDF, máx. 5 MB)'}</label>
      <input id="comprobante" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
        className="block w-full text-sm text-gray-600 dark:text-gray-300 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700 dark:file:bg-white/10 dark:file:text-gray-200" />
      <button type="submit" disabled={!archivo || enviando} className="btn-primary w-full">{enviando ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Enviar comprobante</button>
    </form>
  )
}
