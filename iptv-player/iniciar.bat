@echo off
title IPTV Player
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js nao encontrado. Instale em https://nodejs.org (versao LTS) e rode de novo.
  echo.
  pause
  exit /b 1
)
start "" http://localhost:8080
node server.js
pause
