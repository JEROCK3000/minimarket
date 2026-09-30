#!/bin/sh
# Genera el certificado autofirmado local (uno por instalación, nunca
# compartido), e instala el agente como servicio systemd de usuario para
# que arranque solo al iniciar sesión — sin terminal abierta.
set -e
CARPETA="$(cd "$(dirname "$0")" && pwd)"
cd "$CARPETA"

if ! command -v systemctl > /dev/null 2>&1; then
    echo "Este instalador requiere systemd (systemctl no encontrado)." >&2
    echo "Si su distribución no lo usa, corra 'python3 print-agent.py' manualmente" >&2
    echo "o agréguelo a su propio sistema de arranque." >&2
    exit 1
fi

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
    echo "No se encontró python3 en el PATH. Instálelo primero (ej. 'sudo apt install python3')." >&2
    exit 1
fi

mkdir -p "$HOME/.config/systemd/user"
DESTINO_SERVICE="$HOME/.config/systemd/user/print-agent-minimarket.service"

echo "Instalando servicio systemd de usuario en $DESTINO_SERVICE (python3: $RUTA_PYTHON3) ..."
sed -e "s|__RUTA_AGENTE__|$CARPETA|g" -e "s|__RUTA_PYTHON3__|$RUTA_PYTHON3|g" \
    print-agent-minimarket.service.template > "$DESTINO_SERVICE"

systemctl --user daemon-reload
systemctl --user enable --now print-agent-minimarket.service

# Para que arranque incluso sin haber iniciado sesión gráfica (algunos
# entornos minimal/servidor) — falla silenciosamente si no aplica, no es
# obligatorio para un escritorio normal.
loginctl enable-linger "$(whoami)" 2>/dev/null || true

sleep 1
echo ""
if curl -sk -m 3 https://127.0.0.1:9448/estado > /dev/null 2>&1; then
    echo "Listo — el agente ya está corriendo y arrancará solo de ahora en adelante."
else
    echo "El agente se instaló pero no respondió aún; revise:"
    echo "  journalctl --user -u print-agent-minimarket.service -n 50"
fi

echo ""
echo "IMPORTANTE (una sola vez): abra https://127.0.0.1:9448/estado directo"
echo "en el navegador que usará para vender, y acepte el aviso de"
echo "certificado no confiable (es normal, es propio de este agente, solo"
echo "válido para esta computadora)."
