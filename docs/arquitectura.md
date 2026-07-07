# Arquitectura

## Organización

```txt
src/
├─ middleware.ts          Primera barrera de auth (redirige a /login sin token válido)
├─ app/
│  ├─ layout.tsx          Layout raíz: tema claro/oscuro, fuentes, toaster
│  ├─ page.tsx            Redirige a /dashboard o /login según sesión
│  ├─ (auth)/login/       Página de login (pública)
│  └─ (app)/              Rutas protegidas
│     ├─ layout.tsx       Verifica sesión, header con usuario y logout
│     └─ dashboard/       Ejemplo de página protegida
├─ components/
│  ├─ layout/             ThemeProvider, etc.
│  └─ ui/                 Componentes reutilizables
└─ lib/
   ├─ auth/
   │  ├─ jwt.ts           Firma/verificación JWT, obtenerSesion, cookie
   │  ├─ session.ts       requerirSesion / requerirAdmin / requerirSuperadmin
   │  └─ actions.ts       loginAction (con rate limit) / logoutAction
   ├─ security/crypto.ts  cifrarSecreto / descifrarSecreto (AES-256-GCM)
   ├─ db/prisma.ts        Cliente Prisma único
   ├─ logs/logger.ts      registrarLog con sanitización
   ├─ validators/         Esquemas zod reutilizables
   └─ utils/cn.ts         Merge de clases Tailwind
```

## Flujo de autenticación

1. El usuario envía el formulario de login → `loginAction` (server action).
2. Se valida con zod, se comprueba rate limiting, se busca el usuario y se compara la contraseña con bcrypt.
3. Si es correcto, se firma un JWT (jose, HS256, 7 días) con `{ sub, tenantId, nombre, email, rol }` y se guarda en una cookie **httpOnly**.
4. En cada petición, `middleware.ts` verifica que el token sea válido (primera barrera).
5. En cada server action / route handler, `requerirSesion()` vuelve a validar **contra la BD** (usuario activo, rol actual). Esta es la barrera real de autorización.

## Multitenancy

- `Usuario.tenantId` es `null` solo para el `SUPERADMIN` global.
- Todo modelo de negocio nuevo debe llevar `tenantId` y filtrarse por él.
- El `tenantId` se obtiene de la sesión (`requerirSesion()`), nunca de un parámetro del cliente.
- Jerarquía de roles: `USER (1) < ADMIN (2) < SUPERADMIN (3)`.

## Decisiones técnicas

- **JWT en cookie httpOnly** en vez de librería externa de sesiones: simple, sin dependencia de servicio, suficiente para el tamaño de estos proyectos.
- **Cifrado AES-256-GCM con retrocompatibilidad**: `descifrarSecreto` devuelve texto plano legado tal cual, para migrar sin romper datos existentes.
- **zod** para validación en el borde de cada server action.
- **Prisma + MySQL/MariaDB** por estándar de Solinteec (ver `AGENTS.md §3`).
