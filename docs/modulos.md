# Módulos del MiniMarket

Sistema de gestión para minimarket construido sobre el Solinteec Starter (hereda auth, cifrado, multitenancy, logging y validación). Todas las server actions usan `requerirTenant()` (`src/lib/auth/tenant.ts`), que garantiza sesión válida + `tenantId` no nulo, y filtran por `tenantId`.

## 1. Dashboard (`/dashboard`)
KPIs reales del negocio: ventas de hoy, ventas del mes, gastos del mes, balance (ventas − gastos), productos más vendidos del mes y lista de reposición (stock ≤ mínimo). Gráficas de tendencia (ventas/gastos, vista diaria y mensual) y distribución por método de pago. Accesos rápidos al POS, productos y reportes.

## 2. Punto de Venta / POS (`/pos`)
Interfaz de venta rápida. Catálogo con búsqueda y filtro por categoría; el campo de búsqueda también acepta **escaneo de código de barras** (Enter agrega el producto). Carrito con control de cantidades y validación de stock en vivo. Formas de pago (efectivo/tarjeta/transferencia); en efectivo calcula el **vuelto**. Selector de comprobante: **Factura** (por defecto) o **Solo ticket**. Si es factura, exige cliente (busca local o consulta RUC/cédula, ver §6); los datos del cliente son editables en caliente durante la venta. Al cobrar: descuenta stock, registra kardex y crea la venta en una transacción, con **impresión del comprobante** al terminar (ticket térmico 80mm o A4).

## 3. Productos e Inventario (`/productos`)
CRUD de productos con búsqueda. Campos: nombre, código de barras, categoría, precio de compra/venta, IVA, stock, stock mínimo, unidad. Alertas visuales de stock bajo. Todo cambio de stock queda en el **kardex** (`movimientos_inventario`). Crear/editar solo ADMIN; el cajero (USER) solo consulta.

## 4. Compras y Proveedores (`/compras`)
Registro de compras que **actualiza automáticamente el stock y el precio de compra** de cada producto (con kardex tipo COMPRA), en una transacción. Proveedores gestionables (creación rápida desde el formulario de compra). Solo ADMIN.

## 5. Ventas (`/ventas`)
Historial de ventas con estado del comprobante (Ticket / Sin emitir / Pendiente / Autorizada / Rechazada / Anulada). Acciones sobre cada venta:
- **Vista previa** de la factura antes de emitir (proyección sin enviar al SRI).
- **Emitir factura** al SRI (o reintentar si quedó pendiente/rechazada).
- Para facturas autorizadas: **descargar RIDE (PDF)** y **enviar por correo** al cliente.
- **Anular** (solo ADMIN): revierte el stock al inventario con kardex. Si la factura ya fue autorizada, se emite **Nota de Crédito** ante el SRI (`nc-actions.ts`, RIDE propio en `src/lib/sri/nota-credito.ts`) y luego se anula.
- **Reenviar comprobantes** por correo a una dirección editable manualmente.

## 6. Clientes (`/clientes`)
CRUD con búsqueda. Validación real del dígito verificador de **cédula y RUC ecuatoriano** (`src/lib/validators`). Botón de consulta que autocompleta nombre y dirección (busca primero en la BD local): los **RUC** se consultan vía la API central de Solinteec (`apiruc.solinteec.com`, `src/lib/sri/consulta-ruc.ts`, API Key configurable) y las **cédulas** vía EcuadorAPI (token cifrado). Los clientes creados al vuelo en el POS aparecen aquí.

## 7. Gastos (`/gastos`)
Registro de gastos por categoría con total del mes. Solo ADMIN.

## 8. Cierre de Caja (`/caja`)
Resumen del día por forma de pago (efectivo/tarjeta/transferencia) y total. **Arqueo de efectivo**: efectivo esperado (ventas efectivo − gastos) vs. contado físicamente, con cálculo de diferencia (cuadre/sobrante/faltante). Registra el cierre (`cierres_caja`) e historial de cierres recientes.

## 9. Reportes (`/reportes`)
Exportación a **Excel** (.xlsx, `exceljs`) y **PDF** (jsPDF + autotable, generador común en `src/lib/reports/pdf-reporte.ts`), vía rutas API en `/api/reportes/*?formato=excel|pdf`:
- **Ventas** (por rango de fechas): detalle con subtotal, IVA, total y comprobante.
- **Gastos** (por rango): detalle, totales y resumen por categoría.
- **Inventario**: stock actual y **valorización a costo** (foto del momento).

Los PDF llevan encabezado con la empresa, contexto/filtros, fila de totales, fecha de generación y numeración de páginas.

## 10. Configuración (`/configuracion`, pestañas)
- **Facturación SRI**: datos del emisor, firma `.p12` (contraseña **cifrada** AES-256), token de EcuadorAPI (cifrado). Ambiente pruebas/producción.
- **Correo**: servidor SMTP (contraseña cifrada) con botón de prueba de conexión.
- **Seguridad**: cambio de **contraseña** (verifica la actual, indicador de fortaleza) y cambio del **correo de la cuenta** (verifica contraseña, exige unicidad y reemite el JWT de sesión). Con esto se puede reemplazar el correo por defecto usado en desarrollo.

## 11. Recuperación de contraseña (login)
Flujo público "¿Olvidaste tu contraseña?" (`/recuperar`): genera un token de un solo uso (`crypto.randomBytes`; en BD solo se guarda su hash SHA-256, tabla `tokens_recuperacion`, validez 30 min), lo envía por correo (SMTP del tenant) y permite definir la nueva contraseña en `/restablecer/[token]`. Respuestas siempre genéricas (no revela si el email existe), rate limiting por email y logs SECURITY/AUDIT. Actions en `src/lib/auth/recuperacion-actions.ts`.

## Facturación electrónica SRI

Portada de GABLIMADOS (en producción real), adaptada a `Venta` y multitenant, con la contraseña de firma cifrada. Flujo: configurar emisor → emitir desde Ventas → firma XML con `.p12` → recepción y autorización ante el SRI (hasta 5 intentos) → estado guardado en `facturas_sri`. Helpers en `src/lib/sri/helpers.ts` (clave de acceso con `crypto.randomInt`), emisión en `src/app/(app)/ventas/sri-actions.ts`, RIDE PDF en `src/lib/reports/ride.ts`, envío por correo en `src/lib/utils/email.ts`.

## Roles
- **SUPERADMIN** (Solinteec): global, orquesta todos los minimarkets.
- **ADMIN** (dueño): gestiona todo.
- **USER** (cajero): POS y consulta; no edita productos, compras, gastos ni anula.

## Pendientes (siguiente iteración)
Historial de cierres de caja exportable; considerar hacer privado el repositorio.
