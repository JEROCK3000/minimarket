# Bitácora — MiniMarket (julio 2026)

Registro cronológico de la construcción y despliegue del sistema, para que cualquier
desarrollador o IA pueda continuar sin perder contexto.

## Léeme primero — estado al 2026-08-05

**Sistema en producción y estable.** Sin commits ni cambios de código desde el
`8589387` (2026-07-19). Sin incidentes: última actividad registrada en logs de
producción es una venta con factura autorizada el 2026-07-22. El repo local
(`git status`) está limpio y sincronizado con `origin/main`.

- **Qué hay**: 13+ módulos completos (POS, facturación SRI + Nota de Crédito,
  inventario/kardex, compras, gastos, caja, clientes, dashboard con gráficas,
  reportes Excel+PDF, recuperación de contraseña por correo, cambio de
  email/contraseña de cuenta). Detalle módulo por módulo en `modulos.md`.
- **Pendiente real, no técnico**: el admin (`dueno@minimarket.com`) sigue con el
  correo y la contraseña del seed original. La función para cambiarlos existe desde
  el 2026-07-19 (Configuración → Seguridad) pero nadie la ha usado todavía — es una
  acción manual pendiente, no código por escribir. Ver `produccion.md` → Pendiente.
- **Pendientes técnicos menores**: historial de cierres de caja exportable;
  considerar pasar el repo de público a privado (github.com/JEROCK3000/minimarket).
- **Antes de tocar algo**: lee este archivo completo (es corto) y `modulos.md`. Para
  desplegar, ver `produccion.md` (`./scripts/deploy.sh minimarket` en el servidor,
  vía SSH `root@server16.solinteec.com`, ya con la llave de host aceptada).
- **Cómo se ha verificado cada cambio en este proyecto**: no solo build/typecheck —
  se levanta el servidor, se dirige un navegador real (Playwright + Chrome del
  sistema) contra los flujos afectados, se capturan pantallas, y si la prueba tocó
  datos reales de la BD (contraseñas, emails, tokens) se restaura el estado original
  al terminar. Mantener esa práctica en cambios futuros.
- **Nota histórica (no requiere acción)**: en `origin/main` verás 4 commits del
  31-jul/2-ago con archivos bajo `.github/shellpanel-*`. Fue el incidente de
  seguridad global de GitHub de esas fechas; Solinteec ya lo remedió en todos sus
  repos, incluido este. El árbol actual está limpio (verificado: sin rastro de esos
  archivos, diff neto del rango = vacío). No malinterpretar como compromiso activo.

## Origen

Nació como caso práctico de uso del **Solinteec Starter** (`../solinteec-starter`), la
plantilla base segura de la empresa. Se copió el starter, se configuró (nombre, BD, secretos)
y se diseñó el modelo de datos del negocio sobre su núcleo (auth, cifrado, multitenancy,
logging, validación ya resueltos).

## Construcción (en orden)

1. **Schema** (`prisma/schema.prisma`): 15+ tablas de negocio con `tenantId` — productos,
   inventario/kardex, compras, proveedores, ventas, clientes, gastos, cierres de caja,
   EmisorSRI y FacturaSRI.
2. **Navegación**: sidebar responsive con todos los módulos + helper `requerirTenant()`.
3. **Módulos** (detalle en `modulos.md`): Productos/Inventario → Compras → POS/Ventas →
   Gastos → Facturación SRI → Reportes/Dashboard → Clientes → Config (Correo/Seguridad) →
   Cierre de Caja → Anulación de ventas → Vista previa de factura.

Cada módulo se construyó, compiló y **verificó en vivo** contra la BD (ej.: la venta descuenta
stock y crea kardex; la anulación revierte stock 48→43→48; el RIDE genera PDF válido).

## Decisiones clave

