@echo off
chcp 65001 >nul
title Slavnogram Launcher

cd /d "%~dp0"

echo ==============================
echo   SLAVNOGRAM STARTING...
echo ==============================

echo.
echo [1/3] Killing old Node processes...
taskkill /IM node.exe /F >nul 2>nul

echo.
echo [2/3] Starting Slavnogram server...
start "Slavnogram Server" cmd /k "npm run start"

echo.
echo [3/3] Starting ngrok tunnel...
timeout /t 3 >nul
start "Slavnogram Ngrok" cmd /k "ngrok http 4000"

echo.
echo DONE.
echo Скопируй HTTPS ссылку из окна ngrok и вставь её в .env как PUBLIC_URL.
echo Потом перезапусти этот файл.
pause