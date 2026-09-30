'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { validarIdentificacion } from '@/lib/validators'
import { descifrarSecreto } from '@/lib/security/crypto'
import { consultarRucSRI, consultarCedulaApiRuc } from '@/lib/sri/consulta-ruc'
import { detectarIdentificacion, type ClaseIdentificacion } from '@/lib/clientes/identificacion'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const clienteSchema = z.object({
  tipoIdentificacion: z.enum(['CEDULA', 'RUC', 'PASAPORTE', 'CONSUMIDOR_FINAL']),
  identificacion: z.string().trim().min(3, 'Identificación requerida').max(15),
  nombre: z.string().trim().min(1, 'El nombre es requerido').max(200),
  telefono: z.string().trim().max(20).optional().or(z.literal('')),
  email: z.string().trim().max(150).optional().or(z.literal('')),
  direccion: z.string().trim().max(300).optional().or(z.literal('')),
})
export interface ClienteFormValues {
  tipoIdentificacion: string
  identificacion: string
  nombre: string
  telefono?: string
  email?: string
  direccion?: string
}

export async function crearClienteAction(data: ClienteFormValues) {
  const sesion = await requerirTenant()
  const parsed = clienteSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  const d = parsed.data

  try {
    validarIdentificacion(d.tipoIdentificacion, d.identificacion)
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return { error: 'Correo electrónico inválido' }

    await prisma.cliente.create({
      data: {
        tenantId: sesion.tenantId,
        tipoIdentificacion: d.tipoIdentificacion,
        identificacion: d.identificacion,
        nombre: d.nombre,
        telefono: d.telefono || null,
        email: d.email || null,
        direccion: d.direccion || null,
      },
    })
    await registrarLog('AUDIT', 'CLIENTES', `Cliente creado: ${d.nombre}`, undefined, sesion.tenantId)
    revalidatePath('/clientes')
    return { success: true }
  } catch (error: any) {
    if (error.code === 'P2002') return { error: 'Ya existe un cliente con esa identificación' }
    return { error: error.message || 'No se pudo crear el cliente' }
  }
}

export async function actualizarClienteAction(id: string, data: ClienteFormValues) {
  const sesion = await requerirTenant()
  const parsed = clienteSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message || 'Datos inválidos' }
  const d = parsed.data

  try {
    validarIdentificacion(d.tipoIdentificacion, d.identificacion)
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return { error: 'Correo electrónico inválido' }

    const actual = await prisma.cliente.findFirst({ where: { id, tenantId: sesion.tenantId } })
    if (!actual) return { error: 'Cliente no encontrado' }

    await prisma.cliente.update({
      where: { id },
      data: {
        tipoIdentificacion: d.tipoIdentificacion,
        identificacion: d.identificacion,
        nombre: d.nombre,
        telefono: d.telefono || null,
        email: d.email || null,
        direccion: d.direccion || null,
      },
    })
    await registrarLog('AUDIT', 'CLIENTES', `Cliente actualizado: ${d.nombre}`, undefined, sesion.tenantId)
    revalidatePath('/clientes')
    return { success: true }
  } catch (error: any) {
    if (error.code === 'P2002') return { error: 'Ya existe un cliente con esa identificación' }
    return { error: error.message || 'No se pudo actualizar el cliente' }
  }
}

/** Resultado de consultar una identificación (lo consumen Clientes y el POS). */
export type ConsultaIdentificacion =
  | {
      success: true
      origen: 'LOCAL' | 'SRI' | 'APIRUC' | 'API'
      clase: ClaseIdentificacion
      cedula: string | null
      ruc: string | null
      /** Tipo sugerido: el último usado si el cliente ya existe, o el que resolvió la consulta */
      tipoIdentificacion: 'CEDULA' | 'RUC' | 'CONSUMIDOR_FINAL'
      /** ¿La persona tiene RUC? null = no se sabe (se verifica al elegir RUC) */
      tieneRuc: boolean | null
      cliente: { id: string } | null
      nombre: string
      direccion: string
      email: string
      telefono: string
      aviso?: string
    }
  | { success?: undefined; error: string }