- **POS**: factura electrónica por defecto, con opción de **solo ticket** (`Venta.requiereFactura`).
- **Multitenancy**: se mantiene `tenantId` en todo aunque hoy haya un solo minimarket — deja
  abierta la venta del sistema a otros locales sin reprogramar.
- **Facturación SRI**: portada de GABLIMADOS (en producción real), adaptada a `Venta`, con la
  contraseña de la firma **cifrada** (mejora sobre el original).
- **Validación de identificación**: dígito verificador de cédula/RUC ecuatoriano, para no
  registrar identificaciones que el SRI rechazaría.

## Despliegue a producción (2026-07-06)

Ver `produccion.md`. Resumen: `/var/www/minimarket`, puerto 3006,
https://minimarket.solinteec.com, BD `minimarket_db`, PM2, nginx + SSL Certbot.
Repo público github.com/JEROCK3000/minimarket. Verificado en HTTPS.

## Backups

`minimarket_db` incluida en el respaldo diario del servidor (3 AM). Ver
`../../gablimados/docs/backups.md`. Ese día se detectó y resolvió que el envío por correo
fallaba por bloqueo del puerto 587 + SMTP intermitente: se implementó **fallback** (cloudcone
→ Gmail 465). Las copias locales cifradas nunca fallaron.

## Iteración post-despliegue (julio 2026)

Mejoras hechas ya con el sistema en producción (en orden de commits):

1. **RIDE formato estándar SRI** con datos completos del cliente, desglose de IVA, logo de
   empresa configurable y recuadros de altura dinámica. Fix de zona horaria Ecuador para la
   fecha de emisión y visualización de los errores reales que devuelve el SRI.
2. **Edición del cliente en caliente** durante la venta en el POS (teléfono, email, dirección).
3. **Nota de Crédito** para anular facturas autorizadas: emisión ante el SRI con firma propia
   (`signCreditNoteXml`), RIDE de NC y reenvío de comprobantes a un correo editable.
4. **Dashboard con gráficas** de tendencia (ventas/gastos, diaria/mensual) y métodos de pago.
5. **Impresión de comprobante** al terminar la venta (ticket térmico 80mm y A4).
6. **Consulta de RUC propia**: primero una API contra el SRI que reemplazó a EcuadorAPI para
   RUC, luego centralizada en `apiruc.solinteec.com`; la API Key se configura desde
   Configuración (antes solo `.env`). Las cédulas siguen vía EcuadorAPI.

## Sesión 2026-07-19 — cuenta y reportes

1. **Recuperación de contraseña desde el login**: enlace "¿Olvidaste tu contraseña?" →
   `/recuperar` envía por correo un enlace de un solo uso (token aleatorio, solo su hash
   SHA-256 en BD, tabla `tokens_recuperacion`, validez 30 min) → `/restablecer/[token]`
   define la nueva contraseña. Respuesta siempre genérica (no revela si el email existe),
   rate limiting por email, rutas públicas agregadas al middleware.
2. **Cambio del correo de la cuenta** en Configuración → Seguridad (verifica contraseña,
   unicidad global y reemite el JWT). Permite reemplazar el correo por defecto del
   desarrollo, requisito para que la recuperación llegue al correo real del usuario.
3. **Reportes en PDF** (pendiente desde el despliegue): ventas, gastos e inventario con
   generador común (`src/lib/reports/pdf-reporte.ts`, jsPDF + autotable) — encabezado,
   filtros, totales, resumen por categoría (gastos), fecha de generación y numeración de
   páginas. La UI de Reportes ofrece ahora Excel y PDF por reporte.

Todo verificado en vivo con Playwright contra el build de producción local: flujo completo
de recuperación (token inválido/reusado rechazado, login con la nueva contraseña), cambio de
email (duplicado rechazado) y descarga de los tres PDF.

## Estado

Sistema completo en producción. Pendientes menores: historial de cierres de caja exportable,
considerar repo privado. La contraseña del admin ya puede cambiarse desde la propia app
(Configuración → Seguridad o recuperación por correo).
