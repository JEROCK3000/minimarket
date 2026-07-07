import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed de MiniMarket...')

  // ─── Minimarket demo (tenant) ──────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'minimarket-demo' },
    update: {},
    create: { nombre: 'MiniMarket El Barrio', slug: 'minimarket-demo', activo: true },
  })
  console.log('✅ Minimarket:', tenant.nombre)

  const adminPassword = process.env.SEED_ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url')

  // ─── Superadmin global (Solinteec) ─────────────────────────────────────────
  let superadmin = await prisma.usuario.findFirst({
    where: { email: 'superadmin@solinteec.com', tenantId: null },
  })
  if (!superadmin) {
    superadmin = await prisma.usuario.create({
      data: {
        tenantId: null,
        nombre: 'Superadministrador',
        email: 'superadmin@solinteec.com',
        password: await bcrypt.hash(adminPassword, 12),
        rol: 'SUPERADMIN',
        activo: true,
      },
    })
  }
  console.log('✅ Superadmin:', superadmin.email)

  // ─── Dueño y cajero del minimarket ─────────────────────────────────────────
  await prisma.usuario.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'dueno@minimarket.com' } },
    update: {},
    create: {
      tenantId: tenant.id, nombre: 'Dueño MiniMarket', email: 'dueno@minimarket.com',
      password: await bcrypt.hash(adminPassword, 12), rol: 'ADMIN', activo: true,
    },
  })
  await prisma.usuario.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'cajero@minimarket.com' } },
    update: {},
    create: {
      tenantId: tenant.id, nombre: 'Cajero MiniMarket', email: 'cajero@minimarket.com',
      password: await bcrypt.hash(adminPassword, 12), rol: 'USER', activo: true,
    },
  })
  console.log('✅ Usuarios: dueno@minimarket.com (ADMIN), cajero@minimarket.com (USER)')

  // ─── Categorías y productos de ejemplo ─────────────────────────────────────
  const cats = [
    { nombre: 'Bebidas', icono: '🥤', color: '#3b82f6' },
    { nombre: 'Snacks', icono: '🍿', color: '#f59e0b' },
    { nombre: 'Abarrotes', icono: '🥫', color: '#10b981' },
    { nombre: 'Limpieza', icono: '🧽', color: '#8b5cf6' },
  ]
  const catMap: Record<string, string> = {}
  for (const c of cats) {
    const cat = await prisma.categoria.upsert({
      where: { tenantId_nombre: { tenantId: tenant.id, nombre: c.nombre } },
      update: {},
      create: { ...c, tenantId: tenant.id },
    })
    catMap[c.nombre] = cat.id
  }
  console.log('✅ Categorías:', cats.length)

  const productos = [
    { codigoBarras: '7801234567890', nombre: 'Coca-Cola 500ml', categoria: 'Bebidas', precioCompra: 0.55, precioVenta: 0.85, stock: 48 },
    { codigoBarras: '7809876543210', nombre: 'Agua Dasani 500ml', categoria: 'Bebidas', precioCompra: 0.25, precioVenta: 0.50, stock: 60 },
    { codigoBarras: '7811111111111', nombre: 'Papas Ruffles', categoria: 'Snacks', precioCompra: 0.60, precioVenta: 1.00, stock: 30 },
    { codigoBarras: '7822222222222', nombre: 'Arroz 1kg', categoria: 'Abarrotes', precioCompra: 0.90, precioVenta: 1.25, stock: 40 },
    { codigoBarras: '7833333333333', nombre: 'Aceite 1L', categoria: 'Abarrotes', precioCompra: 1.80, precioVenta: 2.40, stock: 25 },
    { codigoBarras: '7844444444444', nombre: 'Detergente 1kg', categoria: 'Limpieza', precioCompra: 1.50, precioVenta: 2.10, stock: 18 },
  ]
  for (const p of productos) {
    await prisma.producto.upsert({
      where: { tenantId_codigoBarras: { tenantId: tenant.id, codigoBarras: p.codigoBarras } },
      update: {},
      create: {
        tenantId: tenant.id, categoriaId: catMap[p.categoria], codigoBarras: p.codigoBarras,
        nombre: p.nombre, precioCompra: p.precioCompra, precioVenta: p.precioVenta,
        stock: p.stock, stockMinimo: 5, ivaPorcentaje: 15,
      },
    })
  }
  console.log('✅ Productos:', productos.length)

  console.log('\n🎉 Seed completado!')
  console.log('📧 Dueño: dueno@minimarket.com  |  Cajero: cajero@minimarket.com')
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log(`🔑 Contraseña generada (guárdala): ${adminPassword}`)
  } else {
    console.log('🔑 Contraseña: la definida en SEED_ADMIN_PASSWORD')
  }
}

main()
  .catch((e) => { console.error('❌ Error en seed:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
