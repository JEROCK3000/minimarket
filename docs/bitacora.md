# Bitácora — MiniMarket (julio 2026)

Registro cronológico de la construcción y despliegue del sistema, para que cualquier
desarrollador o IA pueda continuar sin perder contexto.

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

## Estado

Sistema completo (13 módulos) en producción. Pendientes menores: Nota de Crédito para anular
facturas autorizadas, reportes en PDF, cambiar contraseña del admin, considerar repo privado.
