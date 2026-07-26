@echo off
rem UTF-8: el lanzador imprime acentos y un cuadro de resumen; sin esto salen rotos.
chcp 65001 >nul
title BladeFront - Captura la Bandera (v3)
cd /d "%~dp0"
echo ===========================================================
echo   Iniciando BladeFront / Captura la Bandera - PRFC v3
echo.
echo   Servidor TCP + Bridge WebSocket + web en el puerto 8145.
echo   Se abre solo el navegador. Ctrl+C aqui cierra todo.
echo.
echo   Para la version antigua (rejilla):  iniciar.bat --v1
echo   Todas las opciones:                 iniciar.bat --ayuda
echo ===========================================================
rem %* reenvia los argumentos (--v1, --puerto-tcp, --nombre, ...).
node iniciar.js %*
pause
