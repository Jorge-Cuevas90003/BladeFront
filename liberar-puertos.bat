@echo off
rem UTF-8: script para detener procesos y servicios de sistema que ocupan los puertos 5000/5001.
chcp 65001 >nul
title Liberar Puertos 5000 y 5001 (ADMIN)
cd /d "%~dp0"

:: Solicitar permisos de Administrador automáticamente si no se tienen
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [i] Solicitando permisos de Administrador para detener nidmsrv.exe y lktsrv.exe...
    powershell -NoProfile -Command "Start-Process '%~f0' -ArgumentList '%*' -Verb RunAs"
    exit /b
)

echo ===========================================================
echo   LIBERANDO PUERTOS 5000 (TCP) Y 5001 (UDP) DE SISTEMA
echo ===========================================================
echo.
echo [+] Deteniendo servicio National Instruments (nidmsrv / lktsrv)...
net stop nidmsrv >nul 2>&1
net stop lktsrv >nul 2>&1
taskkill /F /IM nidmsrv.exe /T >nul 2>&1
taskkill /F /IM lktsrv.exe /T >nul 2>&1

echo [+] Cerrando cualquier otro proceso en los puertos 5000 y 5001...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1
powershell -NoProfile -Command "Get-NetUDPEndpoint -LocalPort 5001 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1

echo [+] Habilitando reglas de Firewall de Windows...
powershell -NoProfile -Command "New-NetFirewallRule -DisplayName 'BladeFront TCP 5000' -Direction Inbound -LocalPort 5000 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue" >nul 2>&1
powershell -NoProfile -Command "New-NetFirewallRule -DisplayName 'BladeFront UDP 5001' -Direction Inbound -LocalPort 5001 -Protocol UDP -Action Allow -ErrorAction SilentlyContinue" >nul 2>&1

echo.
echo [✓] Puertos 5000 y 5001 liberados con éxito.
echo     Ya puedes iniciar el juego normalmente.
echo ===========================================================
pause
