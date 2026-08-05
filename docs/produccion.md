# Despliegue en producción — MiniMarket

Registro del despliegue realizado el 2026-07-06. El MiniMarket corre en el mismo servidor que GABLIMADOS y las demás apps de Solinteec.

## Infraestructura

- **Servidor**: `server16.solinteec.com` (66.154.126.91), Ubuntu 24.04. Acceso root por SSH.
- **Runtime**: Node v22.22.3 (nvm) → `export PATH=/root/.nvm/versions/node/v22.22.3/bin:$PATH`
- **Gestor de procesos**: PM2 (arranca al boot).
- **Directorio**: `/var/www/minimarket`
- **Puerto interno**: 3006 (proceso PM2 `minimarket`)
- **URL pública**: https://minimarket.solinteec.com
- **Base de datos**: MySQL `minimarket_db`, usuario dedicado `minimarket_usr`.
- **Repositorio**: https://github.com/JEROCK3000/minimarket (público). Deploy con `git pull` directo.

Apps que conviven en el servidor (no tocar en un deploy): gablimados (3005), finanzas-app (3000), plataforma-gad (3001), minimarket (3006).

## Variables de entorno de producción (`/var/www/minimarket/.env`, chmod 600)

```txt
DATABASE_URL   → mysql://minimarket_usr:***@localhost:3306/minimarket_db
JWT_SECRET     → 48 bytes hex (distinto a desarrollo)
ENCRYPTION_KEY → 32 bytes hex (respaldado en gestor de contraseñas)
PORT           → 3006
NODE_ENV       → production
NEXT_PUBLIC_APP_URL  → https://minimarket.solinteec.com
```

La app **no arranca** sin `JWT_SECRET`. Los secretos de negocio (firma .p12, SMTP, token EcuadorAPI) se cifran con `ENCRYPTION_KEY` — si se pierde, no se descifran.

## Nginx

Config en `/etc/nginx/sites-available/minimarket.solinteec.com` (symlink en sites-enabled): proxy inverso a `localhost:3006` con headers estándar, HTTP→HTTPS forzado. Réplica de la config de gablimados.

## SSL

Certificado Let's Encrypt emitido con Certbot para `minimarket.solinteec.com`, renovación automática programada.

## Deploy de cambios (futuro)

Como el repo es público, el servidor hace `git pull` directo:

```bash
cd /var/www/minimarket
export PATH=/root/.nvm/versions/node/v22.22.3/bin:$PATH
./scripts/deploy.sh minimarket
```

El script hace: `git pull` + `npm install` + `prisma db push` (sin `--accept-data-loss`) + `prisma generate` + `npm run build` + `pm2 restart minimarket`. El `.env` está en `.gitignore`, no se toca en el pull.

## Backups

`minimarket_db` está incluida en el sistema de backups diarios del servidor (3 AM) junto a las otras 3 apps. Ver `../../gablimados/docs/backups.md` para el detalle del sistema (copias locales cifradas + envío por correo con fallback).

## Pasos post-despliegue realizados

1. BD y usuario MySQL creados; `.env` de producción con secretos nuevos.
2. `npm install`, `prisma db push`, `npm run db:seed`, `npm run build`.
3. PM2 start + save (persistente al reboot).
4. Nginx + Certbot (SSL).
5. Verificado: HTTPS 200, HTTP→HTTPS 301, headers de seguridad (HSTS, X-Frame), rutas protegidas redirigen a login.
6. `git init` + remote + `git pull` configurado para futuros deploys.

## Pendiente

- **Acción manual sin hacer todavía**: el usuario `dueno@minimarket.com` (ADMIN) sigue
  con el correo y la contraseña del seed. La funcionalidad para cambiarlos ya existe
  (Configuración → Seguridad, desde el 2026-07-19, ver `bitacora.md`) — falta que alguien
  entre y lo haga. Confirmado por logs: sin eventos de cambio de email/contraseña hasta
  el 2026-08-05.
- Considerar hacer el repo privado (software propietario). Hoy es público:
  github.com/JEROCK3000/minimarket.
- Historial de cierres de caja exportable (ver `modulos.md`).
