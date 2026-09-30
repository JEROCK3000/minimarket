'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { consultarIdentificacionAction, verificarRucAction, type ConsultaIdentificacion } from '@/app/(app)/clientes/actions'
import { detectarIdentificacion, CONSUMIDOR_FINAL, type ClaseIdentificacion } from '@/lib/clientes/identificacion'

export type ClienteEncontrado = Extract<ConsultaIdentificacion, { success: true }>

interface Props {
  identificacion: string
  tipo: string // CEDULA | RUC | PASAPORTE | CONSUMIDOR_FINAL
  onChange: (v: { identificacion: string; tipo: string }) => void
  /** Se llama cuando la consulta encuentra datos (BD local o APIs) */
  onEncontrado?: (r: ClienteEncontrado) => void
  /** Se llama cuando la consulta no encuentra datos (para registrar a mano) */
  onSinResultado?: () => void
  /** Consulta automática al completar 10/13 dígitos (desactivar al editar) */
  consultaAutomatica?: boolean
}

interface EstadoPersona { clase: ClaseIdentificacion; cedula: string | null; ruc: string | null; tieneRuc: boolean | null }
type Tono = 'ok' | 'error' | 'aviso' | 'info'

const TONOS: Record<Tono, string> = {
  ok: 'text-emerald-600 dark:text-emerald-400',
  error: 'text-red-600 dark:text-red-400',
  aviso: 'text-amber-600 dark:text-amber-400',
  info: 'text-gray-500 dark:text-gray-400',
}
const SIN_RUC = 'Esta persona no tiene RUC registrado en el SRI. Factura con cédula.'

/**
 * Identificación del cliente con detección automática. El operador escribe solo
 * el número que dicta el cliente; el tipo se detecta. Si es persona natural se
 * ofrece "Facturar con: Cédula / RUC" (RUC = cédula + 001, verificado en el SRI).
 * Pasaporte se elige con "Otro tipo".
 */