/**
 * Busca el cliente del tenant por cualquiera de sus identificaciones posibles
 * (persona natural: cédula y cédula+001) para no duplicarlo. Si hay duplicados
 * antiguos, prefiere el que coincide con lo escrito.
 */
async function buscarClienteLocal(tenantId: string, candidatas: string[], escrita: string) {
  const clientes = await prisma.cliente.findMany({
    where: { tenantId, identificacion: { in: candidatas } },
    select: { id: true, nombre: true, tipoIdentificacion: true, identificacion: true, direccion: true, email: true, telefono: true },
  })
  return clientes.find((c) => c.identificacion === escrita) ?? clientes[0] ?? null
}

async function leerSecretoConfig(tenantId: string, clave: string) {
  const conf = await prisma.config.findFirst({ where: { tenantId, clave } })
  return conf?.valor ? descifrarSecreto(conf.valor) : undefined
}

/**
 * Consulta los datos de una cédula/RUC para autocompletar el cliente. El tipo se
 * detecta por el número (el operador no lo elige). Orden:
 *   1) BD del tenant (gratis), buscando la persona natural por sus dos formas.
 *   2) RUC → apiruc /ruc. Cédula → apiruc /cedula (gratis) y, si no la tiene,
 *      EcuadorAPI (token cifrado de Configuración) como respaldo pagado.
 * A personas naturales el formulario les ofrece facturar con Cédula o RUC.
 */
export async function consultarIdentificacionAction(identificacion: string): Promise<ConsultaIdentificacion> {
  const sesion = await requerirTenant()
  const clean = identificacion.replace(/\D/g, '')
  const info = detectarIdentificacion(clean)
  if (!info) {
    return { error: 'Identificación no válida: cédula (10 dígitos) o RUC (13). Para pasaporte usa "Otro tipo".' }
  }
  const base = { clase: info.clase, cedula: info.cedula, ruc: info.ruc }

  try {
    // 1) BD local del tenant
    const candidatas = info.clase === 'natural' ? [info.cedula!, info.ruc!] : [clean]
    const existente = await buscarClienteLocal(sesion.tenantId, candidatas, clean)
    if (existente) {
      const tipo = existente.tipoIdentificacion === 'RUC' ? 'RUC' : existente.tipoIdentificacion === 'CONSUMIDOR_FINAL' ? 'CONSUMIDOR_FINAL' : 'CEDULA'
      return {
        success: true, origen: 'LOCAL', ...base,
        tipoIdentificacion: tipo, tieneRuc: tipo === 'RUC' ? true : null,
        cliente: { id: existente.id },
        nombre: existente.nombre, direccion: existente.direccion || '',
        email: existente.email || '', telefono: existente.telefono || '',
      }
    }

    if (info.clase === 'consumidor_final') {
      return {
        success: true, origen: 'LOCAL', ...base, tipoIdentificacion: 'CONSUMIDOR_FINAL', tieneRuc: false,
        cliente: null, nombre: 'CONSUMIDOR FINAL', direccion: '', email: '', telefono: '',
      }
    }

    // 2) RUC → apiruc. Key desde Configuración (BD) o .env.
    const rucKey = await leerSecretoConfig(sesion.tenantId, 'ruc_api_key')
    const desdeRuc = async (ruc: string) => {
      const r = await consultarRucSRI(ruc, rucKey)
      if (!r) return null
      return {
        success: true as const, origen: 'SRI' as const, ...base, tipoIdentificacion: 'RUC' as const, tieneRuc: true,
        cliente: null, nombre: r.nombre, direccion: r.direccion, email: '', telefono: '',
      }
    }

    if (info.clase !== 'natural') {
      return (await desdeRuc(info.ruc!)) ?? { error: `El RUC ${clean} no fue encontrado en el SRI.` }
    }

    // Persona natural dictada como RUC: se prueba el RUC; si el SRI no lo tiene,
    // se sigue como cédula (la persona puede no estar inscrita).
    let aviso: string | undefined
    if (clean.length === 13) {
      const r = await desdeRuc(info.ruc!)
      if (r) return r
      aviso = 'Ese RUC no está registrado en el SRI: se cargó como cédula.'
    }

    const c = await consultarCedula(sesion.tenantId, info.cedula!, rucKey)
    if ('error' in c) return c
    return { success: true, ...base, ...c, cliente: null, tipoIdentificacion: 'CEDULA', ...(aviso ? { tieneRuc: false, aviso } : {}) }
  } catch (error: any) {
    await registrarLog('ERROR', 'CLIENTES', `Error consultando identificación: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'Error de red al conectar con el servicio externo. Intenta nuevamente.' }
  }
}

interface CedulaEncontrada {
  origen: 'APIRUC' | 'API'
  tieneRuc: boolean | null
  nombre: string
  direccion: string
  email: string
  telefono: string
}

/** Cédula: apiruc (gratis) y, si no la tiene o no responde, EcuadorAPI. */
async function consultarCedula(tenantId: string, cedula: string, rucKey: string | undefined): Promise<CedulaEncontrada | { error: string }> {
  try {
    const r = await consultarCedulaApiRuc(cedula, rucKey)
    if (r) {
      return {
        origen: 'APIRUC', tieneRuc: r.desdeSri ? true : null,
        nombre: r.nombre, direccion: r.direccion, email: r.email, telefono: r.telefono,
      }
    }
  } catch (error: any) {
    // apiruc caído o sin key: no bloquea, se pasa al respaldo pagado.
    await registrarLog('WARN', 'CLIENTES', `apiruc /cedula no disponible: ${error.message || error}`, undefined, tenantId)
  }

  const token = await leerSecretoConfig(tenantId, 'ecuador_api_token')
  if (!token) {
    return { error: 'Cédula no encontrada sin costo. Para ampliar la búsqueda configura el Token de EcuadorAPI.' }
  }

  const res = await fetch(`https://api.ecuadorapi.com/api/v1/cedulas/${cedula}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    next: { revalidate: 0 },
  })

  if (!res.ok) {
    if (res.status === 404) return { error: `La cédula ${cedula} no fue encontrada.` }
    if (res.status === 401) return { error: 'El Token de EcuadorAPI no es válido o expiró.' }
    return { error: `El servicio externo respondió con un error (código ${res.status}).` }
  }

  const body = await res.json()
  const apiData = body.data || body
  const nombre = apiData.full_name || apiData.name || apiData.nombre || ''
  if (!nombre) return { error: 'No se encontraron datos legibles para esta cédula.' }

  return {
    origen: 'API', tieneRuc: null,
    nombre: String(nombre).trim().toUpperCase(), direccion: '', email: '', telefono: '',
  }
}

