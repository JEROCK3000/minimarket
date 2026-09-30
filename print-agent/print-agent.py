#!/usr/bin/env python3
"""
Solinteec - Agente local de impresión térmica de MiniMarket

Recibe por HTTP local (127.0.0.1) los bytes ESC/POS ya generados por el
servidor (minimarket.solinteec.com) y los reenvía por un socket TCP directo a
la impresora térmica de red (puerto 9100 / raw / JetDirect), que es la única
forma confiable de que el corte automático funcione (el driver de CUPS para
impresoras "POS-80" clonadas no lo hace, aunque lo anuncie).

Solo acepta conexiones desde localhost. No requiere librerías externas.

Agente INDEPENDIENTE, puerto 9448: no comparte puerto ni proceso con el de
SmartianERP (9445), Restoware (9446) ni Facturación Electrónica (9447). Copia
adaptada del agente de Facturación Electrónica (ecofacturacion/print-agent).
"""

import base64
import json
import os
import re
import socket
import ssl
import subprocess
import tempfile
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PUERTO_AGENTE = 9448

CARPETA_AGENTE = os.path.dirname(os.path.abspath(__file__))
RUTA_CERT = os.path.join(CARPETA_AGENTE, "cert.pem")
RUTA_KEY = os.path.join(CARPETA_AGENTE, "key.pem")

# Orígenes permitidos para CORS: solo MiniMarket (los demás sistemas tienen
# su propio agente en otro puerto).
ORIGENES_PERMITIDOS = [
    "https://minimarket.solinteec.com",
    # Desarrollo local (npm run dev / npm start)
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]


class ImprimirHandler(BaseHTTPRequestHandler):
    def _cors_headers(self):
        origen = self.headers.get("Origin", "")
        if origen in ORIGENES_PERMITIDOS:
            self.send_header("Access-Control-Allow-Origin", origen)
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        # Private Network Access (Chrome): una página HTTPS pública que
        # contacta una IP local (127.0.0.1) requiere esta cabecera además
        # del CORS normal, si no la bloquea con "NetworkError" sin más detalle.
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def do_GET(self):
        # Ping de salud, útil para probar que el agente está corriendo.
        if self.path == "/estado":
            self.send_response(200)
            self._cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"ok": true, "agente": "print-agent-minimarket"}')
            return
        self.send_response(404)
        self._cors_headers()
        self.end_headers()

    def _imprimir_usb(self, nombre_cola, bytes_a_imprimir):
        # Solo letras, números, guiones y guion bajo — el nombre real de una
        # cola CUPS nunca lleva otra cosa; evita pasarle cualquier caracter
        # raro a subprocess aunque ya se invoque sin shell=True.
        if not re.match(r'^[A-Za-z0-9_-]+$', nombre_cola):
            raise ValueError("Nombre de cola de impresión inválido")

        # dir="/tmp" a propósito: la carpeta temporal por defecto de Python en
        # macOS (TMPDIR, algo como /var/folders/.../T/) es privada del usuario
        # (drwx------) y el proceso de CUPS que realmente envía a la impresora
        # no puede leerla ahí — "lp" reporta éxito (solo encola) pero nunca
        # imprime. /tmp es de acceso público (drwxrwxrwt), sí funciona.
        with tempfile.NamedTemporaryFile(delete=False, suffix=".bin", dir="/tmp") as f:
            f.write(bytes_a_imprimir)
            ruta_temp = f.name

        try:
            resultado = subprocess.run(
                ["lp", "-d", nombre_cola, "-o", "raw", ruta_temp],
                capture_output=True, text=True, timeout=10
            )
            if resultado.returncode != 0:
                raise RuntimeError(f"lp falló: {resultado.stderr.strip() or resultado.stdout.strip()}")
        finally:
            # "lp" solo encola el trabajo y retorna al instante — el proceso
            # de CUPS que de verdad lee el archivo y lo manda a la impresora
            # lo hace un momento después. Da un margen antes de borrar.
            #
            # NOTA: el modo USB quedó pendiente de depurar en SmartianERP —
            # funciona al invocar "lp" manualmente desde una terminal, pero
            # no al hacerlo desde este agente corriendo como proceso de
            # fondo (con o sin esta espera). El modo "red" (impresora con
            # IP) no tiene este problema y es el que está en uso real.
            time.sleep(2)
            os.unlink(ruta_temp)

    def do_POST(self):
        if self.path != "/imprimir":
            self.send_response(404)
            self._cors_headers()
            self.end_headers()
            return

        try:
            largo = int(self.headers.get("Content-Length", 0))
            cuerpo = self.rfile.read(largo)
            datos = json.loads(cuerpo)

            tipo = datos.get("tipo", "red")
            datos_base64 = datos.get("datos_base64")
            if not datos_base64:
                raise ValueError("Falta 'datos_base64' en la petición")
            bytes_a_imprimir = base64.b64decode(datos_base64)

            if tipo == "usb":
                nombre_cola = datos.get("nombre")
                if not nombre_cola:
                    raise ValueError("Falta 'nombre' (cola de impresión) en la petición")
                self._imprimir_usb(nombre_cola, bytes_a_imprimir)
            else:
                ip = datos.get("ip")
                puerto = int(datos.get("puerto", 9100))
                if not ip:
                    raise ValueError("Falta 'ip' en la petición")
                with socket.create_connection((ip, puerto), timeout=5) as s:
                    s.sendall(bytes_a_imprimir)

            self.send_response(200)
            self._cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"ok": true}')

        except Exception as e:
            self.send_response(500)
            self._cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            mensaje = json.dumps({"ok": False, "error": str(e)})
            self.wfile.write(mensaje.encode("utf-8"))

    def log_message(self, format, *args):
        # Silenciar el log por defecto de BaseHTTPRequestHandler (va a stderr
        # en cada request); el LaunchAgent/servicio ya redirige stdout/stderr
        # a un archivo si se necesita depurar.
        pass


if __name__ == "__main__":
    servidor = ThreadingHTTPServer(("127.0.0.1", PUERTO_AGENTE), ImprimirHandler)

    if not (os.path.exists(RUTA_CERT) and os.path.exists(RUTA_KEY)):
        raise SystemExit(
            f"Faltan cert.pem / key.pem en {CARPETA_AGENTE}.\n"
            f"Generar con: openssl req -x509 -newkey rsa:2048 -nodes "
            f"-keyout key.pem -out cert.pem -days 3650 -subj \"/CN=127.0.0.1\" "
            f"-addext \"subjectAltName=IP:127.0.0.1,DNS:localhost\""
        )

    contexto_ssl = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    contexto_ssl.load_cert_chain(certfile=RUTA_CERT, keyfile=RUTA_KEY)
    servidor.socket = contexto_ssl.wrap_socket(servidor.socket, server_side=True)

    print(f"Agente de impresión de MiniMarket escuchando en https://127.0.0.1:{PUERTO_AGENTE}")
    print("La primera vez, abra esa URL directo en el navegador y acepte el aviso de certificado no confiable.")
    servidor.serve_forever()
