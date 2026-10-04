import { prisma } from '@/lib/db/prisma'

/** slug único a partir del nombre (minúsculas, sin tildes, con sufijo si ya existe). */
export async function slugUnico(nombre: string) {
  const base = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'minimarket'
  let slug = base
  for (let i = 2; await prisma.tenant.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${base}-${i}`
  return slug
}
