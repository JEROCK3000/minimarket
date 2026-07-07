# Despliegue

Guía para desplegar un proyecto basado en esta plantilla en un servidor Linux con PM2.

## Requisitos del servidor

- Node.js (vía nvm) y npm
- MySQL o MariaDB
- PM2 (`npm i -g pm2`), configurado para arrancar al boot (`pm2 startup` + `pm2 save`)
- Nginx (o similar) como reverse proxy con HTTPS

## Variables de entorno en producción

En el `.env` del servidor, **distintas a las de desarrollo**:

```bash
openssl rand -hex 48   # JWT_SECRET
openssl rand -hex 32   # ENCRYPTION_KEY  (respáldala en el gestor de contraseñas)
```

La app **no arranca** sin `JWT_SECRET` (≥32 chars). Sin `ENCRYPTION_KEY`, los secretos nuevos se guardarían sin cifrar (se registra WARN).

## Repositorio privado (recomendado)

Si el repo es privado, el servidor necesita una **llave de deploy** de solo lectura:

```bash
# En el servidor
ssh-keygen -t ed25519 -f ~/.ssh/deploy_<proyecto> -N "" -C "deploy-<proyecto>"
cat ~/.ssh/deploy_<proyecto>.pub    # agregar en GitHub → repo → Settings → Deploy keys (sin write)

# Config SSH para usar esa llave con este repo
cat >> ~/.ssh/config <<EOF
Host github.com-<proyecto>
  HostName github.com
  User git
  IdentityFile ~/.ssh/deploy_<proyecto>
  IdentitiesOnly yes
EOF

git remote set-url origin git@github.com-<proyecto>:ORG/REPO.git
```

## Despliegue

```bash
./scripts/deploy.sh <nombre-proceso-pm2>
```

El script hace pull, instala, aplica el esquema (`prisma db push` **sin** `--accept-data-loss`), compila y reinicia PM2.

## Backups

Copia `scripts/backup-db.sh` al servidor, crea `/root/backups/.env` con `BACKUP_ENCRYPTION_PASSWORD` (clave fuerte respaldada) y prográmalo:

```bash
crontab -e
# Backup diario a las 3 AM:
0 3 * * * /root/backups/backup-db.sh nombre_base
```

Genera backups **cifrados** con rotación de 7 días. Restauración:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -pass "pass:LA_CLAVE" \
  -in archivo.sql.gz.enc | gunzip | mysql -u root nombre_base
```

> El proyecto GABLIMADOS tiene una versión ampliada de este backup que además envía
> cada copia cifrada por correo (un correo por base). Reutilízala si necesitas copia externa.

## Checklist post-despliegue

```txt
[ ] JWT_SECRET y ENCRYPTION_KEY definidos y respaldados
[ ] Contraseñas del seed cambiadas
[ ] HTTPS activo (HSTS se sirve solo en producción)
[ ] Backups programados y probada una restauración
[ ] Repositorio privado
[ ] npm audit sin vulnerabilidades altas/críticas
```
