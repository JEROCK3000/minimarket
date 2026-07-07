'use client'

import { useState } from 'react'
import { Mail, Save, Send, Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { guardarCorreoConfigAction, probarCorreoAction } from './actions'

interface Config {
  smtp_host: string; smtp_port: string; smtp_user: string; smtp_pass: string
  smtp_secure: boolean; smtp_from_name: string; smtp_from_email: string
}

export function CorreoConfigForm({ config }: { config: Config | null }) {
  const [f, setF] = useState({
    smtp_host: config?.smtp_host ?? '',
    smtp_port: config?.smtp_port ?? '465',
    smtp_user: config?.smtp_user ?? '',
    smtp_pass: config?.smtp_pass ?? '',
    smtp_secure: config?.smtp_secure ?? true,
    smtp_from_name: config?.smtp_from_name ?? 'MiniMarket',
    smtp_from_email: config?.smtp_from_email ?? '',
  })
  const [dest, setDest] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const set = (k: keyof typeof f, v: string | boolean) => setF((s) => ({ ...s, [k]: v }))

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await guardarCorreoConfigAction(f)
      if (res.success) toast.success('Configuración de correo guardada')
      else toast.error(res.error || 'No se pudo guardar')
    } finally { setSaving(false) }
  }

  const probar = async () => {
    if (!f.smtp_host || !f.smtp_user) { toast.error('Completa los datos SMTP'); return }
    setTesting(true)
    const prom = probarCorreoAction({ ...f, destinatario: dest })
    toast.promise(prom.then((r) => { if (!r.success) throw new Error(r.error); return r }), {
      loading: 'Enviando correo de prueba...',
      success: `Correo de prueba enviado a ${dest || 'tu correo'}`,
      error: (e) => e.message || 'Falló la prueba',
    })
    try { await prom } finally { setTesting(false) }
  }

  const lbl = 'text-xs font-semibold text-gray-500 dark:text-gray-400'

  return (
    <form onSubmit={guardar} className="space-y-6">
      <div className="card space-y-4">
        <h3 className="font-bold text-gray-900 dark:text-white text-sm border-b border-gray-100 dark:border-white/5 pb-2 flex items-center gap-2">
          <Mail size={16} className="text-brand-600" /> Servidor de correo saliente (SMTP)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2 space-y-1.5"><label className={lbl}>Servidor SMTP *</label><input value={f.smtp_host} onChange={(e) => set('smtp_host', e.target.value)} className="input" placeholder="smtp.gmail.com" required /></div>
          <div className="space-y-1.5"><label className={lbl}>Puerto *</label><input value={f.smtp_port} onChange={(e) => set('smtp_port', e.target.value)} className="input" placeholder="465" required /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5"><label className={lbl}>Usuario (email) *</label><input type="email" value={f.smtp_user} onChange={(e) => set('smtp_user', e.target.value)} className="input" required /></div>
          <div className="space-y-1.5"><label className={lbl}>Contraseña {config && <span className="text-gray-400">(se conserva si no la cambias)</span>}</label><input type="password" value={f.smtp_pass} onChange={(e) => set('smtp_pass', e.target.value)} className="input" placeholder="••••••••" /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5"><label className={lbl}>Nombre del remitente</label><input value={f.smtp_from_name} onChange={(e) => set('smtp_from_name', e.target.value)} className="input" /></div>
          <div className="space-y-1.5"><label className={lbl}>Correo del remitente</label><input type="email" value={f.smtp_from_email} onChange={(e) => set('smtp_from_email', e.target.value)} className="input" placeholder="(opcional)" /></div>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
          <input type="checkbox" checked={f.smtp_secure} onChange={(e) => set('smtp_secure', e.target.checked)} className="w-4 h-4" />
          <ShieldCheck size={14} className="text-green-500" /> Conexión segura SSL/TLS (recomendado, puerto 465)
        </label>

        <div className="border-t border-gray-100 dark:border-white/5 pt-4 space-y-2">
          <label className={lbl}>Enviar correo de prueba a</label>
          <div className="flex gap-2">
            <input type="email" value={dest} onChange={(e) => setDest(e.target.value)} className="input" placeholder="tucorreo@ejemplo.com" />
            <button type="button" onClick={probar} disabled={testing} className="btn-ghost shrink-0">
              {testing ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Probar
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar
        </button>
      </div>
    </form>
  )
}
