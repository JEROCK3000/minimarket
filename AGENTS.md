# AGENTS.md — Solinteec Starter

## Propósito

Reglas obligatorias para cualquier agente de IA, asistente de código o desarrollador que trabaje en un proyecto basado en esta plantilla. Léelo antes de crear, modificar o eliminar cualquier parte del sistema.

El objetivo es mantener consistencia técnica, arquitectónica, visual y de seguridad, evitando soluciones improvisadas, inseguras o genéricas.

Esta plantilla ya implementa las bases de seguridad de la sección 14. **No las degrades**: cada módulo nuevo las hereda.

---

## 1. Principios generales

Todo proyecto se trata como un producto SaaS profesional: escalable, mantenible y listo para producción. Considera siempre: arquitectura SaaS, multitenancy, seguridad, escalabilidad, mantenibilidad, UX profesional, documentación continua, trazabilidad por logs, modo claro/oscuro, diseño responsive, posible evolución a PWA, reportes profesionales y separación entre usuario final, admin de tenant y superadministrador.

No generar soluciones improvisadas, incompletas, visualmente pobres o con apariencia genérica típica de IA.

---

## 2. Stack obligatorio

**Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS, Server Components cuando aplique, Client Components solo cuando sean necesarios, componentes reutilizables, responsive, modo claro/oscuro completo.

**Backend:** Server Actions y Route Handlers, servicios por dominio, validaciones estrictas (zod), control de permisos en servidor, logs centralizados. No crear una API separada sin justificación técnica real.

**Lenguaje:** TypeScript. No usar JavaScript plano en archivos nuevos salvo justificación documentada.

---

## 3. Base de datos

**Permitido:** MariaDB, MySQL. **Prohibido:** PostgreSQL, SQLite en producción, MongoDB como base principal.

PostgreSQL no debe ser sugerido, instalado ni usado. Si una plantilla o librería lo propone, reemplazarlo por MariaDB/MySQL.

**ORM:** Prisma. El diseño considera multitenancy, auditoría, roles, permisos, timestamps, soft deletes cuando aplique, integridad referencial, índices correctos y relaciones claras.

---

## 4. SaaS y multitenancy

Toda aplicación es SaaS multitenant salvo indicación contraria. Debe existir separación lógica por tenant y un `SUPERADMIN` global.

Contempla: tenants, usuarios, roles, permisos, configuración por tenant, auditoría, logs, planes/suscripciones si aplica.

**Seguridad multitenant:** toda consulta de negocio debe considerar `tenantId`. Un usuario de un tenant nunca accede a datos de otro. Toda operación sensible valida: usuario autenticado, tenant activo, rol, permisos, propiedad del recurso y estado del tenant.

El modelo base (`prisma/schema.prisma`) ya incluye `Tenant`, `Usuario` con `tenantId`, roles y logs.

---

## 5. Autenticación y autorización

Autenticación segura: cookies httpOnly, JWT firmado (jose), sesiones propias. Cookies de sesión: httpOnly, secure en producción, sameSite adecuado, expiración definida. Contraseñas solo con hash bcrypt (costo 12+).

Prohibido guardar contraseñas en texto plano, tokens sin cifrar, secretos en logs o claves privadas en el repo.

**Los permisos se validan en servidor, no solo en la UI.** Esta plantilla provee `requerirSesion()` / `requerirAdmin()` / `requerirSuperadmin()` en `src/lib/auth/session.ts`.

---

## 6. UI, UX y estilos

Interfaz profesional, moderna y actual. Cuida jerarquía visual, espaciado, tipografía, botones, tablas, formularios, tarjetas, navegación, estados (hover/focus/disabled/vacío/carga) y mensajes de error/éxito.

**Responsive obligatorio** (móvil, tablet, laptop, desktop). **Modo claro y oscuro** en todo componente. Evita diseños genéricos, colores sin criterio, gradientes/sombras excesivos y formularios desordenados.

