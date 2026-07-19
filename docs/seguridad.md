# Seguridad

Controles de seguridad implementados en la plantilla. Las reglas obligatorias completas están en `AGENTS.md §14`.

## Controles de fábrica

| Control | Dónde | Detalle |
|---|---|---|
| JWT sin fallback | `lib/auth/jwt.ts`, `middleware.ts` | La app falla al arrancar si `JWT_SECRET` falta o < 32 chars |
| Autorización en servidor | `lib/auth/session.ts` | `requerirSesion/Admin/Superadmin`, valida usuario activo y rol contra BD |
| Cifrado de secretos | `lib/security/crypto.ts` | AES-256-GCM, retrocompatible con texto plano legado |
| Máscara de secretos | `crypto.ts` (`SECRETO_MASCARA`) | Nunca se envía un secreto real al navegador |
| Rate limiting de login | `lib/auth/actions.ts` | 5 intentos → bloqueo 15 min por email |
| Hash de contraseñas | `lib/auth/actions.ts`, `seed.ts` | bcrypt costo 12 |
| Validación de entradas | `lib/validators`, zod en actions | Formato, longitud, rango |
| Sanitización de logs | `lib/logs/logger.ts` | Redacta password, token, secret, cookie, etc. |
| Headers de seguridad | `next.config.ts` | X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS |
| Cookies seguras | `lib/auth/actions.ts` | httpOnly, secure en prod, sameSite lax, expiración 7 días |
| Errores genéricos | convención | Detalle solo en `registrarLog`, no al cliente |
| Recuperación de contraseña | `lib/auth/recuperacion-actions.ts` | Token `crypto.randomBytes` de un solo uso, solo hash SHA-256 en BD, 30 min de validez, respuesta genérica, rate limiting por email |
| Cambio de email/contraseña | `configuracion/seguridad/actions.ts` | Exige la contraseña actual; el cambio de email verifica unicidad y reemite el JWT |

## Variables de entorno de seguridad

| Variable | Obligatoria | Uso |
|---|---|---|
| `JWT_SECRET` | Sí (≥32 chars) | Firma de sesiones. Generar: `openssl rand -hex 48` |
| `ENCRYPTION_KEY` | Sí para cifrar (64 hex) | Cifrado de secretos en BD. Generar: `openssl rand -hex 32`. **Respaldar en gestor de contraseñas** |
| `SEED_ADMIN_PASSWORD` | No | Contraseña del superadmin en el seed (si se omite, se genera aleatoria) |
| `SMTP_ALLOW_INVALID_CERTS` | No | Solo para SMTP interno con certificado inválido; por defecto la verificación TLS está activa |

## Al crear un módulo

Sigue el checklist de `AGENTS.md §14.8`. Los tres errores más comunes que esta plantilla previene:

1. **Olvidar `requerirSesion()`** en una server action → cualquiera con sesión (o sin ella si el middleware falla) ejecuta la acción. Siempre la primera línea.
2. **Confiar en el `tenantId` del cliente** → fuga entre tenants. Tómalo siempre de la sesión.
3. **Devolver `error.message` al cliente** → filtra rutas internas y detalles de librerías. Mensaje genérico al usuario, detalle a `registrarLog`.

## Cómo cifrar un secreto nuevo

```ts
import { cifrarSecreto, descifrarSecreto, SECRETO_MASCARA } from '@/lib/security/crypto'

// Guardar (en una action con requerirAdmin())
if (nuevoValor && nuevoValor !== SECRETO_MASCARA) {
  await prisma.config.update({ where: {...}, data: { valor: cifrarSecreto(nuevoValor) } })
}

// Leer (para usarlo)
const secreto = descifrarSecreto(config.valor)

// Enviar a la UI: nunca el valor real
const paraFormulario = config.valor ? SECRETO_MASCARA : ''
```
