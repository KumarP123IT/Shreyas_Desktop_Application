@echo off
REM Creates a desktop shortcut that opens Smart MSL Monitor in the browser.
REM Run once after installation.
setlocal
set "URL=http://localhost:4000"
set "SHORTCUT=%USERPROFILE%\Desktop\Smart MSL Monitor.lnk"
set "TARGET=%ComSpec%"
set "ARGS=/c start """" "%URL%""

powershell -NoProfile -Command ^
  "$ws = New-Object -ComObject WScript.Shell;" ^
  "$sc = $ws.CreateShortcut('%SHORTCUT%');" ^
  "$sc.TargetPath = '%TARGET%';" ^
  "$sc.Arguments = '%ARGS%';" ^
  "$sc.Description = 'Open Smart MSL Monitor';" ^
  "$sc.Save();"

if exist "%SHORTCUT%" (
  echo Desktop shortcut created: %SHORTCUT%
) else (
  echo Failed to create shortcut.
)
endlocal