/**
 * Confirma en el SRI (vía apiruc) que un RUC exista, para cuando el operador
 * elige facturar con RUC a una persona de la que solo se conocía la cédula.
 */
export async function verificarRucAction(ruc: string): Promise<{ success: true; existe: boolean } | { error: string }> {
  const sesion = await requerirTenant()
  const clean = ruc.replace(/\D/g, '')
  if (!/^\d{13}$/.test(clean)) return { error: 'El RUC debe tener 13 dígitos' }
  try {
    const rucKey = await leerSecretoConfig(sesion.tenantId, 'ruc_api_key')
    const r = await consultarRucSRI(clean, rucKey)
    return { success: true, existe: !!r }
  } catch (error: any) {
    await registrarLog('WARN', 'CLIENTES', `No se pudo verificar RUC: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'No se pudo verificar el RUC en el SRI' }
  }
}

export async function desactivarClienteAction(id: string) {
  const sesion = await requerirTenant('ADMIN')
  try {
    const c = await prisma.cliente.findFirst({ where: { id, tenantId: sesion.tenantId } })
    if (!c) return { error: 'Cliente no encontrado' }
    await prisma.cliente.update({ where: { id }, data: { activo: false } })
    await registrarLog('AUDIT', 'CLIENTES', `Cliente desactivado: ${c.nombre}`, undefined, sesion.tenantId)
    revalidatePath('/clientes')
    return { success: true }
  } catch {
    return { error: 'No se pudo desactivar el cliente' }
  }
}