export function IdentificacionInput({ identificacion, tipo, onChange, onEncontrado, onSinResultado, consultaAutomatica = true }: Props) {
  const [modoOtro, setModoOtro] = useState(tipo === 'PASAPORTE')
  const [persona, setPersona] = useState<EstadoPersona | null>(() => {
    // Al editar un cliente existente: selector disponible sin consultar.
    const d = detectarIdentificacion(identificacion)
    return d && d.clase === 'natural' ? { ...d, tieneRuc: tipo === 'RUC' ? true : null } : null
  })
  const [consultando, setConsultando] = useState(false)
  const [verificando, setVerificando] = useState(false)
  const [mensaje, setMensaje] = useState<{ texto: string; tono: Tono } | null>(null)
  const ultimoConsultado = useRef(identificacion.replace(/\D/g, ''))
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (temporizador.current) clearTimeout(temporizador.current) }, [])

  const elegir = (p: EstadoPersona, t: 'CEDULA' | 'RUC') => {
    const numero = t === 'RUC' ? p.ruc! : p.cedula!
    ultimoConsultado.current = numero
    onChange({ identificacion: numero, tipo: t })
  }

  const consultar = async (valor = identificacion) => {
    if (modoOtro) return
    const num = valor.replace(/\D/g, '')
    if (num.length !== 10 && num.length !== 13) {
      setMensaje({ texto: 'Escribe la cédula (10 dígitos) o el RUC (13 dígitos).', tono: 'error' })
      return
    }
    ultimoConsultado.current = num
    setConsultando(true)
    setMensaje(null)
    try {
      const r = await consultarIdentificacionAction(num)
      if (!r.success) { setPersona(null); setMensaje({ texto: r.error, tono: 'error' }); onSinResultado?.(); return }
      const p: EstadoPersona = { clase: r.clase, cedula: r.cedula, ruc: r.ruc, tieneRuc: r.tieneRuc }
      setPersona(p)
      onEncontrado?.(r)
      let texto = r.origen === 'LOCAL' ? 'Cliente registrado: datos cargados.' : 'Datos encontrados.'
      if (r.aviso) texto += ` ${r.aviso}`
      if (r.clase === 'natural') {
        // Preselecciona lo último usado (o lo que resolvió la consulta).
        elegir(p, r.tipoIdentificacion === 'RUC' ? 'RUC' : 'CEDULA')
        texto += ' Pregunta: ¿factura con cédula o con RUC?'
      } else {
        onChange({ identificacion: num, tipo: r.tipoIdentificacion })
      }
      setMensaje({ texto, tono: r.aviso ? 'aviso' : 'ok' })
    } catch {
      setMensaje({ texto: 'Error de conexión al consultar la identificación.', tono: 'error' })
    } finally {
      setConsultando(false)
    }
  }

  const escribir = (valor: string) => {
    if (modoOtro) { onChange({ identificacion: valor, tipo }); return }
    const num = valor.replace(/\D/g, '')
    // Tipo provisional por la longitud, por si la consulta falla o no se hace.
    const provisional = num === CONSUMIDOR_FINAL ? 'CONSUMIDOR_FINAL' : num.length === 13 ? 'RUC' : num.length === 10 ? 'CEDULA' : tipo
    onChange({ identificacion: valor, tipo: provisional })
    if (num !== ultimoConsultado.current) { setPersona(null); setMensaje(null) }
    if (temporizador.current) clearTimeout(temporizador.current)
    // Pausa corta: si dictan un RUC, no se consulta a mitad (al llegar a 10).
    if (consultaAutomatica && (num.length === 10 || num.length === 13) && num !== ultimoConsultado.current) {
      temporizador.current = setTimeout(() => consultar(valor), 800)
    }
  }

  const elegirRuc = async () => {
    if (!persona) return
    if (persona.tieneRuc === true) { elegir(persona, 'RUC'); return }
    if (persona.tieneRuc === false) { setMensaje({ texto: SIN_RUC, tono: 'error' }); return }
    // No se sabe si tiene RUC: confirmarlo en el SRI antes de usarlo.
    setVerificando(true)
    setMensaje({ texto: 'Verificando el RUC en el SRI…', tono: 'info' })
    try {
      const r = await verificarRucAction(persona.ruc!)
      if ('error' in r) {
        elegir(persona, 'RUC')
        setMensaje({ texto: `${r.error}. Confirma el RUC con el cliente.`, tono: 'aviso' })
      } else if (r.existe) {
        setPersona({ ...persona, tieneRuc: true })
        elegir(persona, 'RUC')
        setMensaje({ texto: 'RUC verificado en el SRI.', tono: 'ok' })
      } else {
        setPersona({ ...persona, tieneRuc: false })
        setMensaje({ texto: SIN_RUC, tono: 'error' })
      }
    } catch {
      elegir(persona, 'RUC')
      setMensaje({ texto: 'No se pudo verificar en el SRI. Confirma el RUC con el cliente.', tono: 'aviso' })
    } finally {
      setVerificando(false)
    }
  }

  const alternarOtro = () => {
    const nuevo = !modoOtro
    setModoOtro(nuevo)
    setPersona(null)
    setMensaje(null)
    onChange({ identificacion, tipo: nuevo ? 'PASAPORTE' : identificacion.replace(/\D/g, '').length === 13 ? 'RUC' : 'CEDULA' })
  }

  const lbl = 'text-xs font-semibold text-gray-500 dark:text-gray-400'
  const esNatural = !modoOtro && persona?.clase === 'natural'
  const segmento = (activo: boolean) =>
    `px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
      activo
        ? 'bg-brand-600 text-white'
        : 'bg-white dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/10'
    }`

  return (
    <div className="space-y-1.5">
      <label className={lbl}>{modoOtro ? 'Pasaporte / otro documento *' : 'Identificación (cédula o RUC) *'}</label>
      <div className="flex gap-1.5">
        {modoOtro && (
          <select value={tipo} onChange={(e) => onChange({ identificacion, tipo: e.target.value })} className="input w-36 shrink-0">
            <option value="PASAPORTE">Pasaporte</option>
            <option value="CONSUMIDOR_FINAL">Consumidor Final</option>
          </select>
        )}
        <input
          value={identificacion}
          onChange={(e) => escribir(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); consultar() } }}
          className="input font-mono"
          placeholder={modoOtro ? 'Número de documento' : 'Escribe el número que dicta el cliente'}
          inputMode={modoOtro ? 'text' : 'numeric'}
          maxLength={15}
          required
        />
        {!modoOtro && (
          <button type="button" onClick={() => consultar()} disabled={consultando} className="btn-ghost shrink-0 px-2.5" title="Buscar / consultar">
            {consultando ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
          </button>
        )}
      </div>

      {esNatural && (
        <div className="flex items-center gap-2 pt-0.5">
          <span className={lbl}>Facturar con:</span>
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-white/10 overflow-hidden" role="group">
            <button type="button" onClick={() => elegir(persona!, 'CEDULA')} className={segmento(tipo !== 'RUC')} aria-pressed={tipo !== 'RUC'}>
              Cédula
            </button>
            <button type="button" onClick={elegirRuc} disabled={verificando} className={`${segmento(tipo === 'RUC')} border-l border-gray-200 dark:border-white/10`} aria-pressed={tipo === 'RUC'}>
              {verificando ? <Loader2 size={12} className="animate-spin inline" /> : 'RUC'}
            </button>
          </div>
        </div>
      )}

      {mensaje && <p className={`text-[11px] leading-snug ${TONOS[mensaje.tono]}`} role="status">{mensaje.texto}</p>}

      <button type="button" onClick={alternarOtro} className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline">
        {modoOtro ? 'Detectar cédula / RUC automáticamente' : 'Otro tipo (pasaporte…)'}
      </button>
    </div>
  )
}
