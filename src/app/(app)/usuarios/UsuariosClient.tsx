'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, Pencil, KeyRound, UserX, UserCheck, Loader2, X, Copy, Save, ShieldCheck, UserCog } from 'lucide-react'
import { toast } from 'sonner'
import {
  crearUsuarioAction, actualizarUsuarioAction, cambiarEstadoUsuarioAction, restablecerPasswordAction,
} from './actions'

export interface UsuarioRow {
  id: string; nombre: string; email: string; rol: 'USER' | 'ADMIN'; activo: boolean; creado: string; ventas: number
}
const ROL_TXT = { ADMIN: 'Administrador', USER: 'Cajero' } as const

export function UsuariosClient({ usuarios, yoId }: { usuarios: UsuarioRow[]; yoId: string }) {
  const router = useRouter()
  const [busqueda, setBusqueda] = useState('')
  const [form, setForm] = useState<{ modo: 'nuevo' } | { modo: 'editar'; u: UsuarioRow } | null>(null)
  const [temporal, setTemporal] = useState<{ email: string; password: string } | null>(null)
  const [accion, setAccion] = useState<string | null>(null)

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return usuarios.filter((u) => !q || u.nombre.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
  }, [usuarios, busqueda])

  const cambiarEstado = async (u: UsuarioRow) => {
    setAccion(u.id + '-estado')
    try {
      const r = await cambiarEstadoUsuarioAction(u.id, !u.activo)
      if ('error' in r) toast.error(r.error)
      else { toast.success(u.activo ? 'Usuario desactivado' : 'Usuario activado'); router.refresh() }
    } finally { setAccion(null) }
  }

  const restablecer = async (u: UsuarioRow) => {
    setAccion(u.id + '-pass')
    try {
      const r = await restablecerPasswordAction(u.id)
      if ('error' in r) toast.error(r.error)
      else setTemporal({ email: u.email, password: r.passwordTemporal })
    } finally { setAccion(null) }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Usuarios</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Cajeros y administradores de tu minimarket</p>
        </div>
        <button onClick={() => setForm({ modo: 'nuevo' })} className="btn-primary"><Plus size={16} /> Nuevo usuario</button>
      </div>

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="input pl-9" placeholder="Buscar por nombre o correo" />
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/5 text-left text-xs text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 font-semibold">Usuario</th>
                <th className="px-4 py-3 font-semibold">Rol</th>
                <th className="px-4 py-3 font-semibold text-center">Ventas</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">Ningún usuario coincide con la búsqueda.</td></tr>
              )}
              {filtrados.map((u) => {
                const yo = u.id === yoId
                return (
                  <tr key={u.id} className={`border-b border-gray-50 dark:border-white/5 ${u.activo ? '' : 'opacity-60'}`}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900 dark:text-white">{u.nombre} {yo && <span className="text-[10px] font-bold text-brand-600">(tú)</span>}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700 dark:text-gray-300">
                        {u.rol === 'ADMIN' ? <ShieldCheck size={13} className="text-brand-600" /> : <UserCog size={13} className="text-gray-400" />}
                        {ROL_TXT[u.rol]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-300">{u.ventas}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${u.activo
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                        : 'bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400'}`}>
                        {u.activo ? 'ACTIVO' : 'INACTIVO'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => setForm({ modo: 'editar', u })} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 hover:text-brand-600" title="Editar" aria-label={`Editar ${u.nombre}`}>
                        <Pencil size={15} />
                      </button>
                      {!yo && (
                        <>
                          <button onClick={() => restablecer(u)} disabled={accion === u.id + '-pass'} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 hover:text-brand-600" title="Restablecer contraseña" aria-label={`Restablecer contraseña de ${u.nombre}`}>
                            {accion === u.id + '-pass' ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
                          </button>
                          <button onClick={() => cambiarEstado(u)} disabled={accion === u.id + '-estado'} className={`p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 ${u.activo ? 'text-gray-500 hover:text-red-500' : 'text-gray-500 hover:text-emerald-600'}`} title={u.activo ? 'Desactivar' : 'Activar'} aria-label={`${u.activo ? 'Desactivar' : 'Activar'} ${u.nombre}`}>
                            {accion === u.id + '-estado' ? <Loader2 size={15} className="animate-spin" /> : u.activo ? <UserX size={15} /> : <UserCheck size={15} />}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <UsuarioForm
          usuario={form.modo === 'editar' ? form.u : null}
          esYo={form.modo === 'editar' && form.u.id === yoId}
          onClose={() => setForm(null)}
          onCreado={(email, password) => { setForm(null); setTemporal({ email, password }); router.refresh() }}
          onGuardado={() => { setForm(null); router.refresh() }}
        />
      )}

      {temporal && <PasswordTemporal {...temporal} onClose={() => setTemporal(null)} />}
    </div>
  )
}

function UsuarioForm({ usuario, esYo, onClose, onCreado, onGuardado }: {
  usuario: UsuarioRow | null; esYo: boolean; onClose: () => void
  onCreado: (email: string, password: string) => void; onGuardado: () => void
}) {
  const [nombre, setNombre] = useState(usuario?.nombre ?? '')
  const [email, setEmail] = useState(usuario?.email ?? '')
  const [rol, setRol] = useState<'USER' | 'ADMIN'>(usuario?.rol ?? 'USER')
  const [guardando, setGuardando] = useState(false)
  const lbl = 'text-xs font-semibold text-gray-500 dark:text-gray-400'

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    try {
      if (usuario) {
        const r = await actualizarUsuarioAction(usuario.id, { nombre, rol })
        if ('error' in r) { toast.error(r.error); return }
        toast.success('Usuario actualizado'); onGuardado()
      } else {
        const r = await crearUsuarioAction({ nombre, email, rol })
        if ('error' in r) { toast.error(r.error); return }
        onCreado(email.trim().toLowerCase(), r.passwordTemporal)
      }
    } finally { setGuardando(false) }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={onClose}>
      <form onSubmit={guardar} className="w-full max-w-md bg-white dark:bg-[#0f0f1e] rounded-2xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/5">
          <h2 className="font-bold text-gray-900 dark:text-white">{usuario ? 'Editar usuario' : 'Nuevo usuario'}</h2>
          <button type="button" onClick={onClose} className="p-1 text-gray-400" aria-label="Cerrar"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className={lbl} htmlFor="u-nombre">Nombre *</label>
            <input id="u-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className="input" required maxLength={120} autoFocus />
          </div>
          <div className="space-y-1.5">
            <label className={lbl} htmlFor="u-email">Correo (para iniciar sesión) *</label>
            <input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" required maxLength={180} disabled={!!usuario} />
            {usuario && <p className="text-[11px] text-gray-400">El correo lo cambia cada usuario en Configuración → Seguridad.</p>}
          </div>
          <div className="space-y-1.5">
            <label className={lbl} htmlFor="u-rol">Rol *</label>
            <select id="u-rol" value={rol} onChange={(e) => setRol(e.target.value as 'USER' | 'ADMIN')} className="input" disabled={esYo}>
              <option value="USER">Cajero — POS, ventas y consultas</option>
              <option value="ADMIN">Administrador — acceso total</option>
            </select>
          </div>
          {!usuario && (
            <p className="text-xs text-gray-500 dark:text-gray-400">Se generará una contraseña temporal que verás una sola vez para entregarla al usuario.</p>
          )}
        </div>
        <div className="flex justify-end gap-2 px-6 pb-6">
          <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
          <button type="submit" disabled={guardando} className="btn-primary">
            {guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {usuario ? 'Guardar' : 'Crear usuario'}
          </button>
        </div>
      </form>
    </div>
  )
}

function PasswordTemporal({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  const copiar = async () => {
    try { await navigator.clipboard.writeText(password); toast.success('Contraseña copiada') }
    catch { toast.error('No se pudo copiar; anótala a mano') }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50">
      <div className="w-full max-w-sm bg-white dark:bg-[#0f0f1e] rounded-2xl shadow-xl p-6 space-y-4 text-center" role="dialog" aria-modal="true" aria-labelledby="titulo-temporal">
        <KeyRound size={36} className="mx-auto text-brand-600" />
        <h2 id="titulo-temporal" className="font-bold text-gray-900 dark:text-white">Contraseña temporal</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">Para <strong>{email}</strong>. Entrégala al usuario: <strong>solo se muestra esta vez</strong>. Debe cambiarla en Configuración → Seguridad.</p>
        <div className="flex items-center gap-2 rounded-xl bg-gray-100 dark:bg-white/5 px-3 py-2.5">
          <code className="flex-1 font-mono text-base text-gray-900 dark:text-white select-all">{password}</code>
          <button onClick={copiar} className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 text-gray-500" aria-label="Copiar contraseña"><Copy size={16} /></button>
        </div>
        <button onClick={onClose} className="btn-primary w-full">Listo, ya la anoté</button>
      </div>
    </div>
  )
}
