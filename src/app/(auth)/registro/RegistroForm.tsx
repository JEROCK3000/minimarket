'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Send, Check } from 'lucide-react'
import { toast } from 'sonner'
import { registrarSolicitudAction } from './actions'

interface Plan {
  id: string; nombre: string; descripcion: string; precioMensual: number; precioAnual: number
  maxUsuarios: number | null; maxProductos: number | null; maxFacturasMes: number | null; diasPrueba: number
}
const lim = (n: number | null, t: string) => (n === null ? `${t} ilimitados` : `Hasta ${n} ${t}`)

export function RegistroForm({ planes }: { planes: Plan[] }) {
  const router = useRouter()
  const [planId, setPlanId] = useState(planes[Math.min(1, planes.length - 1)]?.id ?? '')
  const [ciclo, setCiclo] = useState<'MENSUAL' | 'ANUAL'>('MENSUAL')
  const [f, setF] = useState({ nombreNegocio: '', ruc: '', direccion: '', telefono: '', emailContacto: '', adminNombre: '', adminEmail: '', password: '', confirmar: '' })
  const [acepta, setAcepta] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }))
  const lbl = 'text-xs font-semibold text-gray-500 dark:text-gray-400'

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (f.password !== f.confirmar) { toast.error('Las contraseñas no coinciden'); return }
    setEnviando(true)
    try {
      const { confirmar: _c, ...datos } = f
      const r = await registrarSolicitudAction({ ...datos, planId, cicloFacturacion: ciclo, aceptaTerminos: acepta as true })
      if ('error' in r) { toast.error(r.error); return }
      router.push(`/registro/solicitud/${r.token}`)
    } finally { setEnviando(false) }
  }

  const campo = (k: keyof typeof f, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="space-y-1.5">
      <label className={lbl} htmlFor={`r-${k}`}>{label}</label>
      <input id={`r-${k}`} value={f[k]} onChange={(e) => set(k, e.target.value)} className="input" {...extra} />
    </div>
  )

  return (
    <form onSubmit={enviar} className="space-y-6">
      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-gray-900 dark:text-white">1. Elige tu plan</h2>
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-white/10 overflow-hidden" role="group" aria-label="Ciclo de pago">
            {(['MENSUAL', 'ANUAL'] as const).map((c) => (
              <button key={c} type="button" onClick={() => setCiclo(c)} aria-pressed={ciclo === c}
                className={`px-3 py-1.5 text-xs font-semibold ${ciclo === c ? 'bg-brand-600 text-white' : 'bg-white dark:bg-white/5 text-gray-600 dark:text-gray-300'}`}>
                {c === 'MENSUAL' ? 'Mensual' : 'Anual'}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="radiogroup" aria-label="Plan">
          {planes.map((p) => {
            const activo = p.id === planId
            return (
              <button key={p.id} type="button" role="radio" aria-checked={activo} onClick={() => setPlanId(p.id)}
                className={`text-left rounded-xl border p-4 transition ${activo ? 'border-brand-600 ring-2 ring-brand-600/20 bg-brand-50/50 dark:bg-brand-500/10' : 'border-gray-200 dark:border-white/10 hover:border-brand-400'}`}>
                <div className="flex items-center justify-between">
                  <p className="font-bold text-gray-900 dark:text-white">{p.nombre}</p>
                  {activo && <Check size={16} className="text-brand-600" />}
                </div>
                <p className="text-2xl font-black text-gray-900 dark:text-white mt-1">
                  ${(ciclo === 'ANUAL' ? p.precioAnual : p.precioMensual).toFixed(2)}
                  <span className="text-xs font-normal text-gray-500"> /{ciclo === 'ANUAL' ? 'año' : 'mes'}</span>
                </p>
                {p.descripcion && <p className="text-xs text-gray-500 mt-1">{p.descripcion}</p>}
                <ul className="text-xs text-gray-600 dark:text-gray-300 mt-2 space-y-0.5">
                  <li>{lim(p.maxUsuarios, 'usuarios')}</li><li>{lim(p.maxProductos, 'productos')}</li><li>{lim(p.maxFacturasMes, 'facturas al mes')}</li>
                  {p.diasPrueba > 0 && <li className="text-brand-600 dark:text-brand-400 font-semibold">{p.diasPrueba} días de prueba</li>}
                </ul>
              </button>
            )
          })}
        </div>
      </div>

      <div className="card space-y-4">
        <h2 className="font-bold text-gray-900 dark:text-white">2. Tu negocio</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {campo('nombreNegocio', 'Nombre del minimarket *', { required: true, maxLength: 150 })}
          {campo('ruc', 'RUC *', { required: true, maxLength: 13, inputMode: 'numeric', className: 'input font-mono' })}
          {campo('emailContacto', 'Correo de contacto *', { required: true, type: 'email' })}
          {campo('telefono', 'Teléfono', { maxLength: 20 })}
        </div>
        {campo('direccion', 'Dirección', { maxLength: 300 })}
      </div>

      <div className="card space-y-4">
        <h2 className="font-bold text-gray-900 dark:text-white">3. Tu usuario administrador</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {campo('adminNombre', 'Tu nombre *', { required: true, maxLength: 120 })}
          {campo('adminEmail', 'Correo para iniciar sesión *', { required: true, type: 'email', maxLength: 180, autoComplete: 'username' })}
          {campo('password', 'Contraseña (mín. 10 caracteres) *', { required: true, type: 'password', minLength: 10, autoComplete: 'new-password' })}
          {campo('confirmar', 'Confirmar contraseña *', { required: true, type: 'password', autoComplete: 'new-password' })}
        </div>
        <label className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
          <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} className="mt-0.5" required />
          Acepto que Solinteec trate estos datos para crear y administrar mi cuenta.
        </label>
      </div>

      <button type="submit" disabled={enviando || !planId} className="btn-primary w-full h-11">
        {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Enviar solicitud
      </button>
    </form>
  )
}
