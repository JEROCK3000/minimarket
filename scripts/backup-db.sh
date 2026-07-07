#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Backup diario cifrado de la base de datos (referencia).
# mysqldump -> gzip -> cifrado AES-256 -> copia local rotada.
# Envío por correo opcional (ver el sistema completo en el servidor de GABLIMADOS).
#
# Configura BASE_DIR, DB y crea /root/backups/.env con:
#   BACKUP_ENCRYPTION_PASSWORD=<clave fuerte, respaldada en gestor de contraseñas>
# Programa con cron:  0 3 * * * /ruta/backup-db.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

DB="${1:-nombre_base}"
BASE_DIR="/root/backups"
STORE_DIR="$BASE_DIR/store"
RETENTION_DAYS=7

# shellcheck disable=SC1091
source "$BASE_DIR/.env"   # BACKUP_ENCRYPTION_PASSWORD

mkdir -p "$STORE_DIR"
FECHA=$(date +%F_%H%M)
ARCHIVO="$STORE_DIR/${DB}_${FECHA}.sql.gz.enc"

# Dump + comprimir + cifrar en un solo pipe (el volcado en claro nunca toca disco)
if mysqldump -u root --single-transaction --quick --routines --triggers "$DB" \
    | gzip -9 \
    | openssl enc -aes-256-cbc -pbkdf2 -salt -pass "pass:$BACKUP_ENCRYPTION_PASSWORD" \
    > "$ARCHIVO"; then
  echo "[$(date '+%F %T')] OK backup $DB -> $ARCHIVO ($(du -h "$ARCHIVO" | cut -f1))"
else
  echo "[$(date '+%F %T')] ERROR backup $DB" >&2
  rm -f "$ARCHIVO"
  exit 1
fi

# Rotación
find "$STORE_DIR" -name "*.sql.gz.enc" -mtime +$RETENTION_DAYS -delete

# Restaurar:
#   openssl enc -d -aes-256-cbc -pbkdf2 -pass "pass:LA_CLAVE" -in ARCHIVO.sql.gz.enc | gunzip | mysql -u root NOMBRE_BASE
