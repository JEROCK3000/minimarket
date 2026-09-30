# MiniMarket (Solinteec) - Instalador del agente local de
# impresion termica (Windows). Genera el certificado autofirmado local y
# registra una tarea programada para que el agente arranque solo al iniciar
# sesion, sin ventana visible.
#
# Ejecutar desde PowerShell (no requiere ser administrador):
#   powershell -ExecutionPolicy Bypass -File instalar-windows.ps1

$ErrorActionPreference = "Stop"
$Carpeta = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Carpeta

# --- Certificado autofirmado ---
if (-not (Test-Path "$Carpeta\cert.pem") -or -not (Test-Path "$Carpeta\key.pem")) {
    Write-Host "Generando certificado autofirmado para 127.0.0.1..."
    $opensslCmd = Get-Command openssl -ErrorAction SilentlyContinue
    if (-not $opensslCmd) {
        Write-Error "No se encontró 'openssl' en el PATH. Instale Git for Windows (incluye openssl) o OpenSSL directamente."
        exit 1
    }
    # -config apunta a un openssl.cnf minimo propio de esta carpeta, en vez
    # de depender del que openssl.exe busca por defecto en Windows
    # ("C:\Program Files\Common Files\SSL\openssl.cnf", que muchas veces no
    # existe y corta la generacion del certificado a medias -- crea
    # key.pem pero nunca cert.pem). Asi no requiere permisos de
    # Administrador ni tocar rutas del sistema.
    & openssl req -x509 -newkey rsa:2048 -nodes `
        -config "$Carpeta\openssl-req.cnf" `
        -keyout "$Carpeta\key.pem" -out "$Carpeta\cert.pem" -days 3650 `
        -subj "/CN=127.0.0.1" `
        -addext "subjectAltName=IP:127.0.0.1,DNS:localhost"
} else {
    Write-Host "Ya existe un certificado, no se genera uno nuevo."
}

# --- Ubicar Python (preferir pythonw.exe, sin ventana de consola) ---
$pythonCmd = Get-Command pythonw -ErrorAction SilentlyContinue
if (-not $pythonCmd) { $pythonCmd = Get-Command python -ErrorAction SilentlyContinue }
if (-not $pythonCmd) {
    Write-Error "No se encontró Python en el PATH. Instálelo desde python.org (marcando 'Add to PATH')."
    exit 1
}
$RutaPython = $pythonCmd.Source
Write-Host "Usando Python en: $RutaPython"

# --- Tarea programada: arranca al iniciar sesión del usuario actual ---
# Agente INDEPENDIENTE de los de SmartianERP (puerto 9445), Restoware (9446)
# y Facturacion Electronica (tarea "FacturacionPrintAgent", 9447) -- este es
# propio de MiniMarket (minimarket.solinteec.com), puerto 9448, para no
# depender de los otros agentes ni chocar con ellos si ya estan instalados.
$NombreTarea = "print-agent-minimarket"
$Accion = New-ScheduledTaskAction -Execute $RutaPython -Argument "`"$Carpeta\print-agent.py`""
$Disparador = New-ScheduledTaskTrigger -AtLogOn
$Config = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)

Unregister-ScheduledTask -TaskName $NombreTarea -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask -TaskName $NombreTarea -Action $Accion -Trigger $Disparador -Settings $Config -Description "Agente local de impresion termica de MiniMarket (Solinteec)" | Out-Null

Write-Host "Tarea programada '$NombreTarea' instalada (arranca al iniciar sesión)."

# Arrancarlo ya, sin esperar al próximo login
Start-ScheduledTask -TaskName $NombreTarea
Start-Sleep -Seconds 2

$puertoActivo = Test-NetConnection -ComputerName 127.0.0.1 -Port 9448 -InformationLevel Quiet -WarningAction SilentlyContinue
Write-Host ""
if ($puertoActivo) {
    Write-Host "Listo -- el agente ya está corriendo y arrancará solo de ahora en adelante."
} else {
    Write-Host "El agente se instaló pero no respondió aún. Verifique con:"
    Write-Host "  Get-ScheduledTask -TaskName $NombreTarea"
}

Write-Host ""
Write-Host "IMPORTANTE (una sola vez): abra https://127.0.0.1:9448/estado directo"
Write-Host "en el navegador que usará para vender, y acepte el aviso de"
Write-Host "certificado no confiable (es normal, es propio de este agente, solo"
Write-Host "válido para esta computadora)."
