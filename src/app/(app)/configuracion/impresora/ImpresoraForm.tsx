'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save, Printer, Download, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { guardarImpresoraAction } from './actions'
import { agenteDisponible, imprimirPrueba, URL_AGENTE, PUERTO_AGENTE } from '@/lib/print/termica'

type EstadoAgente = 'verificando' | 'ok' | 'no'

export function ImpresoraForm({ ipActual }: { ipActual: string }) {
  const router = useRouter()
  const [ip, setIp] = useState(ipActual)
  const [guardando, setGuardando] = useState(false)
  const [probando, setProbando] = useState(false)
  const [agente, setAgente] = useState<EstadoAgente>('verificando')

  const verificarAgente = () => {
    setAgente('verificando')
    agenteDisponible().then((ok) => setAgente(ok ? 'ok' : 'no'))
  }
  useEffect(verificarAgente, [])

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    try {
      const r = await guardarImpresoraAction(ip)
      if ('error' in r) { toast.error(r.error); return }
      toast.success(ip.trim() ? 'Impresora guardada' : 'Impresora eliminada')
      router.refresh()
    } finally { setGuardando(false) }
  }

  const probar = async () => {
    setProbando(true)
    try {
      await imprimirPrueba(ip)
      toast.success('Ticket de prueba enviado. Revisa que el papel se haya cortado solo.')
    } catch (err: any) {
      toast.error(err.message || 'No se pudo imprimir')
    } finally { setProbando(false) }
  }

  const lbl = 'text-xs font-semibold text-gray-500 dark:text-gray-400'

  return (
    <div className="space-y-6">
      <form onSubmit={guardar} className="card space-y-4">
        <div>
          <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2"><Printer size={17} /> Impresora térmica</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Imprime facturas y tickets directo en la impresora de 80 mm, con corte automático.
          </p>
        </div>
        <div className="space-y-1.5">
          <label className={lbl} htmlFor="ip-impresora">IP de la impresora en la red local</label>
          <input
            id="ip-impresora"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            className="input font-mono"
            placeholder="192.168.1.50"
            inputMode="decimal"
            maxLength={15}
          />
          <p className="text-[11px] text-gray-400">Se usa el puerto 9100 (RAW) de la impresora. Déjalo vacío para desactivar la impresión térmica.</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={probar} disabled={probando || !ip.trim()} className="btn-ghost">
            {probando ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />} Probar impresión
          </button>
          <button type="submit" disabled={guardando} className="btn-primary">
            {guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar
          </button>
        </div>
      </form>

      <div className="card space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white">Agente de impresión (esta computadora)</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Programa pequeño que se instala una sola vez en la computadora de la caja (puerto {PUERTO_AGENTE}).
            </p>
          </div>
          <span className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
            agente === 'ok'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
              : agente === 'no'
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
                : 'bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400'
          }`}>
            {agente === 'ok' ? <CheckCircle2 size={13} /> : agente === 'no' ? <AlertTriangle size={13} /> : <Loader2 size={13} className="animate-spin" />}
            {agente === 'ok' ? 'Conectado' : agente === 'no' ? 'No detectado' : 'Verificando'}
          </span>
        </div>

        <ol className="text-sm text-gray-600 dark:text-gray-300 space-y-2 list-decimal pl-5">
          <li>
            Descarga el agente y descomprímelo en la computadora de la caja.
            <a href="/api/print-agent" className="btn-ghost h-8 px-3 text-xs ml-2 inline-flex"><Download size={14} /> Descargar agente</a>
          </li>
          <li>
            Instálalo (necesita Python 3). <strong>Windows</strong>: clic derecho en PowerShell dentro de la carpeta y ejecuta{' '}
            <code className="text-xs bg-gray-100 dark:bg-white/10 px-1 py-0.5 rounded">powershell -ExecutionPolicy Bypass -File instalar-windows.ps1</code>{' '}
            (queda como tarea programada <code className="text-xs">print-agent-minimarket</code>). <strong>Mac</strong>: <code className="text-xs">./instalar-mac.sh</code>. <strong>Linux</strong>: <code className="text-xs">./instalar-linux.sh</code>.
          </li>
          <li>
            Una sola vez, abre{' '}
            <a href={`${URL_AGENTE}/estado`} target="_blank" rel="noopener noreferrer" className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1">
              {URL_AGENTE}/estado <ExternalLink size={12} />
            </a>{' '}
            en este navegador y acepta el aviso de certificado (es normal: es propio del agente).
          </li>
          <li>Escribe la IP de la impresora arriba, guarda y usa <strong>Probar impresión</strong>.</li>
        </ol>
        <button type="button" onClick={verificarAgente} className="btn-ghost text-xs h-8">Volver a verificar</button>
      </div>
    </div>
  )
}
