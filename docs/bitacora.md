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
- **Fechas de vencimiento** (desplegado): `CompraItem.fechaVencimiento` (DATE, opcional) en el formulario de compra y en el detalle. `src/lib/inventario/vencimientos.ts` estima por **FIFO** qué lotes siguen en stock (compras activas de la más reciente hacia atrás hasta cubrir el stock) y toma el vencimiento más próximo: no avisa de lotes ya vendidos. Productos: aviso "Vence en N d / Vencido" y filtro "Por vencer" (30 días). Reporte "Productos por vencer" (días configurables). **Pendiente**: devoluciones parciales.
- **Fiado / cuentas por cobrar** (desplegado): forma de pago `CREDITO` en el POS (botón "Fiado", exige cliente registrado). `Venta.saldoPendiente` y `diasCredito` (30, `DIAS_CREDITO`); la factura SRI la declara `01` con plazo. `AbonoVenta` (tabla `abonos_venta`): `/cobros` reparte cada cobro FIFO entre las ventas pendientes con `updateMany` condicional (saldo ≥ abono). Caja: el fiado ya no cae en "transferencias" (antes todo lo que no era efectivo/tarjeta se sumaba ahí); los cobros en efectivo suman al efectivo esperado (`CierreCaja.abonosEfectivo`). No se puede anular (sin NC) una venta con abonos; NC/anulación dejan el saldo en 0. Reporte "Cartera por cobrar". RIDE: TARJETA ahora dice "TARJETA DE CRÉDITO" (igual que el código 19 del XML).
- **Cuentas por pagar a proveedores** (desplegado): compra "A crédito" con plazo (`Compra.condicionPago`, `saldoPendiente`, `venceEl`); `PagoCompra` (tabla `pagos_compra`). En Proveedores: columna "Por pagar" (y vencido) y botón Pagar con reparto FIFO atómico. Pagos en efectivo restan del efectivo esperado de caja (`CierreCaja.pagosProveedorEfectivo`). No se anula una compra con pagos. Seguridad: `crearCompraAction` ahora valida que el proveedor sea del tenant.
- **Imágenes de productos** (desplegado): `Producto.imagen`. Subida desde el formulario (JPG/PNG/WebP ≤ 3 MB), validada por magic bytes y RE-CODIFICADA con sharp a WebP 400×400 (sin EXIF/GPS ni contenido embebido), guardada en `storage/productos/<tenantId>/` (en .gitignore; incluir en los respaldos del servidor) y servida solo al mismo tenant por `/api/productos/[id]/imagen` (URL versionada → caché). POS: tarjetas con imagen (o inicial) y **PVP con IVA** (antes mostraba el precio sin IVA; el carrito indica "+ IVA").
- **Revisión de cabos sueltos**: Next 16.2.9 → **16.3.7** (corrige la vulnerabilidad crítica y la de sharp → 0.35.5; `npm audit`: 13 → 4, quedan nodemailer —requiere v10, cambio mayor— y js-yaml/open-factura/xmlbuilder2 sin corrección publicada). `.gitignore`: `/storage/sri/` (firma .p12), `/storage/logos/`, `/storage/productos/` (no estaban ignorados; nunca se subieron). Ventas: etiqueta "Fiado · debe $X". Ticket y pantalla de venta muestran el saldo fiado. Verificado que toda server action inicia con requerirTenant/requerirSesion (salvo login/logout/recuperación, públicas por diseño).
- **Agente de impresión instalado en la Mac de desarrollo** (LaunchAgent `com.solinteec.print-agent-minimarket`, puerto 9448, responde y solo acepta CORS de minimarket.solinteec.com). Falta aceptar el certificado en el navegador (paso manual).

## Sesión 2026-10-01 — correcciones reportadas por el dueño

