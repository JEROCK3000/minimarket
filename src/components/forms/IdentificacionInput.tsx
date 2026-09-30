'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import {
  consultarIdentificacionAction, verificarRucAction, buscarClientesRegistradosAction,
  type ConsultaIdentificacion, type ClienteRegistrado,
} from '@/app/(app)/clientes/actions'
import { detectarIdentificacion, CONSUMIDOR_FINAL, type ClaseIdentificacion } from '@/lib/clientes/identificacion'

export type ClienteEncontrado = Extract<ConsultaIdentificacion, { success: true }>
export type { ClienteRegistrado }

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
  /** Sugerir clientes ya registrados al escribir nombre o parte del número */
  sugerirRegistrados?: boolean
  /** Cliente registrado elegido de la lista cuyo documento no es cédula/RUC (pasaporte) */
  onSeleccionRegistrado?: (c: ClienteRegistrado) => void
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
const ETIQUETA_TIPO: Record<string, string> = { CEDULA: 'Cédula', RUC: 'RUC', PASAPORTE: 'Pasaporte', CONSUMIDOR_FINAL: 'C. Final' }

/**
 * Identificación del cliente con detección automática. El operador escribe solo
 * el número que dicta el cliente; el tipo se detecta. Si es persona natural se
 * ofrece "Facturar con: Cédula / RUC" (RUC = cédula + 001, verificado en el SRI).
 * Pasaporte se elige con "Otro tipo". Con `sugerirRegistrados`, además, al
 * escribir un nombre o parte del número se listan los clientes ya registrados.
 */
