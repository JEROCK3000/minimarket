# MiniMarket

Sistema de gestión para minimarkets de barrio: inventario, compras, ventas con POS, gastos y **facturación electrónica SRI (Ecuador)**. Construido sobre el Solinteec Starter — hereda toda su base de seguridad.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Prisma · MySQL/MariaDB · Tailwind 4 · arquitectura multitenant.

## Módulos

| Módulo | Descripción |
|---|---|
| **Dashboard** | KPIs reales: ventas del día/mes, gastos, balance, más vendidos, reposición |
| **Punto de Venta (POS)** | Carrito interactivo, escaneo de código de barras, factura por defecto o solo-ticket, formas de pago, vuelto |
| **Productos e Inventario** | CRUD, stock, alertas de mínimo, kardex de movimientos |
| **Compras y Proveedores** | Registro de compras que actualiza stock y precio automáticamente |
| **Ventas** | Historial y emisión de factura electrónica al SRI |
| **Gastos** | Registro por categoría con total mensual |
| **Facturación SRI** | Emisor configurable, firma .p12 cifrada, emisión y autorización ante el SRI |
| **Reportes** | Exportación de ventas a Excel (.xlsx) |

## Roles

- **SUPERADMIN** (Solinteec): orquesta todos los minimarkets.
- **ADMIN** (dueño): gestiona productos, compras, gastos, configuración.
- **USER** (cajero): usa el POS y consulta.

## Arranque

```bash
npm install
cp .env.example .env && cp .env.example .env.local   # completa DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY
npm run db:push
npm run db:seed        # crea minimarket demo + dueño/cajero + productos de ejemplo
npm run dev            # http://localhost:3000
```

Usuarios demo: `dueno@minimarket.com` (ADMIN) y `cajero@minimarket.com` (USER). Contraseña: la de `SEED_ADMIN_PASSWORD`.

## Facturación electrónica

Para emitir facturas: **Configuración → Facturación SRI**, carga el certificado `.p12`, su contraseña (se guarda cifrada) y los datos del emisor. Empieza en ambiente de **Pruebas**. La lógica está portada de GABLIMADOS (en producción real).

## Seguridad

Toda server action valida sesión, rol y `tenantId`. Secretos cifrados (AES-256). Ver `AGENTS.md §14` y los `docs/` heredados del starter.

## Configuración (pestañas)

- **Facturación SRI**: datos del emisor, firma .p12 (contraseña cifrada), token de EcuadorAPI.
- **Correo**: servidor SMTP (contraseña cifrada) con botón de prueba de conexión.
- **Seguridad**: cambio de contraseña con verificación de la actual e indicador de fortaleza.

## Facturación electrónica (completa)

Configurar emisor → emitir factura desde Ventas → el SRI autoriza → **descargar RIDE (PDF)** o **enviar la factura (PDF + XML) por correo** al cliente. Todo portado de GABLIMADOS.

## Módulos adicionales

- **Reportes** (Excel): ventas, gastos e inventario/valorización.
- **Cierre de Caja**: resumen del día por forma de pago, arqueo de efectivo (esperado vs contado), diferencia e historial de cierres.
- **Anulación de ventas**: revierte el stock al inventario (con kardex); bloqueada si la factura ya fue autorizada por el SRI (requiere Nota de Crédito).
- **Vista previa de factura**: proyección de la factura antes de emitirla al SRI.

## Estado

Sistema completo y funcional. Todos los módulos compilan y fueron verificados. Pendiente: `git init`, despliegue y — a futuro — Nota de Crédito para anular facturas ya autorizadas.
