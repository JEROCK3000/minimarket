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

## Sesión 2026-09-30 — identificación con detección automática (cédula / RUC)

Mismo cambio aplicado en ecofacturacion. **Motivo:** el cliente dicta su número
sin decir si es cédula o RUC; ahora se escribe solo el número y se detecta.

- **Componente `src/components/forms/IdentificacionInput.tsx`** en Clientes
  (`ClienteForm`) y en el modal "Cliente para la factura" del POS. Consulta
  automática al completar 10/13 dígitos (pausa 800 ms), Enter o lupa. Persona
  natural → "Facturar con: [Cédula] [RUC]" (RUC = cédula+001, verificado en el
  SRI con `verificarRucAction` si no se sabe). Pasaporte vía "Otro tipo".
- **Detección** en `src/lib/clientes/identificacion.ts` (sin dependencias).
- **`consultarIdentificacionAction`** (clientes/actions): BD del tenant buscando la
  persona por sus dos formas (sin duplicar) → RUC vía apiruc `/ruc` → cédula vía
  apiruc `/cedula` (gratis, misma `ruc_api_key`) → EcuadorAPI de respaldo.
  Se eliminó `buscarClienteAction` del POS (la búsqueda la hace esta acción).
- **Identificación congelada en la venta**: `Venta.tipoIdentificacionComprador` /
  `identificacionComprador` se llenan al vender. Factura (`sri-actions`), Nota de
  Crédito (`nc-actions`), RIDE (`factura-actions`), vista previa y ticket usan
  `compradorDeVenta()` (`src/lib/ventas/comprador.ts`); ventas antiguas (NULL) usan
  el cliente. Antes, si el cliente cambiaba de cédula a RUC, una factura emitida
  después o su NC salían con el dato nuevo.
- `registrarVentaAction` ahora valida que el `clienteId` sea del tenant.
- **Buscar clientes registrados en el POS** (prop `sugerirRegistrados`): al escribir
  un nombre o parte del número (≥2 caracteres) se listan hasta 8 clientes del tenant
  (`buscarClientesRegistradosAction`, `contains` sobre collation `utf8mb4_unicode_ci`:
  ignora mayúsculas y tildes); con el campo vacío, los 8 más recientes. Flechas +
  Enter para elegir. Elegir uno de cédula/RUC pasa por el flujo normal (selector
  Cédula/RUC incluido).
- **Dirección del SRI**: se guardan las dos últimas secciones (parroquia, calle) sin
  el nombre alterno entre paréntesis (`depurarDireccion` en `lib/sri/consulta-ruc.ts`).
- **Migración**: `prisma db push` (2 columnas opcionales, sin pérdida) + backfill:
  `UPDATE ventas v JOIN clientes c ON c.id = v.clienteId SET v.tipoIdentificacionComprador = c.tipoIdentificacion, v.identificacionComprador = c.identificacion WHERE v.identificacionComprador IS NULL;`
- **Verificación**: `tsc` y `npm run build` OK; lógica de detección y comprador
  probada por script. No se pudo probar en navegador en local (sin credenciales
  locales conocidas); verificar en producción.
- **`rucEcuatorianoValido`** (`src/lib/validators`): sociedades (9) y entidades
  públicas (6) ya no validan dígito verificador mod-11, solo estructura (sufijo
  001/0001). Rechazaba RUCs reales de S.A.S. (p. ej. `1793212860001`); mismo
  criterio que apiruc (`docs/ruc.md`). Persona natural sigue validando la cédula.

## Sesión 2026-09-30 (cont.) — Fase 1: impuestos SRI, compras e impresión térmica

Plan acordado con el dueño (análisis completo en esta sesión): Fase 1 → 2 → 3 →
evolución, desplegando cada fase. Orden y estado:

**Fase 1 (desplegada)**
- **IVA por tarifa real en SRI** (error tributario): la factura y la NC enviaban
  TODO con `codigoPorcentaje 4` (15%) aunque el producto fuera 0%. Ahora cada
  línea usa la tarifa de su producto y `totalConImpuestos` se agrupa por tarifa.
  Cálculo único en `src/lib/ventas/totales.ts` (`calcularVenta`): subtotal por
  línea redondeado, descuento global prorrateado (la última línea absorbe el
  residuo), IVA por línea sobre la base con descuento. Lo usan registrar venta,
  factura (`sri-actions`), NC (`nc-actions` + `lib/sri/nota-credito.ts`), ticket.
  Códigos SRI en `src/lib/sri/impuestos.ts`. Productos: solo tarifas 0/5/12/13/14/15.
- **Forma de pago SRI** (error tributario): siempre iba `01`. Ahora EFECTIVO→01,
  TARJETA→19 (crédito; el POS no distingue débito), TRANSFERENCIA→20.
- **Stock atómico** (`src/lib/inventario/movimientos.ts`, `moverStock`): venta,
  compra y anulaciones usan increment/decrement en BD y derivan el kardex del
  resultado. Antes se leía el stock fuera de la transacción: ventas simultáneas
  del mismo producto se pisaban. Anular venta/compra marca primero con
  `updateMany` condicionado: dos anulaciones simultáneas no revierten dos veces.
- **Compras: detalle y anulación**. `Compra.estado` (ACTIVA/ANULADA),
  `anuladaAt`, `motivoAnulacion` (db push, columnas nuevas). Listado con búsqueda
  y filtro; modal `CompraDetalle` (productos, costos, IVA, totales). Anular (ADMIN,
  motivo obligatorio) retira del stock lo que ingresó (kardex AJUSTE); se bloquea
  si el stock quedaría negativo. El precio de compra no se revierte.
