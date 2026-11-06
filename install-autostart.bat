@echo off
REM Smart MSL Monitor – Fallback autostart via Windows Task Scheduler.
REM
REM NOTE: The NSIS installer (.exe) already sets up a proper Windows Service
REM       via NSSM that starts before login. Only use this script if you're
REM       running without the installer (e.g. developer mode).
REM
REM Requires no admin rights (per-user task, runs at ONLOGON).
setlocal
cd /d "%~dp0"

echo.
echo Smart MSL Monitor – Autostart Registration
echo -------------------------------------------

schtasks /Create ^
  /TN "SmartMSLMonitor" ^
  /TR "wscript.exe \"%~dp0start-app-hidden.vbs\"" ^
  /SC ONLOGON ^
  /RL LIMITED ^
  /F

if errorlevel 1 (
  echo.
  echo [ERROR] Autostart registration failed.
  echo You may also import task-scheduler.xml via Task Scheduler manually.
  pause
  exit /b 1
)

echo.
echo [OK] Smart MSL Monitor will start automatically at every login.
echo.
echo To remove:  schtasks /Delete /TN "SmartMSLMonitor" /F
echo.
pause