**Regla UX para CRUD:** (1) primero el listado con búsqueda/filtros, (2) botón visible `+ Nuevo`, (3) edición en vista o modal dedicado por registro, (4) no mezclar creación y edición masiva en el listado.

---

## 7. PWA

Diseñar pensando en posible evolución a PWA: manifest, iconos, theme/background color, service worker, estrategia de caché, instalable, offline si aplica.

---

## 8. Reportes

Formatos principales: Excel `.xlsx` (con exceljs) y PDF profesional (jsPDF+autotable, @react-pdf/renderer o Puppeteer). CSV solo como formato auxiliar si el usuario lo pide explícitamente, nunca como principal.

Excel y PDF deben incluir cuando aplique: título, contexto, fecha de generación, filtros aplicados, encabezados claros, formato de moneda/fechas, totales/subtotales, estilos y nombre de archivo fechado. PDF además: encabezado con logo/nombre, numeración de páginas, pie de página.

---

## 9. Documentación

Toda documentación va en `/docs`. Documenta funcionalidades, arquitectura, base de datos, migraciones, correcciones, decisiones técnicas, permisos, reportes, integraciones y despliegue. Debe permitir que otra IA o desarrollador continúe sin perder contexto.

---

## 10. Logs

Los logs van en `/storage/logs` con archivo por fecha (`mmm-dd-yyyy.log`). Niveles: INFO, WARN, ERROR, SECURITY, AUDIT, DEBUG (solo desarrollo). Usa `registrarLog()` de `src/lib/logs/logger.ts`.

Registra: errores, warnings, ejecuciones importantes, accesos no autorizados, fallos de autenticación, generación de reportes, procesos automáticos, eventos del superadministrador.

**Nunca registres** passwords, tokens, JWT, cookies, claves API, secretos, tarjetas ni datos bancarios. El logger ya sanitiza campos sensibles; no lo eludas.

---

## 11. Estructura del proyecto

```txt
/
├─ prisma/            # schema.prisma + seed.ts
├─ src/
│  ├─ middleware.ts   # primera barrera de auth
│  ├─ app/            # rutas (App Router): (auth), (app)
│  ├─ components/     # ui/, layout/, forms/, tables/
│  ├─ lib/
│  │  ├─ auth/        # jwt, session (guards), actions (login)
│  │  ├─ security/    # crypto (cifrado de secretos)
│  │  ├─ db/          # cliente prisma
│  │  ├─ logs/        # logger sanitizado
│  │  ├─ validators/  # esquemas zod
│  │  └─ utils/
├─ storage/logs/
├─ docs/
├─ scripts/           # deploy, backups
├─ AGENTS.md · README.md · .env.example
```

---

## 12. Flujo de trabajo para agentes

**Antes de modificar:** lee este archivo y `/docs`, entiende el módulo, identifica impacto en BD/permisos/UI/logs/documentación, evita cambios innecesarios, mantén el estilo existente.

**Después:** actualiza `/docs` si aplica, implementa logs, mantén el stack, no introduzcas PostgreSQL, no uses CSV como reporte principal, valida responsive y claro/oscuro, considera multitenancy y superadmin.

---

## 13. Checklist general por tarea

```txt
[ ] Respeta el stack  [ ] Sin PostgreSQL  [ ] MariaDB/MySQL si toca BD
[ ] SaaS/multitenant  [ ] Valida permisos y roles  [ ] Superadmin si aplica
[ ] UI profesional, responsive, claro/oscuro  [ ] Reportes .xlsx/PDF, no CSV
[ ] Logs relevantes sin datos sensibles  [ ] Documenta en /docs
[ ] Maneja errores sin exponer internals  [ ] TypeScript estricto
[ ] Valida entradas externas  [ ] Performance y accesibilidad básica
```

---

# 14. Seguridad obligatoria (heredada de la auditoría GABLIMADOS)

Estas reglas ya están implementadas en la plantilla. Todo módulo nuevo debe cumplirlas.

