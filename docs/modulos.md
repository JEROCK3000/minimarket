# Módulos del MiniMarket

Sistema de gestión para minimarket construido sobre el Solinteec Starter (hereda auth, cifrado, multitenancy, logging y validación). Todas las server actions usan `requerirTenant()` (`src/lib/auth/tenant.ts`), que garantiza sesión válida + `tenantId` no nulo, y filtran por `tenantId`.

## 1. Dashboard (`/dashboard`)
KPIs reales del negocio: ventas de hoy, ventas del mes, gastos del mes, balance (ventas − gastos), productos más vendidos del mes y lista de reposición (stock ≤ mínimo). Accesos rápidos al POS, productos y reportes.

## 2. Punto de Venta / POS (`/pos`)
Interfaz de venta rápida. Catálogo con búsqueda y filtro por categoría; el campo de búsqueda también acepta **escaneo de código de barras** (Enter agrega el producto). Carrito con control de cantidades y validación de stock en vivo. Formas de pago (efectivo/tarjeta/transferencia); en efectivo calcula el **vuelto**. Selector de comprobante: **Factura** (por defecto) o **Solo ticket**. Si es factura, exige cliente (busca local o consulta EcuadorAPI). Al cobrar: descuenta stock, registra kardex y crea la venta en una transacción.

## 3. Productos e Inventario (`/productos`)
CRUD de productos con búsqueda. Campos: nombre, código de barras, categoría, precio de compra/venta, IVA, stock, stock mínimo, unidad. Alertas visuales de stock bajo. Todo cambio de stock queda en el **kardex** (`movimientos_inventario`). Crear/editar solo ADMIN; el cajero (USER) solo consulta.

## 4. Compras y Proveedores (`/compras`)
Registro de compras que **actualiza automáticamente el stock y el precio de compra** de cada producto (con kardex tipo COMPRA), en una transacción. Proveedores gestionables (creación rápida desde el formulario de compra). Solo ADMIN.

## 5. Ventas (`/ventas`)
Historial de ventas con estado del comprobante (Ticket / Sin emitir / Pendiente / Autorizada / Rechazada / Anulada). Acciones sobre cada venta:
- **Vista previa** de la factura antes de emitir (proyección sin enviar al SRI).
- **Emitir factura** al SRI (o reintentar si quedó pendiente/rechazada).
- Para facturas autorizadas: **descargar RIDE (PDF)** y **enviar por correo** al cliente.
- **Anular** (solo ADMIN): revierte el stock al inventario con kardex. Bloqueada si la factura ya fue autorizada (requiere Nota de Crédito).

## 6. Clientes (`/clientes`)
CRUD con búsqueda. Validación real del dígito verificador de **cédula y RUC ecuatoriano** (`src/lib/validators`). Botón de **consulta a EcuadorAPI** que autocompleta nombre y dirección (busca primero en la BD local para no gastar créditos). Los clientes creados al vuelo en el POS aparecen aquí.

## 7. Gastos (`/gastos`)
Registro de gastos por categoría con total del mes. Solo ADMIN.

## 8. Cierre de Caja (`/caja`)
Resumen del día por forma de pago (efectivo/tarjeta/transferencia) y total. **Arqueo de efectivo**: efectivo esperado (ventas efectivo − gastos) vs. contado físicamente, con cálculo de diferencia (cuadre/sobrante/faltante). Registra el cierre (`cierres_caja`) e historial de cierres recientes.

## 9. Reportes (`/reportes`)
Exportación a Excel (.xlsx) con `exceljs`, vía rutas API en `/api/reportes/*`:
- **Ventas** (por rango de fechas): detalle con subtotal, IVA, total y comprobante.
- **Gastos** (por rango): detalle y resumen por categoría.
- **Inventario**: stock actual y **valorización a costo** (foto del momento).

## 10. Configuración (`/configuracion`, pestañas)
- **Facturación SRI**: datos del emisor, firma `.p12` (contraseña **cifrada** AES-256), token de EcuadorAPI (cifrado). Ambiente pruebas/producción.
- **Correo**: servidor SMTP (contraseña cifrada) con botón de prueba de conexión.
- **Seguridad**: cambio de contraseña con verificación de la actual e indicador de fortaleza.

## Facturación electrónica SRI

Portada de GABLIMADOS (en producción real), adaptada a `Venta` y multitenant, con la contraseña de firma cifrada. Flujo: configurar emisor → emitir desde Ventas → firma XML con `.p12` → recepción y autorización ante el SRI (hasta 5 intentos) → estado guardado en `facturas_sri`. Helpers en `src/lib/sri/helpers.ts` (clave de acceso con `crypto.randomInt`), emisión en `src/app/(app)/ventas/sri-actions.ts`, RIDE PDF en `src/lib/reports/ride.ts`, envío por correo en `src/lib/utils/email.ts`.

## Roles
- **SUPERADMIN** (Solinteec): global, orquesta todos los minimarkets.
- **ADMIN** (dueño): gestiona todo.
- **USER** (cajero): POS y consulta; no edita productos, compras, gastos ni anula.

## Pendientes (siguiente iteración)
Nota de Crédito para anular facturas ya autorizadas; reportes de inventario/gastos en PDF; historial de cierres de caja exportable.
