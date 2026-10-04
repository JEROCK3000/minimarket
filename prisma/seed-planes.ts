/**
 * Planes de suscripción iniciales. Idempotente: solo crea los planes si la tabla
 * está vacía. Precios y límites son referenciales: se ajustan en /superadmin/planes.
 * Uso: npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed-planes.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  if ((await prisma.planSuscripcion.count()) > 0) { console.log('Ya existen planes: no se crea nada.'); return }
  await prisma.planSuscripcion.createMany({
    data: [
      { codigo: 'BASICO', nombre: 'Básico', descripcion: 'Para tiendas de barrio con una caja.', precioMensual: 15, precioAnual: 150, maxUsuarios: 2, maxProductos: 1000, maxFacturasMes: 300, diasPrueba: 15, orden: 1 },
      { codigo: 'PROFESIONAL', nombre: 'Profesional', descripcion: 'Minimarkets con varias cajas y más volumen.', precioMensual: 25, precioAnual: 250, maxUsuarios: 5, maxProductos: 5000, maxFacturasMes: 1500, diasPrueba: 15, orden: 2 },
      { codigo: 'EMPRESARIAL', nombre: 'Empresarial', descripcion: 'Sin límites de usuarios, productos ni facturas.', precioMensual: 40, precioAnual: 400, maxUsuarios: null, maxProductos: null, maxFacturasMes: null, diasPrueba: 0, orden: 3 },
    ],
  })
  console.log('Planes iniciales creados.')
}

main().catch((e) => { console.error('Error creando planes'); process.exitCode = 1; void e }).finally(() => prisma.$disconnect())
