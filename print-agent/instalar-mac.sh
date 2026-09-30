#!/bin/sh
# Genera el certificado autofirmado local (uno por instalación, nunca
# compartido), e instala el agente como LaunchAgent para que macOS lo
# arranque solo al iniciar sesión — sin que el usuario tenga que abrir
# una Terminal nunca más.
set -e
CARPETA="$(cd "$(dirname "$0")" && pwd)"
cd "$CARPETA"

if [ ! -f cert.pem ] || [ ! -f key.pem ]; then
    echo "Generando certificado autofirmado para 127.0.0.1..."
    openssl req -x509 -newkey rsa:2048 -nodes \
        -config openssl-req.cnf \
        -keyout key.pem -out cert.pem -days 3650 \
        -subj "/CN=127.0.0.1" \
        -addext "subjectAltName=IP:127.0.0.1,DNS:localhost"
else
    echo "Ya existe un certificado, no se genera uno nuevo."
fi

RUTA_PYTHON3="$(command -v python3)"
if [ -z "$RUTA_PYTHON3" ]; then
    echo "No se encontró python3 en el PATH. Instálelo primero." >&2
    exit 1
fi

DESTINO_PLIST="$HOME/Library/LaunchAgents/com.solinteec.print-agent-minimarket.plist"
mkdir -p "$HOME/Library/LaunchAgents"

echo "Instalando LaunchAgent en $DESTINO_PLIST (python3: $RUTA_PYTHON3) ..."
sed -e "s|__RUTA_AGENTE__|$CARPETA|g" -e "s|__RUTA_PYTHON3__|$RUTA_PYTHON3|g" \
    com.solinteec.print-agent-minimarket.plist.template > "$DESTINO_PLIST"

# Si ya estaba cargado (reinstalación), descargarlo primero para que tome
# la ruta/versión actual sin quedar duplicado.
launchctl bootout "gui/$(id -u)" "$DESTINO_PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$DESTINO_PLIST"
launchctl enable "gui/$(id -u)/com.solinteec.print-agent-minimarket"

sleep 1
echo ""
if curl -sk -m 3 https://127.0.0.1:9448/estado > /dev/null 2>&1; then
    echo "Listo — el agente ya está corriendo y arrancará solo de ahora en adelante."
else
    echo "El agente se instaló pero no respondió aún; revise /tmp/print-agent-minimarket.log"
fi

echo ""
echo "IMPORTANTE (una sola vez): abra https://127.0.0.1:9448/estado directo"
echo "en el navegador que usará para vender, y acepte el aviso de"
echo "certificado no confiable (es normal, es propio de este agente, solo"
echo "válido para esta computadora)."
