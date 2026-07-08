@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title SektorLink server

echo ============================================
echo   SektorLink - priprema i pokretanje servera
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [GRESKA] Node.js nije instaliran na ovom racunaru.
  echo.
  echo 1. Idi na https://nodejs.org
  echo 2. Preuzmi i instaliraj LTS verziju ^(Next-Next-Finish^)
  echo 3. Ponovo pokreni ovaj fajl ^(Pokreni.bat^)
  echo.
  start https://nodejs.org
  pause
  exit /b 1
)

if not exist "config.json" (
  echo Prvi put se pokrece - pravim config.json...
  copy /y "config.example.json" "config.json" >nul
  echo.
  echo NAPOMENA: Pristupni kod je za sada podrazumevani ^("PROMENI_ME"^).
  echo Otvori config.json u Notepad-u i promeni "accessCode" u svoju sifru
  echo kad budes imao/imala vremena, pa restartuj server ^(Ctrl+C, pa ponovo
  echo pokreni ovaj fajl^).
  echo.
  timeout /t 5 >nul
)

if not exist "node_modules" (
  echo Instaliram potrebne pakete ^(samo prvi put, moze potrajati^)...
  call npm install
  if errorlevel 1 (
    echo.
    echo [GRESKA] npm install nije uspeo. Proveri internet konekciju i probaj ponovo.
    pause
    exit /b 1
  )
)

echo.
echo Pokrecem server...
echo.
call npm start

pause