- **Gasto no aparecía en el dashboard**: `new Date('YYYY-MM-DD')` se interpreta en UTC (= día anterior 19:00 en Ecuador; el proceso corre con `TZ=America/Guayaquil`), y los formularios proponían `toISOString().slice(0,10)` (desde las 19:00 sugería "mañana"). Nuevo `src/lib/utils/fechas.ts` (`hoyLocalISO`, `inicioMesLocalISO`, `fechaDeDia`): un gasto de hoy se guarda con la hora real (cuenta en la caja abierta) y de otro día a mediodía local. Aplicado en gastos, reportes y nombres de archivo. Se corrigieron en BD los gastos ya registrados con 00:00 UTC.
- **Factura a Consumidor Final imposible**: el POS lo permitía elegir pero el servidor exigía un cliente con id. Ahora la factura sin cliente usa el cliente "CONSUMIDOR FINAL" (9999999999999, se crea una vez por tenant, tipo SRI 07) y se aplica el límite SRI de **USD 50** (como SmartianERP), con aviso en el POS. Fiado sigue exigiendo cliente identificado.
- **Caja obligatoria para vender**: `registrarVentaAction` rechaza la venta si no hay apertura vigente (`cajaAbierta()` en `lib/caja/estado.ts`); el POS muestra un modal "La caja está cerrada" que pide el fondo inicial y la abre.
- **Control de caja configurable** (Configuración → Operación, clave `usar_control_caja` en `config`, **activo por defecto**; `usaControlCaja()` en `src/lib/config/negocio.ts`). Inactivo: se vende sin apertura (la validación de `registrarVentaAction` se omite), el POS no muestra el modal, "Cierre de Caja" se oculta del menú y `/caja` muestra un aviso. No se puede desactivar con una caja abierta (dejaría una apertura colgada que descuadraría el siguiente arqueo al reactivar).

## Sesión 2026-10-03 — "RUC Proveedor" (Res. SRI NAC-DGERCGC26-00000027)

- Mismo criterio que ecofacturacion/SmartianERP: `<campoAdicional nombre="RUC Proveedor">` en `<infoAdicional>` de **factura y nota de crédito** (después de `<detalles>`, como exige el XSD). Módulo `src/lib/sri/info-adicional.ts`. El RUC es el del proveedor del software (Solinteec), igual para todos los negocios: configuración GLOBAL editable por el superadmin (ver abajo; inicialmente fue la variable `SRI_RUC_PROVEEDOR`, ya eliminada). Sin valor → se emite sin el campo y se registra un WARN (no se interrumpe la facturación).
- **RIDE PDF y ticket térmico**: bloque "Información Adicional" leído del **XML autorizado** (`extraerInfoAdicional`), así cada documento muestra exactamente lo que autorizó el SRI (las facturas anteriores no lo muestran porque su XML no lo lleva).
- De paso: el RIDE calculaba subtotales por tarifa sin el descuento y tomaba IVA/total de la venta; ahora usa `calcularVenta` (igual que el XML) en factura y NC (`datosRide` en `ventas/factura-actions.ts`).
- **Panel del SUPERADMIN** (`/superadmin`, antes no existía: el superadmin `superadmin@solinteec.com`, sin tenant, entraba al dashboard y obtenía un error). Ahora el layout de la app lo redirige a su panel: lista de minimarkets (solo lectura: emisor SRI, usuarios, productos, ventas, estado) y **Configuración global** con el **RUC Proveedor** (tabla `config` con `tenantId` NULL, clave `ruc_proveedor_software`, `src/lib/config/global.ts`; validado 13 dígitos terminado en 001; cambio auditado). La facturación lo lee de ahí (`rucProveedorSoftware()` es async; si falla la consulta, se emite sin el campo).
- **Multitenant**: confirmado (todas las tablas de negocio con tenantId, `requerirTenant()` en cada acción). Pendiente: alta de minimarkets nuevos desde el panel (hoy por BD/seed).

## Sesión 2026-10-04 — Arquitectura SaaS (lógica tomada de SmartianERP, UI de minimarket)

Se copió la **lógica** multitenant/SaaS de SmartianERP (solo lectura de ese repo) manteniendo la interfaz propia de minimarket.