export function IdentificacionInput({
  identificacion, tipo, onChange, onEncontrado, onSinResultado,
  consultaAutomatica = true, sugerirRegistrados = false, onSeleccionRegistrado,
}: Props) {
  const [modoOtro, setModoOtro] = useState(tipo === 'PASAPORTE')
  const [persona, setPersona] = useState<EstadoPersona | null>(() => {
    // Al editar un cliente existente: selector disponible sin consultar.
    const d = detectarIdentificacion(identificacion)
    return d && d.clase === 'natural' ? { ...d, tieneRuc: tipo === 'RUC' ? true : null } : null
  })
  const [consultando, setConsultando] = useState(false)
  const [verificando, setVerificando] = useState(false)
  const [mensaje, setMensaje] = useState<{ texto: string; tono: Tono } | null>(null)
  const [sugerencias, setSugerencias] = useState<ClienteRegistrado[]>([])
  const [listaAbierta, setListaAbierta] = useState(false)
  const [activa, setActiva] = useState(0)
  const ultimoConsultado = useRef(identificacion.replace(/\D/g, ''))
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  const temporizadorLista = useRef<ReturnType<typeof setTimeout> | null>(null)
  const busquedaId = useRef(0)

  useEffect(() => () => {
    if (temporizador.current) clearTimeout(temporizador.current)
    if (temporizadorLista.current) clearTimeout(temporizadorLista.current)
  }, [])

  const elegir = (p: EstadoPersona, t: 'CEDULA' | 'RUC') => {
    const numero = t === 'RUC' ? p.ruc! : p.cedula!
    ultimoConsultado.current = numero
    onChange({ identificacion: numero, tipo: t })
  }

  const consultar = async (valor = identificacion) => {
    if (modoOtro) return
    const num = valor.replace(/\D/g, '')
    if (num.length !== 10 && num.length !== 13) {
      setMensaje({
        texto: sugerirRegistrados
          ? 'Elige un cliente de la lista o escribe la cédula (10 dígitos) o el RUC (13 dígitos).'
          : 'Escribe la cédula (10 dígitos) o el RUC (13 dígitos).',
        tono: 'error',
      })
      return
    }
    ultimoConsultado.current = num
    setListaAbierta(false)
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

  // ── Sugerencias de clientes registrados ────────────────────────────────────
  const cargarSugerencias = async (texto: string) => {
    const id = ++busquedaId.current
    try {
      const lista = await buscarClientesRegistradosAction(texto)
      if (id !== busquedaId.current) return // llegó una búsqueda más nueva
      setSugerencias(lista)
      setActiva(0)
      setListaAbierta(lista.length > 0)
    } catch {
      if (id === busquedaId.current) setListaAbierta(false)
    }
  }

  const programarSugerencias = (valor: string) => {
    if (!sugerirRegistrados || modoOtro) return
    if (temporizadorLista.current) clearTimeout(temporizadorLista.current)
    const t = valor.trim()
    const num = t.replace(/\D/g, '')
    const esNumeroCompleto = /^[\d\s-]+$/.test(t) && (num.length === 10 || num.length === 13)
    if (esNumeroCompleto || t.length === 1) { busquedaId.current++; setListaAbierta(false); return }
    temporizadorLista.current = setTimeout(() => cargarSugerencias(t), t.length === 0 ? 0 : 250)
  }

  const seleccionarRegistrado = (c: ClienteRegistrado) => {
    setListaAbierta(false)
    busquedaId.current++
    if (detectarIdentificacion(c.identificacion)) {
      // Cédula/RUC/consumidor final: el flujo normal (BD local) carga todo y el selector.
      onChange({ identificacion: c.identificacion, tipo: c.tipoIdentificacion })
      consultar(c.identificacion)
      return
    }
    // Pasaporte u otro documento: se carga tal cual.
    setModoOtro(c.tipoIdentificacion === 'PASAPORTE')
    setPersona(null)
    onChange({ identificacion: c.identificacion, tipo: c.tipoIdentificacion })
    onSeleccionRegistrado?.(c)
    setMensaje({ texto: 'Cliente registrado: datos cargados.', tono: 'ok' })
  }

  const escribir = (valor: string) => {
    if (modoOtro) { onChange({ identificacion: valor, tipo }); return }
    programarSugerencias(valor)
    const esNumero = /^[\d\s-]*$/.test(valor)
    const num = valor.replace(/\D/g, '')
    // Tipo provisional por la longitud, por si la consulta falla o no se hace.
    const provisional = !esNumero ? tipo
      : num === CONSUMIDOR_FINAL ? 'CONSUMIDOR_FINAL' : num.length === 13 ? 'RUC' : num.length === 10 ? 'CEDULA' : tipo
    onChange({ identificacion: valor, tipo: provisional })
    if (!esNumero || num !== ultimoConsultado.current) { setPersona(null); setMensaje(null) }
    if (temporizador.current) clearTimeout(temporizador.current)
    // Pausa corta: si dictan un RUC, no se consulta a mitad (al llegar a 10).
    if (esNumero && consultaAutomatica && (num.length === 10 || num.length === 13) && num !== ultimoConsultado.current) {
      temporizador.current = setTimeout(() => consultar(valor), 800)
    }
  }

  const alTeclear = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (listaAbierta && sugerencias.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiva((i) => (i + 1) % sugerencias.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiva((i) => (i - 1 + sugerencias.length) % sugerencias.length); return }
      if (e.key === 'Escape') { e.preventDefault(); setListaAbierta(false); return }
      if (e.key === 'Enter') { e.preventDefault(); seleccionarRegistrado(sugerencias[activa]); return }
    }
    if (e.key === 'Enter') { e.preventDefault(); consultar() }
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
    setListaAbierta(false)
    onChange({ identificacion, tipo: nuevo ? 'PASAPORTE' : identificacion.replace(/\D/g, '').length === 13 ? 'RUC' : 'CEDULA' })
  }

  const lbl = 'text-xs font-semibold text-gray-500 dark:text-gray-400'
  const esNatural = !modoOtro && persona?.clase === 'natural'
  const conLista = sugerirRegistrados && !modoOtro
  const segmento = (activo: boolean) =>
    `px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
      activo
        ? 'bg-brand-600 text-white'
        : 'bg-white dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/10'
    }`

  return (
    <div className="space-y-1.5">
      <label className={lbl}>
        {modoOtro ? 'Pasaporte / otro documento *' : conLista ? 'Cliente (nombre, cédula o RUC) *' : 'Identificación (cédula o RUC) *'}
      </label>
      <div className="flex gap-1.5">
        {modoOtro && (
          <select value={tipo} onChange={(e) => onChange({ identificacion, tipo: e.target.value })} className="input w-36 shrink-0">
            <option value="PASAPORTE">Pasaporte</option>
            <option value="CONSUMIDOR_FINAL">Consumidor Final</option>
          </select>
        )}
        <div className="relative flex-1 min-w-0">
          <input
            value={identificacion}
            onChange={(e) => escribir(e.target.value)}
            onKeyDown={alTeclear}
            onFocus={() => { if (conLista && !identificacion.trim()) programarSugerencias('') }}
            onBlur={() => setTimeout(() => setListaAbierta(false), 150)}
            className={`input ${conLista ? '' : 'font-mono'}`}
            placeholder={modoOtro ? 'Número de documento' : conLista ? 'Nombre o número que dicta el cliente' : 'Escribe el número que dicta el cliente'}
            inputMode={modoOtro || conLista ? 'text' : 'numeric'}
            maxLength={conLista ? 60 : 15}
            autoComplete="off"
            role={conLista ? 'combobox' : undefined}
            aria-expanded={conLista ? listaAbierta : undefined}
            aria-controls={conLista ? 'lista-clientes-registrados' : undefined}
            required
          />
          {conLista && listaAbierta && (
            <ul
              id="lista-clientes-registrados"
              role="listbox"
              className="absolute z-20 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#15152a] shadow-lg py-1"
            >
              {!identificacion.trim() && (
                <li className="px-3 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Recientes</li>
              )}
              {sugerencias.map((c, i) => (
                <li key={c.id} role="option" aria-selected={i === activa}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()} // evita perder el foco antes del clic
                    onClick={() => seleccionarRegistrado(c)}
                    onMouseEnter={() => setActiva(i)}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between gap-3 ${
                      i === activa ? 'bg-brand-50 dark:bg-white/10' : ''
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-900 dark:text-white truncate">{c.nombre}</span>
                      <span className="block text-xs font-mono text-gray-500 dark:text-gray-400">{c.identificacion}</span>
                    </span>
                    <span className="shrink-0 text-[10px] font-semibold text-gray-400 uppercase">{ETIQUETA_TIPO[c.tipoIdentificacion] ?? c.tipoIdentificacion}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
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
