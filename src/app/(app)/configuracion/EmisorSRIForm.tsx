'use client'

import { useState } from 'react'
import { Loader2, Save, ShieldCheck, Upload, Search, Image as ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { guardarEmisorSRIAction } from './actions'

interface Config {
  ruc: string; razonSocial: string; nombreComercial: string
  dirMatriz: string; dirEstablecimiento: string
  codigoEstablecimiento: string; codigoPuntoEmision: string
  obligadoContabilidad: boolean; ambiente: number
  passwordFirma: string; tieneFirma: boolean; tieneLogo: boolean
  contribuyenteEspecial: string; agenteRetencion: string; secuencialFactura: number
}

export function EmisorSRIForm({ config, ecuadorApiToken, rucApiKey }: { config: Config | null; ecuadorApiToken: string; rucApiKey: string }) {
  const [loading, setLoading] = useState(false)
  const [firmaNombre, setFirmaNombre] = useState('')
  const [logoNombre, setLogoNombre] = useState('')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    try {
      await guardarEmisorSRIAction(new FormData(e.currentTarget))
      toast.success('Configuración del emisor guardada')
    } catch (err: any) {
      toast.error(err.message || 'No se pudo guardar')
    } finally {
      setLoading(false)
    }
  }

  const field = 'space-y-1.5'
  const lbl = 'text-xs font-semibold text-gray-500 dark:text-gray-400'

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="card space-y-4">
        <h3 className="font-bold text-gray-900 dark:text-white text-sm border-b border-gray-100 dark:border-white/5 pb-2">Datos tributarios</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className={field}><label className={lbl}>RUC *</label><input name="ruc" defaultValue={config?.ruc} className="input font-mono" required maxLength={13} pattern="\d{13}" title="13 dígitos" /></div>
          <div className={field}><label className={lbl}>Razón social *</label><input name="razonSocial" defaultValue={config?.razonSocial} className="input" required /></div>
          <div className={field}><label className={lbl}>Nombre comercial</label><input name="nombreComercial" defaultValue={config?.nombreComercial} className="input" /></div>
          <div className={field}>
            <label className={lbl}>Ambiente *</label>
            <select name="ambiente" defaultValue={config?.ambiente ?? 1} className="input">
              <option value={1}>Pruebas</option>
              <option value={2}>Producción</option>
            </select>
          </div>
          <div className={field}><label className={lbl}>Dirección matriz *</label><input name="dirMatriz" defaultValue={config?.dirMatriz} className="input" required /></div>
          <div className={field}><label className={lbl}>Dirección establecimiento *</label><input name="dirEstablecimiento" defaultValue={config?.dirEstablecimiento} className="input" required /></div>
          <div className={field}><label className={lbl}>Cód. establecimiento</label><input name="codigoEstablecimiento" defaultValue={config?.codigoEstablecimiento ?? '001'} className="input font-mono" maxLength={3} /></div>
          <div className={field}><label className={lbl}>Cód. punto emisión</label><input name="codigoPuntoEmision" defaultValue={config?.codigoPuntoEmision ?? '001'} className="input font-mono" maxLength={3} /></div>
          <div className={field}><label className={lbl}>Secuencial factura</label><input name="secuencialFactura" type="number" min={1} defaultValue={config?.secuencialFactura ?? 1} className="input" /></div>
          <div className="flex items-center gap-2 pt-6">
            <input type="checkbox" name="obligadoContabilidad" value="true" defaultChecked={config?.obligadoContabilidad} id="oc" className="w-4 h-4" />
            <label htmlFor="oc" className="text-xs text-gray-600 dark:text-gray-300">Obligado a llevar contabilidad</label>
          </div>
        </div>
      </div>

      <div className="card space-y-4">
        <h3 className="font-bold text-gray-900 dark:text-white text-sm border-b border-gray-100 dark:border-white/5 pb-2 flex items-center gap-2">
          <ShieldCheck size={16} className="text-brand-600" /> Firma electrónica (.p12)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className={field}>
            <label className={lbl}>Archivo de firma {config?.tieneFirma && <span className="text-green-600">(ya cargada)</span>}</label>
            <label className="input flex items-center gap-2 cursor-pointer text-gray-500">
              <Upload size={14} /> {firmaNombre || (config?.tieneFirma ? 'Reemplazar .p12...' : 'Subir .p12...')}
              <input type="file" name="firma" accept=".p12" className="hidden" onChange={(e) => setFirmaNombre(e.target.files?.[0]?.name ?? '')} />
            </label>
          </div>
          <div className={field}>
            <label className={lbl}>Contraseña de la firma {config && <span className="text-gray-400">(se conserva si no la cambias)</span>}</label>
            <input name="passwordFirma" type="password" defaultValue={config?.passwordFirma ?? ''} className="input" placeholder="••••••••" />
          </div>
        </div>
        <p className="text-[11px] text-gray-400">La contraseña se guarda cifrada (AES-256) en la base de datos y nunca se muestra en claro.</p>
      </div>

      <div className="card space-y-4">
        <h3 className="font-bold text-gray-900 dark:text-white text-sm border-b border-gray-100 dark:border-white/5 pb-2 flex items-center gap-2">
          <ImageIcon size={16} className="text-brand-600" /> Logo de la empresa (para la factura RIDE)
        </h3>
        <div className={field}>
          <label className={lbl}>Imagen del logo {config?.tieneLogo && <span className="text-green-600">(ya cargado)</span>}</label>
          <label className="input flex items-center gap-2 cursor-pointer text-gray-500">
            <Upload size={14} /> {logoNombre || (config?.tieneLogo ? 'Reemplazar logo...' : 'Subir logo (PNG o JPG)...')}
            <input type="file" name="logo" accept="image/png,image/jpeg" className="hidden" onChange={(e) => setLogoNombre(e.target.files?.[0]?.name ?? '')} />
          </label>
          <p className="text-[11px] text-gray-400">PNG o JPG, máximo 1 MB. Se mostrará en la esquina superior de la factura impresa (RIDE).</p>
        </div>
      </div>

      <div className="card space-y-4">
        <h3 className="font-bold text-gray-900 dark:text-white text-sm border-b border-gray-100 dark:border-white/5 pb-2 flex items-center gap-2">
          <Search size={16} className="text-brand-600" /> Consulta automática de identificaciones
        </h3>

        <div className={field}>
          <label className={lbl}>API Key de consulta de RUC (Solinteec) {rucApiKey && <span className="text-gray-400">(se conserva si no la cambias)</span>}</label>
          <input name="rucApiKey" type="password" defaultValue={rucApiKey} className="input" placeholder="Pega aquí la API key de apiruc.solinteec.com" />
          <p className="text-[11px] text-gray-400">
            Para consultar <strong>RUC</strong> (13 dígitos). Genérala en el panel de <span className="font-mono">apiruc.solinteec.com</span>. Se guarda cifrada (AES-256).
          </p>
        </div>

        <div className={field}>
          <label className={lbl}>Token de EcuadorAPI {ecuadorApiToken && <span className="text-gray-400">(se conserva si no lo cambias)</span>}</label>
          <input name="ecuadorApiToken" type="password" defaultValue={ecuadorApiToken} className="input" placeholder="Pega aquí tu token de api.ecuadorapi.com" />
          <p className="text-[11px] text-gray-400">
            Para consultar <strong>cédulas</strong> (10 dígitos). Consíguelo en <span className="font-mono">api.ecuadorapi.com</span>. Se guarda cifrado (AES-256).
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar configuración
        </button>
      </div>
    </form>
  )
}