- **Suscripciones**: `Tenant` con `ruc`, `emailContacto`, `telefono`, `planId`, `estado` (PRUEBA | ACTIVO | CANCELADO, guardado), `suspendidoManual`, `cicloFacturacion`, `fechaExpiracion`, `notasAdmin`. Modelos `PlanSuscripcion` (límites `maxUsuarios`/`maxProductos`/`maxFacturasMes`, null = ilimitado; `diasPrueba`), `PagoSuscripcion`, `SolicitudRegistro`. `src/lib/saas/suscripcion.ts`: GRACIA (3 días tras vencer) y SUSPENDIDO se **calculan** al vuelo (`calcularEstado`), no hay cron. `bloqueoPorSuscripcion()` bloquea las **operaciones que escriben** (vender, facturar, NC, productos, compras, usuarios, ajustes, cobros) en SUSPENDIDO/CANCELADO; las consultas y reportes siguen disponibles. `limiteDelPlan()` aplica los límites del plan. Tenant existente: ACTIVO sin plan ni vencimiento = sin límites.
- `requerirTenant()` y el login rechazan tenants inactivos o CANCELADOS. Banner `AvisoSuscripcion` en la app (aviso 7 días antes, gracia, suspendido). ADMIN: Configuración → **Suscripción** (solo lectura: plan, uso vs límites, pagos).
- **Panel superadmin**: dashboard con KPIs, alta de minimarket + ADMIN con contraseña temporal (se muestra una vez), detalle por tenant (cambiar plan, registrar pago → extiende vigencia y pasa a ACTIVO, fijar vencimiento, suspender, cancelar, restablecer contraseña de usuarios, notas), CRUD de **planes**, cambio de contraseña del superadmin. Todo con `requerirSuperadmin()` y log AUDIT.
- **Registro público** (`/registro`, ruta pública del middleware): el negocio elige plan y ciclo, ingresa sus datos y su ADMIN (contraseña elegida por él, guardada solo como hash bcrypt 12). Se le da un enlace privado `/registro/solicitud/<token>` (en BD solo el SHA-256 del token) con el estado, los **datos de pago** (config global `datos_pago_suscripcion`, editable en Superadmin → Configuración) y la subida del comprobante (JPG/PNG/WebP/PDF ≤ 5 MB validado por magic bytes, `storage/solicitudes/`, en .gitignore; rate limit 5/h por IP). Superadmin → **Solicitudes**: ver comprobante (`/api/superadmin/comprobante/[id]`), verificar pago, aprobar (crea tenant + ADMIN; con pago → ACTIVO por el periodo + `PagoSuscripcion`; sin pago → PRUEBA por los días de prueba del plan) o rechazar con motivo (lo ve el solicitante).
- Planes iniciales con `prisma/seed-planes.ts` (idempotente; Básico $15, Profesional $25, Empresarial $40 — **precios referenciales**, editar en /superadmin/planes).
- `slugUnico` movido a `src/lib/saas/tenants.ts` (no exportar helpers desde archivos 'use server').
- **Imágenes de productos sin límite práctico de peso** (2026-10-04): `src/lib/utils/comprimir-imagen.ts` reduce la foto en el navegador (lado máx. 1200 px, JPEG con calidad decreciente y, si hace falta, menor tamaño) hasta ≤ 1,5 MB antes de enviarla; respeta la orientación EXIF y pone fondo blanco a PNG transparentes. Acepta cualquier `image/*` que el navegador decodifique (HEIC en Safari). El servidor sigue validando magic bytes y re-codificando a WebP 400×400.
- **Validación de fechas de vencimiento en compras** (2026-10-05): no se acepta una fecha anterior a hoy (formulario con `min` + validación en `crearCompraAction`). Si alguna vence hoy o en los próximos `DIAS_CONFIRMAR_VENCIMIENTO` (7) días, el formulario muestra un aviso por línea y pide confirmar ("¿Las fechas de vencimiento son correctas?") antes de registrar. Nuevo `actualizarVencimientoItemAction` (ADMIN, compra activa, log AUDIT): el detalle de la compra permite **corregir la fecha** con el lápiz sin anular la compra (la fecha no afecta el stock). Utilidad `diasHasta()` en `lib/utils/fechas.ts`.
- Cantidades (compras, stock, ajustes) con `step="any"`: las flechas suben de 1 en 1 y se aceptan decimales escritos.

## Sesión 2026-10-05 — Compras desde la factura electrónica del proveedor (XML / clave de acceso)