- **Impresión térmica** (copia adaptada del agente de ecofacturacion, sin tocar el
  original): `print-agent/` propio, **puerto 9448**, tarea Windows
  `print-agent-minimarket`, LaunchAgent `com.solinteec.print-agent-minimarket`,
  servicio `print-agent-minimarket.service`. Bytes ESC/POS generados en servidor
  (`src/lib/print/escpos.ts`, CP850, 42 col, corte total) por
  `pos/print-actions.ts`: RIDE si la factura está AUTORIZADA, ticket de venta no
  fiscal si no. Navegador → `https://127.0.0.1:9448/imprimir` (`lib/print/termica.ts`).
  Configuración → Impresora: IP (config `impresora_termica_ip`), probar impresión,
  estado del agente y descarga del agente en .zip (`/api/print-agent`, solo ADMIN,
  lista blanca de archivos, nunca `*.pem`). POS: "Emitir factura e imprimir" e
  "Imprimir en térmica"; Ventas: el botón de impresión usa la térmica. Sin
  impresora o si el agente falla → impresión por navegador como antes.
- Dependencia `fflate` declarada explícitamente (ya estaba instalada como
  transitiva). `npm audit`: 13 vulnerabilidades preexistentes (Next.js crítica,
  nodemailer, sharp…), ninguna nueva — pendiente actualizar dependencias.

**Fase 2 (desplegada)**
- **Kardex por producto y ajustes de inventario** (`productos/inventario-actions.ts`,
  `KardexModal.tsx`): botón de historial en cada producto (todos los roles ven el
  kardex con saldo). ADMIN: Merma (tipo MERMA), Entrada/Salida (AJUSTE) y Conteo
  físico (ajusta la diferencia). Motivo obligatorio; nunca deja stock negativo.
- **Usuarios** (`/usuarios`, solo ADMIN, menú filtrado por rol): crear cajero o
  administrador con contraseña temporal (`crypto.randomBytes`, bcrypt 12, se
  muestra una sola vez), editar nombre/rol, activar/desactivar y restablecer
  contraseña. Reglas: no cambiar el propio rol ni desactivarse; siempre queda al
  menos un ADMIN activo; el correo es único en todo el sistema (el login busca
  por correo sin tenant). Nunca se registran contraseñas en logs.
- **Apertura de caja** (`AperturaCaja`, tabla `aperturas_caja`; `CierreCaja.fondoInicial`):
  fondo inicial opcional. El período del cierre ahora es desde la apertura abierta,
  o desde el último cierre, o desde el inicio del día (antes siempre "hoy": dos
  cierres el mismo día contaban dos veces). Efectivo esperado = fondo + ventas en
  efectivo − gastos. El cierre cierra la apertura.
- **Seguridad**: `obtenerResumenCaja(tenantId, …)` estaba exportada desde un
  archivo `'use server'` (invocable desde el navegador con cualquier tenantId).
  Movida a `src/lib/caja/estado.ts` (no es server action). Era el único caso.

**Fase 3 (desplegada)**
- **Proveedores** (`/proveedores`, ADMIN): listado con búsqueda, total comprado,
  nº de compras y última compra (solo compras ACTIVAS), crear/editar, desactivar
  (se conserva historial), historial de compras y autocompletar por RUC (apiruc).
- **Categorías**: gestión desde Productos (renombrar, ícono, activar/desactivar,
  conteo de productos). Filtro "Solo stock bajo" en Productos.
- **Descuento en el POS** ($ o %): el POS ahora usa `calcularVenta` (antes su
  propio cálculo, podía diferir un centavo del servidor). El descuento se prorratea
  en la factura y queda en el log AUDIT de la venta.
- **Costo al vender**: `VentaItem.costoUnitario` (precio de compra en el momento).
  Ventas anteriores: NULL → los reportes usan el costo actual y lo marcan con `*`.
- **Reportes nuevos** (helper común `src/lib/reports/tabla.ts` + `api/reportes/_comun.ts`):
  utilidad y margen por producto, ventas por cajero, compras, cierres de caja (ADMIN)
  y productos sin movimiento (N días). Descargas con el nombre fechado del servidor.
- **Pendiente, a propósito: devoluciones parciales.** `NotaCredito.ventaId` es
  `@unique` (una NC por venta) y el flujo SRI/RIDE/Ventas/anulación depende de esa
  relación 1:1. Hacerlas bien exige varias NC por venta: refactor del flujo
  tributario que ya funciona → sesión dedicada con pruebas en ambiente de pruebas SRI.

## Estado

Sistema completo en producción. Pendientes menores: historial de cierres de caja exportable,
considerar repo privado. La contraseña del admin ya puede cambiarse desde la propia app
(Configuración → Seguridad o recuperación por correo).

**Evolución (parcial, desplegada 2026-09-30)**: visor de auditoría (`/auditoria`, ADMIN), PWA (manifest, íconos, `/manifest.webmanifest` excluido del middleware), etiquetas de precio ESC/POS con código de barras (EAN-13/CODE128) desde Productos, backend de importación Excel (`productos/importar-actions.ts` + `/api/productos/plantilla`, límite server actions 3 MB). Pantalla de importación en Productos (botón Importar, `ImportarModal`) desplegada después. **Pendiente**: fechas de vencimiento, fiado/CxC/CxP, devoluciones parciales.
