'use server'

import { requerirSuperadmin } from '@/lib/auth/session'
import { registrarLog } from '@/lib/logs/logger'
import { revalidatePath } from 'next/cache'
import { guardarConfigGlobal, leerConfigGlobal, CLAVE_RUC_PROVEEDOR } from '@/lib/config/global'

/**
 * RUC del proveedor del software (Res. SRI NAC-DGERCGC26-00000027), global para
 * todos los minimarkets. Solo SUPERADMIN. Vacío = no se incluye el campo.
 */
export async function guardarRucProveedorAction(ruc: string) {
  const sesion = await requerirSuperadmin()
  const limpio = String(ruc ?? '').replace(/\s/g, '')
  if (limpio && !/^\d{13}$/.test(limpio)) return { error: 'El RUC debe tener 13 dígitos' }
  if (limpio && !/^\d{10}001$/.test(limpio) && !/^\d{9}0001$/.test(limpio)) return { error: 'El RUC debe terminar en 001' }
  try {
    const anterior = await leerConfigGlobal(CLAVE_RUC_PROVEEDOR)
    await guardarConfigGlobal(CLAVE_RUC_PROVEEDOR, limpio || null)
    await registrarLog('AUDIT', 'SUPERADMIN', `RUC Proveedor: ${anterior ?? '(vacío)'} → ${limpio || '(vacío)'} por ${sesion.email}`)
    revalidatePath('/superadmin')
    revalidatePath('/superadmin/configuracion')
    return { success: true }
  } catch (error: any) {
    await registrarLog('ERROR', 'SUPERADMIN', `Error guardando RUC Proveedor: ${error.message || error}`)
    return { error: 'No se pudo guardar' }
  }
}