Basado en la importación de XML de insumos de GABLIMADOS (revisión por línea con "Destino": crear nuevo o sumar a uno existente; aviso de cajas; anti-duplicado por clave de acceso), ampliado:
- **Entrada**: archivo XML (comprobante `<factura>` o respuesta de autorización con el comprobante en CDATA o escapado, con/sin namespaces) **o la clave de acceso** de 49 dígitos (escrita o leída con el lector de códigos desde el RIDE; búsqueda automática al completar 49 dígitos) → `descargarFacturaPorClave` (`lib/compras/sri-descarga.ts`, `documentAuthorization` de open-factura; ambiente según la posición 24 de la clave).
- **Lectura en servidor** (`lib/compras/xml-factura.ts`, fast-xml-parser, ahora dependencia directa): rechaza DTD/ENTITY, máx. 2 MB y 500 ítems, solo codDoc 01. Costo unitario = `precioTotalSinImpuesto / cantidad` (incluye descuentos); IVA por tarifa o código de porcentaje.
- **Preparación** (`compras/xml-actions.ts` → `leerFacturaCompraAction`, ADMIN, no guarda nada): proveedor por RUC (o nuevo: se crea al guardar la compra), número de factura, avisos (factura a nombre de otro RUC, ambiente de pruebas), **duplicado** (misma clave de acceso o proveedor + nº en una compra activa) y reconocimiento de productos: 1) equivalencia aprendida, 2) código de barras (codigoAuxiliar/codigoPrincipal), 3) nombre normalizado.
- **Revisión** en "Nueva compra" (`CargarFactura.tsx` + `CompraForm.tsx`): por línea, producto existente o "🆕 Crear producto nuevo" (nombre, precio de venta sin IVA obligatorio, código de barras e IVA del XML) y **«Unid. x empaque»** (factor) que recalcula cantidad y costo.
- **Registro** (`crearCompraAction`): crea proveedor y productos nuevos en la misma transacción (respeta el límite de productos del plan), guarda `Compra.claveAcceso` y bloquea facturas duplicadas también en compras manuales con proveedor + nº. Aprende `ProductoCodigoProveedor` (tenant + RUC del proveedor + código → producto y factor): la próxima factura de ese proveedor sale reconocida y con el empaque correcto.
- Pendiente/idea: lectura de **foto** de la factura con IA (OCR) — requiere API externa con costo; el XML/clave es exacto y gratis.
- **Anti-duplicado reforzado como GABLIMADOS**: `@@unique([tenantId, claveAcceso])` en `compras` (antes solo índice + verificación previa, que no cubría dos guardados simultáneos). Un `P2002` en `crearCompraAction` se informa como "factura ya registrada" y revierte toda la transacción (nada se suma al stock). Diferencia con GABLIMADOS: al **anular** una compra se libera su clave (`claveAcceso = null`, la clave queda en el log AUDIT) para poder volver a cargar la factura corregida. Validaciones en capas: al leer el XML (aviso y botón bloqueado), al registrar (consulta) y en la BD (índice único). Proveedor + nº de factura se sigue verificando por consulta.

## Sesión 2026-10-05 — Prioridad 1: control (mermas, toma de inventario, caja, devoluciones)

- **Mermas clasificadas**: `MovimientoInventario` ahora guarda `categoria` (VENCIDO | DANADO | CONSUMO | ROBO | FALTANTE | OTRO, `lib/inventario/mermas.ts`), `costoUnitario` (costo del producto en ese momento, en TODO movimiento vía `moverStock`) y `usuarioNombre`. El ajuste "Merma" del kardex exige el tipo; un "Conteo físico" que baja el stock queda como FALTANTE. Kardex muestra quién registró. Reporte **Mermas y pérdidas** (ADMIN, Excel/PDF, rango): movimientos de salida con tipo MERMA o categoría, valorizados a costo, resumen por tipo (los movimientos antiguos sin costo usan el costo actual).
- **Toma de inventario físico** (`/inventario`, menú "Toma de inventario"): modelos `TomaInventario` (TI-00001, alcance todos o una categoría, EN_CURSO | APLICADA | CANCELADA, faltante/sobrante a costo) y `TomaInventarioItem` (cantidad contada + `stockAlContar`). Una toma en curso por negocio. ADMIN crea/aplica/cancela; cualquier usuario cuenta. Conteo con lector (código exacto → cantidad; o "Sumar 1 por cada lectura") o por nombre. **Conteo a ciegas**: al USER no se le envían stock ni costo. Al aplicar (transacción, marcado condicional anti doble clic) se ajusta `contado − stockAlContar` con kardex AJUSTE (faltantes con categoría FALTANTE → reporte de mermas), así las ventas hechas durante el conteo se respetan. Opción explícita para poner en 0 los no contados con stock. Reporte Excel/PDF por toma (`/api/reportes/toma?id=`).
- **Movimientos de caja** (retiros e ingresos de efectivo durante el turno): modelo `MovimientoCaja` (RETIRO | INGRESO, monto, motivo, usuario, apertura). `registrarMovimientoCajaAction` (cualquier usuario, caja abierta obligatoria, un retiro no puede superar el efectivo esperado, log AUDIT). No se eliminan: un error se corrige con el movimiento contrario. `obtenerResumenCaja` los suma: efectivo esperado = fondo + ventas efectivo + cobros efectivo + ingresos − gastos − pagos a proveedores − retiros. `CierreCaja.ingresosEfectivo/retirosEfectivo` y columnas en el reporte de cierres. Pantalla de caja: tarjeta "Movimientos de efectivo" con lista del turno.
- **Devoluciones parciales** (`ventas/devolucion-actions.ts`, `DevolucionModal.tsx`, botón "Devolver" en Ventas, solo ADMIN): modelos `Devolucion` (DEV-00001, motivo, totales, `formaReembolso` EFECTIVO | TARJETA | TRANSFERENCIA | SALDO, `reingresaStock`) y `DevolucionItem` (por línea de venta: cantidad, descuento, base, IVA). `Venta.totalDevuelto`. Cálculo puro `lib/ventas/devolucion.ts` (`calcularDevolucion`): descuento global prorrateado e IVA por línea como la factura; al devolver todo lo que queda de una línea usa el remanente exacto → la suma de devoluciones cuadra al centavo con la factura (probado con 3 tandas y decimales). No permite devolver más de lo vendido (re-validado dentro de la transacción).
  - **Ticket**: devolución interna. **Factura autorizada**: NC **PARCIAL** al SRI (`NotaCredito.tipo` TOTAL | PARCIAL, `ventaId` ya no es único, `devolucionId`, `datosPendientes`). La emisión al SRI se extrajo a `lib/sri/emitir-nc.ts` (`emitirNotaCreditoSri`, `consultarAutorizacionNC`), usada también por la NC total (mismo código, movido). Si el SRI demora, la NC queda PENDIENTE con lo pedido y **"Consultar SRI"** en la venta la aplica al autorizarse; si se autorizó pero falló la aplicación, tampoco se pierde (queda pendiente de aplicar). Una venta con NC parcial pendiente no admite otra devolución.
  - Efectos: stock vuelve (kardex AJUSTE) o, si volvió dañado, entra y sale como MERMA "Dañado" (reporte de mermas). Reembolso en efectivo exige caja abierta y efectivo suficiente, y resta del arqueo (`CierreCaja.devolucionesEfectivo`). Fiado con deuda: obligatorio descontar del saldo. Dashboard muestra ventas netas (devoluciones restan en su fecha). Reporte de ventas: columnas Devuelto y Neto; **corregido**: el total sumaba también las ventas anuladas. Utilidad: resta la venta devuelta y el costo solo si el producto regresó al stock.
  - RIDE/correo de NC por `ncId` (parcial lista solo lo devuelto). La NC total (anular factura) y la anulación de tickets se bloquean si la venta ya tiene devoluciones.
  - Pendiente: el reporte "Ventas por cajero" no descuenta devoluciones.
  - **Despliegue (nota para el futuro)**: quitar `@unique` de `notas_credito.ventaId` falló en MySQL ("needed in a foreign key constraint") porque Prisma intenta borrar el índice único antes de crear el normal. Se resolvió sin `--accept-data-loss`: `CREATE INDEX notas_credito_ventaId_idx ON notas_credito(ventaId)` con `prisma db execute` y luego `db push`. La NC existente quedó `tipo = TOTAL`.
