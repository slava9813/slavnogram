@echo off
chcp 65001 >nul
title Slavnogram FINAL

cd /d "%~dp0"

echo [1/4] Killing old processes...
taskkill /IM node.exe /F >nul 2>nul
taskkill /IM ngrok.exe /F >nul 2>nul

echo [2/4] Starting server...
start "Slavnogram Server" cmd /k "npm run start"

timeout /t 4 >nul

echo [3/4] Starting ngrok with permanent domain...
start "Slavnogram Tunnel" cmd /k "ngrok http --url=preplan-blazer-paycheck.ngrok-free.dev 4000"

echo.
echo =========================================
echo   ГОТОВО. ТВОЙ САЙТ:
echo   https://preplan-blazer-paycheck.ngrok-free.dev
echo =========================================
pause