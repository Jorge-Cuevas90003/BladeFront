@echo off
rem UTF-8: el lanzador imprime acentos y un cuadro de resumen; sin esto salen rotos.
chcp 65001 >nul
title BladeFront - Captura la Bandera (v3)
cd /d "%~dp0"

:: Solicitar permisos de Administrador automáticamente si no se tienen
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [i] Solicitando permisos de Administrador para liberar puertos de sistema (5000/5001)...
    powershell -NoProfile -Command "Start-Process '%~f0' -ArgumentList '%*' -Verb RunAs"
    exit /b
)

echo ===========================================================
echo   Iniciando BladeFront / Captura la Bandera - PRFC v3 (ADMIN)
echo.
echo   [+] Liberando automáticamente los puertos 5000 (TCP) y 5001 (UDP)...
powershell -NoProfile -Command "Get-Process -Name lktsrv, nidmsrv -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue" >nul 2>&1
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1
powershell -NoProfile -Command "Get-NetUDPEndpoint -LocalPort 5001 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1

echo   [+] Servidor TCP + Bridge WebSocket + web en el puerto 8145.
echo   [+] Se abre solo el navegador. Ctrl+C aqui cierra todo.
echo.
echo   Para la version antigua (rejilla):  iniciar.bat --v1
echo   Todas las opciones:                 iniciar.bat --ayuda
echo ===========================================================
rem %* reenvia los argumentos (--v1, --puerto-tcp, --nombre, ...).
node iniciar.js %*
pause
