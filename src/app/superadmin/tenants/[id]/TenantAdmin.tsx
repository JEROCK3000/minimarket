'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save, KeyRound, Ban, PlayCircle, XCircle, CalendarPlus, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import {
  actualizarTenantAction, cambiarPlanAction, registrarPagoAction, fijarVencimientoAction,
  suspenderTenantAction, cancelarTenantAction, restablecerPasswordUsuarioAction,
} from '../../actions'
import { PasswordTemporalModal } from '@/components/ui/PasswordTemporalModal'
import type { EstadoSuscripcion } from '@/lib/saas/suscripcion'

interface TenantInfo {
  id: string; nombre: string; ruc: string | null; emailContacto: string | null; telefono: string | null; notasAdmin: string | null
  planId: string | null; cicloFacturacion: 'MENSUAL' | 'ANUAL'; estadoGuardado: string; suspendidoManual: boolean
  fechaExpiracion: string | null; estado: EstadoSuscripcion; diasRestantes: number | null; slug: string; creado: string
}
const money = (n: number) => `$${n.toFixed(2)}`
const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const lbl = 'text-xs font-semibold text-gray-500 dark:text-gray-400'

export function TenantAdmin({ tenant, kpis, usuarios, pagos, planes }: {
  tenant: TenantInfo
  kpis: { n: string; v: string | number }[]
  usuarios: { id: string; nombre: string; email: string; rol: string; activo: boolean }[]
  pagos: { id: string; fecha: string; tipo: string; monto: number; referencia: string | null; desde: string; hasta: string }[]
  planes: { id: string; nombre: string; activo: boolean }[]
}) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [temporal, setTemporal] = useState<{ email: string; password: string } | null>(null)
  const [plan, setPlan] = useState({ planId: tenant.planId ?? '', ciclo: tenant.cicloFacturacion })
  const [pago, setPago] = useState({ monto: '', tipo: 'TRANSFERENCIA' as const, referencia: '', meses: tenant.cicloFacturacion === 'ANUAL' ? '12' : '1', notas: '' })
  const [venc, setVenc] = useState(tenant.fechaExpiracion ? tenant.fechaExpiracion.slice(0, 10) : '')
  const [datos, setDatos] = useState({ nombre: tenant.nombre, ruc: tenant.ruc ?? '', emailContacto: tenant.emailContacto ?? '', telefono: tenant.telefono ?? '', notasAdmin: tenant.notasAdmin ?? '' })

  const ejecutar = async (clave: string, fn: () => Promise<{ error?: string; success?: boolean }>, ok: string) => {
    setOcupado(clave)
    try {
      const r = await fn()
      if (r.error) { toast.error(r.error); return false }
      toast.success(ok); router.refresh(); return true
    } finally { setOcupado(null) }
  }
  const spin = (k: string, Icono: typeof Save) => (ocupado === k ? <Loader2 size={15} className="animate-spin" /> : <Icono size={15} />)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Izquierda: datos del negocio */}
      <div className="lg:col-span-2 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {kpis.map((k) => (
            <div key={k.n} className="card"><p className="text-xs text-gray-500">{k.n}</p><p className="text-lg font-black text-gray-900 dark:text-white">{k.v}</p></div>
          ))}
        </div>

        <div className="card">
          <h2 className="font-bold text-gray-900 dark:text-white text-sm mb-3">Usuarios</h2>
          <table className="w-full text-sm"><tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className={`border-b border-gray-50 dark:border-white/5 last:border-0 ${u.activo ? '' : 'opacity-50'}`}>
                <td className="py-2"><p className="font-medium text-gray-900 dark:text-white">{u.nombre}</p><p className="text-xs text-gray-500">{u.email}</p></td>
                <td className="py-2 text-xs text-gray-500">{u.rol === 'ADMIN' ? 'Administrador' : 'Cajero'}{u.activo ? '' : ' · inactivo'}</td>
                <td className="py-2 text-right">
                  <button onClick={async () => {
                    setOcupado(u.id)
                    try {
                      const r = await restablecerPasswordUsuarioAction(tenant.id, u.id)
                      if ('error' in r) toast.error(r.error); else setTemporal({ email: r.email, password: r.passwordTemporal })
                    } finally { setOcupado(null) }
                  }} disabled={!!ocupado} className="btn-ghost h-8 px-2.5 text-xs">{spin(u.id, KeyRound)} Restablecer contraseña</button>
                </td>
              </tr>
            ))}
          </tbody></table>
        </div>

        <div className="card">
          <h2 className="font-bold text-gray-900 dark:text-white text-sm mb-3">Pagos de suscripción</h2>
          {pagos.length === 0 ? <p className="text-sm text-gray-400">Sin pagos registrados.</p> : (
            <table className="w-full text-sm"><tbody>
              {pagos.map((p) => (
                <tr key={p.id} className="border-b border-gray-50 dark:border-white/5 last:border-0">
                  <td className="py-2 text-gray-500">{fecha(p.fecha)}</td>
                  <td className="py-2 text-xs text-gray-600 dark:text-gray-300">{fecha(p.desde)} → {fecha(p.hasta)}</td>
                  <td className="py-2 text-xs text-gray-500">{p.tipo}{p.referencia ? ` · ${p.referencia}` : ''}</td>
                  <td className="py-2 text-right font-semibold text-gray-900 dark:text-white">{money(p.monto)}</td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>

        <form className="card space-y-3" onSubmit={(e) => { e.preventDefault(); ejecutar('datos', () => actualizarTenantAction(tenant.id, datos), 'Datos guardados') }}>
          <h2 className="font-bold text-gray-900 dark:text-white text-sm">Datos del negocio</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input value={datos.nombre} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} className="input" placeholder="Nombre" aria-label="Nombre" required />
            <input value={datos.ruc} onChange={(e) => setDatos({ ...datos, ruc: e.target.value })} className="input font-mono" placeholder="RUC" aria-label="RUC" maxLength={13} />
            <input value={datos.emailContacto} onChange={(e) => setDatos({ ...datos, emailContacto: e.target.value })} className="input" placeholder="Correo de contacto" aria-label="Correo" type="email" />
            <input value={datos.telefono} onChange={(e) => setDatos({ ...datos, telefono: e.target.value })} className="input" placeholder="Teléfono" aria-label="Teléfono" />
          </div>
          <textarea value={datos.notasAdmin} onChange={(e) => setDatos({ ...datos, notasAdmin: e.target.value })} className="input min-h-[60px]" placeholder="Notas internas de Solinteec (no las ve el cliente)" aria-label="Notas internas" />
          <div className="flex justify-between items-center">
            <p className="text-[11px] text-gray-400">Identificador: {tenant.slug} · creado el {fecha(tenant.creado)}</p>
            <button type="submit" disabled={!!ocupado} className="btn-primary text-sm">{spin('datos', Save)} Guardar</button>
          </div>
        </form>
      </div>

      {/* Derecha: administración de la suscripción */}
      <div className="space-y-6">
        <div className="card space-y-3">
          <h2 className="font-bold text-gray-900 dark:text-white text-sm">Plan</h2>
          <select value={plan.planId} onChange={(e) => setPlan({ ...plan, planId: e.target.value })} className="input" aria-label="Plan">
            <option value="">Sin plan (sin límites)</option>
            {planes.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.activo ? '' : ' (inactivo)'}</option>)}
          </select>
          <select value={plan.ciclo} onChange={(e) => setPlan({ ...plan, ciclo: e.target.value as 'MENSUAL' | 'ANUAL' })} className="input" aria-label="Ciclo">
            <option value="MENSUAL">Mensual</option><option value="ANUAL">Anual</option>
          </select>
          <button onClick={() => ejecutar('plan', () => cambiarPlanAction(tenant.id, plan.planId || null, plan.ciclo), 'Plan actualizado')} disabled={!!ocupado} className="btn-primary w-full text-sm">{spin('plan', Save)} Cambiar plan</button>
        </div>

        <form className="card space-y-3" onSubmit={async (e) => {
          e.preventDefault()
          if (await ejecutar('pago', () => registrarPagoAction(tenant.id, { ...pago, monto: Number(pago.monto), meses: Number(pago.meses) }), 'Pago registrado y vigencia extendida')) setPago({ ...pago, monto: '', referencia: '', notas: '' })
        }}>
          <h2 className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2"><Wallet size={15} /> Registrar pago</h2>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" step="0.01" min="0" value={pago.monto} onChange={(e) => setPago({ ...pago, monto: e.target.value })} className="input" placeholder="Monto $" aria-label="Monto" required />
            <input type="number" min="1" max="36" value={pago.meses} onChange={(e) => setPago({ ...pago, meses: e.target.value })} className="input" aria-label="Meses que cubre" title="Meses que cubre" />
          </div>
          <select value={pago.tipo} onChange={(e) => setPago({ ...pago, tipo: e.target.value as typeof pago.tipo })} className="input" aria-label="Forma de pago">
            <option value="TRANSFERENCIA">Transferencia</option><option value="EFECTIVO">Efectivo</option><option value="TARJETA">Tarjeta</option><option value="CORTESIA">Cortesía</option>
          </select>
          <input value={pago.referencia} onChange={(e) => setPago({ ...pago, referencia: e.target.value })} className="input" placeholder="Referencia (nº de transferencia)" aria-label="Referencia" maxLength={200} />
          <p className="text-[11px] text-gray-400">Extiende la vigencia desde {tenant.fechaExpiracion && new Date(tenant.fechaExpiracion) > new Date() ? `el vencimiento actual (${fecha(tenant.fechaExpiracion)})` : 'hoy'}.</p>
          <button type="submit" disabled={!!ocupado} className="btn-primary w-full text-sm">{spin('pago', Wallet)} Registrar pago</button>
        </form>

        <div className="card space-y-3">
          <h2 className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2"><CalendarPlus size={15} /> Vencimiento</h2>
          <p className="text-xs text-gray-500">Actual: {tenant.fechaExpiracion ? `${fecha(tenant.fechaExpiracion)}${tenant.diasRestantes !== null ? ` (${tenant.diasRestantes >= 0 ? `faltan ${tenant.diasRestantes} d` : `venció hace ${-tenant.diasRestantes} d`})` : ''}` : 'no vence'}</p>
          <input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} className="input" aria-label="Nueva fecha de vencimiento" />
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => ejecutar('venc', () => fijarVencimientoAction(tenant.id, venc || null), 'Vencimiento actualizado')} disabled={!!ocupado || !venc} className="btn-ghost text-xs">{spin('venc', CalendarPlus)} Fijar fecha</button>
            <button onClick={() => ejecutar('sinvenc', () => fijarVencimientoAction(tenant.id, null), 'Sin vencimiento')} disabled={!!ocupado} className="btn-ghost text-xs">Quitar vencimiento</button>
          </div>
        </div>

        <div className="card space-y-2">
          <h2 className="font-bold text-gray-900 dark:text-white text-sm">Acceso</h2>
          {tenant.estadoGuardado !== 'CANCELADO' && (
            <button onClick={() => ejecutar('susp', () => suspenderTenantAction(tenant.id, !tenant.suspendidoManual), tenant.suspendidoManual ? 'Suspensión levantada' : 'Minimarket suspendido')}
              disabled={!!ocupado} className={`btn-ghost w-full text-sm ${tenant.suspendidoManual ? 'text-emerald-600' : 'text-amber-600'}`}>
              {spin('susp', tenant.suspendidoManual ? PlayCircle : Ban)} {tenant.suspendidoManual ? 'Levantar suspensión' : 'Suspender (solo consulta)'}
            </button>
          )}
          <button onClick={() => ejecutar('cancel', () => cancelarTenantAction(tenant.id, tenant.estadoGuardado !== 'CANCELADO'), tenant.estadoGuardado === 'CANCELADO' ? 'Minimarket reactivado' : 'Minimarket cancelado')}
            disabled={!!ocupado} className={`btn-ghost w-full text-sm ${tenant.estadoGuardado === 'CANCELADO' ? 'text-emerald-600' : 'text-red-600'}`}>
            {spin('cancel', tenant.estadoGuardado === 'CANCELADO' ? PlayCircle : XCircle)} {tenant.estadoGuardado === 'CANCELADO' ? 'Reactivar cuenta' : 'Cancelar cuenta (sin acceso)'}
          </button>
          <p className="text-[11px] text-gray-400">Suspender: el negocio consulta pero no vende ni factura. Cancelar: no puede ni iniciar sesión. Ambos son reversibles y no borran datos.</p>
        </div>
      </div>

      {temporal && <PasswordTemporalModal email={temporal.email} password={temporal.password} onClose={() => setTemporal(null)} />}
    </div>
  )
}
