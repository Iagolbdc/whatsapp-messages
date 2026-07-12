@echo off
title Disparador WhatsApp

cd /d "%~dp0"

echo ===============================
echo Iniciando disparador...
echo ===============================
echo.

npm run dev

echo.
echo ===============================
echo Processo encerrado.
echo ===============================
pause