- **Pantalla "Mermas"** (`/mermas`, menú, solo ADMIN): el registro dentro del kardex no se encontraba. Lista de los últimos 90 días con buscador y filtro por tipo, pérdida del mes a costo y por tipo, y botón **Registrar merma** (producto por lector o nombre → tipo → cantidad → pérdida calculada; detalle opcional). Usa `ajustarStockAction` (modo MERMA). El ajuste desde el kardex sigue disponible.

## Sesión 2026-10-05 — Prioridad 2: operación diaria

- **Cambio masivo de precios** (`/productos/precios`, botón "Precios" en Productos, solo ADMIN): filtros por categoría, proveedor (productos comprados a ese proveedor en compras activas) y nombre; reglas Subir % / Bajar % / Margen sobre costo %; redondeo del **PVP con IVA** hacia arriba a $0.05 / $0.10 / $0.25 (el precio sin IVA se recalcula a 4 decimales). Vista previa con margen; los que quedarían bajo el costo se excluyen salvo que se marquen. `actualizarPreciosMasivoAction` (transacción, máx. 3000, log AUDIT). Nuevo **`HistorialPrecio`** (anterior, nuevo, origen MASIVO | EDICION, regla, usuario): también se registra al editar el precio de un producto.
- **Pedido sugerido** (`/compras/pedido`, botón en Compras, solo ADMIN): `lib/compras/pedido-sugerido.ts` calcula venta diaria = (vendido en ventas COMPLETADAS − devuelto) / días analizados (7–90) y sugerido = venta diaria × días a cubrir + stock mínimo − stock, redondeado hacia arriba (enteros si la unidad es "unidad", décimas si es peso/volumen) y a **empaques completos** con el factor aprendido de las facturas XML del proveedor (`ProductoCodigoProveedor`). Filtro por proveedor = productos comprados a él. Cantidades editables; exporta Excel/PDF (`POST /api/reportes/pedido`, nombres y costos leídos de la BD) o abre **WhatsApp** (`wa.me`, teléfono del proveedor 09… → 5939…) con el pedido en texto.
