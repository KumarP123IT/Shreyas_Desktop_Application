@echo off
REM Smart MSL Monitor – Manual start script (dev / single-user use).
REM For production, the Windows Service (NSSM) handles this automatically.
REM Double-click to start the server and open the browser.
title Smart MSL Monitor
cd /d "%~dp0"

echo =========================================
echo   Smart MSL Monitor  ^|  Shreyas Industrial
echo =========================================
echo.

REM Check Node.js
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install from https://nodejs.org/
  pause
  exit /b 1
)

REM Build frontend if dist doesn't exist
if not exist "frontend\dist\index.html" (
  echo [1/2] Building frontend...
  call npm run build
  if errorlevel 1 (
    echo [ERROR] Frontend build failed.
    pause
    exit /b 1
  )
  echo.
)

REM Open browser after 3 seconds (non-blocking)
start /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:4000"

echo [2/2] Starting server...
echo       Access: http://localhost:4000
echo       Press Ctrl+C to stop.
echo.
call npm start

pause
