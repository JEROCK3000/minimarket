#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Script de despliegue — Solinteec Starter
# Ejecutar en el servidor, dentro del directorio del proyecto.
# Requisitos: git configurado (llave de deploy si el repo es privado), node, pm2.
# ─────────────────────────────────────────────────────────────────────────────
set -e

APP_NAME="${1:-solinteec-app}"   # nombre del proceso PM2 (pásalo como argumento)
BLUE='\033[0;34m'; GREEN='\033[0;32m'; NC='\033[0m'

echo -e "${BLUE}=== Desplegando $APP_NAME ===${NC}"

echo -e "${BLUE}[1/5] Actualizando repositorio...${NC}"
git pull origin main

echo -e "${BLUE}[2/5] Instalando dependencias...${NC}"
npm install --no-fund --no-audit

echo -e "${BLUE}[3/5] Aplicando esquema de base de datos...${NC}"
# SIN --accept-data-loss: si un cambio implicara perder datos, el deploy se detiene
# y la decisión debe tomarla un humano. Ver AGENTS.md.
npx prisma db push

echo -e "${BLUE}[4/5] Generando cliente y compilando...${NC}"
npx prisma generate
npm run build

echo -e "${BLUE}[5/5] Reiniciando en PM2...${NC}"
PORT=$(grep -v '^#' .env | grep -i '^PORT=' | cut -d'=' -f2 | tr -d '"' | tr -d "'" | tr -d ' ' || echo "3000")
PORT=${PORT:-3000}
if pm2 list | grep -q "$APP_NAME"; then
  pm2 restart "$APP_NAME" --update-env
else
  pm2 start npm --name "$APP_NAME" -- start -- -p "$PORT"
fi
pm2 save

echo -e "${GREEN}=== Despliegue completado (puerto $PORT) ===${NC}"
