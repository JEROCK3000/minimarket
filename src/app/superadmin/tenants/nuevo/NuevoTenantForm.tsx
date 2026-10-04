'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { crearTenantAction, type NuevoTenantValues } from '../../actions'
import { PasswordTemporalModal } from '@/components/ui/PasswordTemporalModal'

interface PlanOpt { id: string; nombre: string; precioMensual: number; diasPrueba: number }

export function NuevoTenantForm({ planes }: { planes: PlanOpt[] }) {
  const router = useRouter()
  const [f, setF] = useState<NuevoTenantValues>({
    nombre: '', ruc: '', emailContacto: '', telefono: '', planId: planes[0]?.id ?? '', cicloFacturacion: 'MENSUAL',
    estado: 'PRUEBA', diasVigencia: planes[0]?.diasPrueba || 15, adminNombre: '', adminEmail: '',
  })
  const [guardando, setGuardando] = useState(false)
  const [creado, setCreado] = useState<{ tenantId: string; email: string; password: string } | null>(null)
  const set = <K extends keyof NuevoTenantValues>(k: K, v: NuevoTenantValues[K]) => setF((s) => ({ ...s, [k]: v }))
  const lbl = 'text-xs font-semibold text-gray-500 dark:text-gray-400'

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    try {
      const r = await crearTenantAction(f)
      if ('error' in r) { toast.error(r.error); return }
      toast.success('Minimarket creado')
      setCreado({ tenantId: r.tenantId!, email: r.adminEmail!, password: r.passwordTemporal! })
    } finally { setGuardando(false) }
  }

  return (
    <>
      <form onSubmit={guardar} className="space-y-6">
        <div className="card space-y-4">
          <h2 className="font-bold text-gray-900 dark:text-white text-sm">Negocio</h2>
          <div className="space-y-1.5">
            <label className={lbl} htmlFor="t-nombre">Nombre del minimarket *</label>
            <input id="t-nombre" value={f.nombre} onChange={(e) => set('nombre', e.target.value)} className="input" required maxLength={150} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className={lbl} htmlFor="t-ruc">RUC</label>
              <input id="t-ruc" value={f.ruc} onChange={(e) => set('ruc', e.target.value)} className="input font-mono" maxLength={13} inputMode="numeric" />
            </div>
            <div className="space-y-1.5">
              <label className={lbl} htmlFor="t-email">Correo de contacto *</label>
              <input id="t-email" type="email" value={f.emailContacto} onChange={(e) => set('emailContacto', e.target.value)} className="input" required />
            </div>
            <div className="space-y-1.5">
              <label className={lbl} htmlFor="t-tel">Teléfono</label>
              <input id="t-tel" value={f.telefono} onChange={(e) => set('telefono', e.target.value)} className="input" maxLength={20} />
            </div>
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="font-bold text-gray-900 dark:text-white text-sm">Suscripción</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className={lbl} htmlFor="t-plan">Plan</label>
              <select id="t-plan" value={f.planId} onChange={(e) => { const p = planes.find((x) => x.id === e.target.value); setF((s) => ({ ...s, planId: e.target.value, diasVigencia: s.estado === 'PRUEBA' && p?.diasPrueba ? p.diasPrueba : s.diasVigencia })) }} className="input">
                <option value="">Sin plan (sin límites)</option>
                {planes.map((p) => <option key={p.id} value={p.id}>{p.nombre} — ${p.precioMensual.toFixed(2)}/mes</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={lbl} htmlFor="t-ciclo">Ciclo de facturación</label>
              <select id="t-ciclo" value={f.cicloFacturacion} onChange={(e) => set('cicloFacturacion', e.target.value as 'MENSUAL' | 'ANUAL')} className="input">
                <option value="MENSUAL">Mensual</option><option value="ANUAL">Anual</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={lbl} htmlFor="t-estado">Inicia en</label>
              <select id="t-estado" value={f.estado} onChange={(e) => set('estado', e.target.value as 'PRUEBA' | 'ACTIVO')} className="input">
                <option value="PRUEBA">Prueba</option><option value="ACTIVO">Activo (pagado)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={lbl} htmlFor="t-dias">Días de vigencia (0 = no vence)</label>
              <input id="t-dias" type="number" min={0} max={3660} value={f.diasVigencia} onChange={(e) => set('diasVigencia', Number(e.target.value))} className="input" />
            </div>
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="font-bold text-gray-900 dark:text-white text-sm">Administrador del minimarket</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className={lbl} htmlFor="t-an">Nombre *</label>
              <input id="t-an" value={f.adminNombre} onChange={(e) => set('adminNombre', e.target.value)} className="input" required maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <label className={lbl} htmlFor="t-ae">Correo (inicia sesión con este) *</label>
              <input id="t-ae" type="email" value={f.adminEmail} onChange={(e) => set('adminEmail', e.target.value)} className="input" required maxLength={180} />
            </div>
          </div>
          <p className="text-xs text-gray-500">Se generará una contraseña temporal que verás una sola vez.</p>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => router.push('/superadmin')} className="btn-ghost">Cancelar</button>
          <button type="submit" disabled={guardando} className="btn-primary">
            {guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Crear minimarket
          </button>
        </div>
      </form>
      {creado && (
        <PasswordTemporalModal
          email={creado.email} password={creado.password}
          nota="Entrégala al administrador del minimarket junto con la dirección del sistema."
          onClose={() => router.push(`/superadmin/tenants/${creado.tenantId}`)}
        />
      )}
    </>
  )
}
