'use server'

import { prisma } from '@/lib/db/prisma'
import { requerirTenant } from '@/lib/auth/tenant'
import { registrarLog } from '@/lib/logs/logger'
import { validarIdentificacion } from '@/lib/validators'
import { descifrarSecreto } from '@/lib/security/crypto'
import { consultarRucSRI } from '@/lib/sri/consulta-ruc'
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

/**
 * Consulta los datos de una cédula/RUC. Primero busca en la BD del tenant (gratis);
 * si no existe, consulta EcuadorAPI usando el token cifrado de la configuración.
 * Portado de GABLIMADOS, adaptado a multitenant y token cifrado.
 */
export async function consultarIdentificacionAction(identificacion: string) {
  const sesion = await requerirTenant()
  const clean = identificacion.trim()
  if (clean.length !== 10 && clean.length !== 13) {
    return { error: 'La identificación debe tener 10 dígitos (Cédula) o 13 (RUC)' }
  }

  try {
    // 1) BD local del tenant
    const existente = await prisma.cliente.findFirst({
      where: { tenantId: sesion.tenantId, identificacion: clean },
      select: { nombre: true, direccion: true, email: true, telefono: true },
    })
    if (existente) {
      return {
        success: true, origen: 'LOCAL' as const,
        nombre: existente.nombre, direccion: existente.direccion || '',
        email: existente.email || '', telefono: existente.telefono || '',
      }
    }

    const isRuc = clean.length === 13

    // 2) RUC → API propia contra el SRI (gratis, oficial). No necesita token.
    if (isRuc) {
      const r = await consultarRucSRI(clean)
      if (!r) return { error: `El RUC ${clean} no fue encontrado en el SRI.` }
      return {
        success: true, origen: 'SRI' as const,
        nombre: r.nombre, direccion: r.direccion, email: '', telefono: '',
      }
    }

    // 3) Cédula → EcuadorAPI (requiere token configurado)
    const tokenConf = await prisma.config.findFirst({
      where: { tenantId: sesion.tenantId, clave: 'ecuador_api_token' },
    })
    const token = tokenConf?.valor ? descifrarSecreto(tokenConf.valor) : ''
    if (!token) {
      return { error: 'No se ha configurado el Token de EcuadorAPI (necesario para cédulas).' }
    }

    const res = await fetch(`https://api.ecuadorapi.com/api/v1/cedulas/${clean}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      next: { revalidate: 0 },
    })

    if (!res.ok) {
      if (res.status === 404) return { error: `La cédula ${clean} no fue encontrada.` }
      if (res.status === 401) return { error: 'El Token de EcuadorAPI no es válido o expiró.' }
      return { error: `El servicio externo respondió con un error (código ${res.status}).` }
    }

    const body = await res.json()
    const apiData = body.data || body
    const nombre = apiData.full_name || apiData.name || apiData.nombre || ''
    if (!nombre) return { error: 'No se encontraron datos legibles para esta cédula.' }

    return {
      success: true, origen: 'API' as const,
      nombre: nombre.trim().toUpperCase(), direccion: '', email: '', telefono: '',
    }
  } catch (error: any) {
    await registrarLog('ERROR', 'CLIENTES', `Error consultando identificación: ${error.message || error}`, undefined, sesion.tenantId)
    return { error: 'Error de red al conectar con el servicio externo. Intenta nuevamente.' }
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
