#!/bin/sh
# Llama cada hora al envío del resumen diario (crontab: 5 * * * *).
# El secreto se lee del .env de la app; nunca se escribe en crontab ni en logs.
DIR="$(cd "$(dirname "$0")/.." && pwd)"
SECRETO=$(grep -E '^CRON_SECRET=' "$DIR/.env" | head -1 | cut -d= -f2- | tr -d '"')
[ -z "$SECRETO" ] && exit 0
curl -s -m 120 -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $SECRETO" http://127.0.0.1:3006/api/cron/resumen-diario
