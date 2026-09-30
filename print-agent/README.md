# Agente local de impresión térmica — MiniMarket (Solinteec)

Programa pequeño que corre en la computadora de la caja (la que tiene acceso a
la impresora térmica) y recibe, desde el navegador, los bytes del ticket ya
generados por el servidor (`minimarket.solinteec.com`), para reenviarlos por red
directo a la impresora (puerto 9100/raw) — la única forma confiable de que el
**corte automático** funcione.

Copia adaptada del agente de Facturación Electrónica (`ecofacturacion/print-agent`),
que a su vez viene del de SmartianERP. Solo requiere **Python 3** (ya viene en
Mac y casi toda distribución Linux; en Windows hay que instalarlo desde
[python.org](https://www.python.org/downloads/), marcando "Add Python to PATH").

> **Agente independiente, puerto 9448.** Cada sistema tiene el suyo, sin
> depender de los otros: SmartianERP (9445), Restoware (9446), Facturación
> Electrónica (9447), **MiniMarket (9448)**. Si la computadora ya tiene alguno
> de esos instalado, igual hay que instalar este; no hay conflicto de puerto.

| Sistema operativo | Nombre con que queda registrado |
|---|---|
| Windows | Tarea programada **`print-agent-minimarket`** |
| macOS | LaunchAgent `com.solinteec.print-agent-minimarket` (log en `/tmp/print-agent-minimarket.log`) |
| Linux | Servicio systemd de usuario `print-agent-minimarket.service` |

## Instalación (una sola vez por computadora)

Copiar la carpeta `print-agent/` completa a la computadora de la caja y ejecutar:

- **Windows** (PowerShell, no requiere administrador):
  `powershell -ExecutionPolicy Bypass -File instalar-windows.ps1`
- **macOS**: `./instalar-mac.sh`
- **Linux** (systemd): `./instalar-linux.sh`

Cada instalador genera un certificado autofirmado propio de esa computadora
(nunca se comparte ni se sube al repositorio: `*.pem` está en `.gitignore`),
registra el agente para que arranque solo al iniciar sesión y lo deja corriendo.

**Paso manual, una sola vez:** abrir `https://127.0.0.1:9448/estado` directo en
el navegador con el que se vende y aceptar el aviso de certificado no confiable
(es esperado: es un certificado propio del agente, válido solo para esa computadora).

## Configuración en el sistema

En **Configuración → Impresora**, escribir la **IP de la impresora térmica**
(la que tiene asignada en la red local, ej. `192.168.1.50`) y usar **Probar
impresión**. Desde ese momento:

- En el POS, al terminar una venta: **Imprimir térmica** (y **Emitir factura e
  imprimir** cuando la venta es con factura).
- En **Ventas**, cada venta tiene la acción **Imprimir térmica**.

La factura autorizada sale con los datos del RIDE (emisor, cliente, detalle,
IVA por tarifa, forma de pago, número de autorización y clave de acceso). Una
venta sin factura autorizada sale como ticket de venta (no fiscal).

Si el agente no está corriendo o la impresora no responde, el sistema avisa y
ofrece imprimir por el navegador (sin corte automático).

## Problemas conocidos

Ver el README del agente de Facturación Electrónica
(`ecofacturacion/print-agent/README.md`) — mismos casos y mismas soluciones,
cambiando el puerto a **9448**:

- *No imprime en ningún navegador aunque `/estado` responde*: certificado del
  navegador desincronizado. Borrar `cert.pem`/`key.pem`, reinstalar y volver a
  aceptar `https://127.0.0.1:9448/estado`.
- *Windows no genera `cert.pem`*: el instalador ya usa `openssl-req.cnf` propio;
  confirmar que ese archivo está en la carpeta.
- *Impresora USB*: soporte experimental (`tipo: "usb"`), pendiente de depurar en
  SmartianERP. Usar impresora **de red** (por IP).
