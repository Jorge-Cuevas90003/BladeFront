@echo off
title Liberar Puertos Oficiales (BladeFront)
:: Verificar si se ejecuta como Administrador
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Este script requiere permisos de Administrador para detener servicios de sistema.
    echo [!] Haz clic derecho sobre 'liberar-puertos.bat' y selecciona 'Ejecutar como Administrador'.
    echo.
    pause
    exit /b
)

echo ============================================================================
echo   LIBERANDO PUERTOS OFICIALES BLADEFRONT (TCP 5000 / UDP 5001)
echo ============================================================================
echo.

powershell -NoProfile -Command "Get-Process -Name lktsrv, nidmsrv -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
powershell -NoProfile -Command "Get-NetUDPEndpoint -LocalPort 5001 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"

echo [v] Proceso completado. Puertos 5000 (TCP) y 5001 (UDP) liberados.
echo [v] Ya puedes iniciar BladeFront normalmente.
echo.
pause