## 14.1 Autorización en servidor
- **Toda server action y route handler inicia con `requerirSesion()` / `requerirAdmin()` / `requerirSuperadmin()`** (`src/lib/auth/session.ts`). El middleware es la primera barrera, nunca la única.
- Operaciones de configuración, secretos o administración exigen `requerirAdmin()` o superior.
- La identidad (usuarioId, tenantId, rol) se toma **de la sesión**, nunca de parámetros del cliente.
- El rol se valida contra la BD, no contra el valor del token.

## 14.2 Secretos y credenciales
- **Prohibido cualquier secreto hardcodeado o fallback** (`process.env.X || 'valor'`). Si falta una variable crítica, la app falla al arrancar (ver `jwt.ts`).
- Secretos en BD (contraseñas de terceros, tokens de API) se cifran con `cifrarSecreto()` / `descifrarSecreto()` (`src/lib/security/crypto.ts`, requiere `ENCRYPTION_KEY`).
- **Nunca enviar un secreto real al navegador.** Usa el centinela `SECRETO_MASCARA`; conserva el valor guardado si la action lo recibe sin cambios.
- Contraseñas de usuario: solo hash bcrypt (costo 12+). Seeds sin contraseñas fijas.

## 14.3 Validación de entradas
- Toda entrada externa se valida en el servidor con **zod** (formato, longitud, rango, tipo) antes de tocar la BD.
- Subida de archivos: validar tamaño máximo, extensión y contenido (magic bytes).
- Nunca interpolar datos del usuario en SQL crudo. Usar siempre Prisma; `$queryRawUnsafe` prohibido.

## 14.4 Manejo de errores
- Al cliente solo mensajes genéricos y accionables; el detalle técnico (stacktrace, rutas, mensajes de librerías) va solo a `registrarLog`.
- Prohibido `console.log` de payloads, respuestas de APIs o datos de clientes.

## 14.5 Red y transporte
- **Prohibido `rejectUnauthorized: false`** o desactivar verificación TLS. Escape documentado por variable de entorno solo para servidores internos.
- Los headers de seguridad de `next.config.ts` (X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS) no se eliminan ni relajan.
- Aleatoriedad con función de seguridad: `crypto.randomInt` / `crypto.randomBytes`, nunca `Math.random()`.

## 14.6 Autenticación de usuarios
- El login mantiene rate limiting (5 intentos → bloqueo 15 min). Todo flujo de auth nuevo incluye protección equivalente.
- Mensajes de login siempre genéricos ("Credenciales incorrectas"), sin revelar si el email existe.

## 14.7 Repositorio
- Prohibido commitear: `.env`, logs, certificados (`.p12`, `.key`), backups y cualquier archivo con datos personales reales (usar datos ficticios en pruebas).
- Ejecutar `npm audit` al agregar/actualizar dependencias; no incorporar vulnerabilidades altas/críticas sin mitigación documentada.

## 14.8 Checklist de seguridad por módulo nuevo
```txt
[ ] Server actions inician con requerirSesion()/requerirAdmin()
[ ] Identidad tomada de la sesión, no del cliente
[ ] Consultas de negocio filtradas por tenantId
[ ] Inputs validados con zod (formato, longitud, rango)
[ ] Secretos cifrados en BD y enmascarados hacia el navegador
[ ] Sin secretos ni fallbacks hardcodeados
[ ] Errores genéricos al cliente, detalle solo en logs
[ ] Sin console.log de datos sensibles
[ ] TLS verificado en toda conexión saliente
[ ] Aleatoriedad criptográfica donde haya función de seguridad
[ ] Archivos subidos validados (tamaño, tipo, contenido)
[ ] npm audit sin vulnerabilidades altas/críticas nuevas
[ ] Nada sensible commiteado al repositorio
```

---

# 15. Regla final

Este proyecto debe tratarse como un producto SaaS profesional. Cada cambio debe mejorar o mantener: calidad técnica, seguridad, claridad, escalabilidad, experiencia de usuario, documentación, trazabilidad y consistencia visual.
