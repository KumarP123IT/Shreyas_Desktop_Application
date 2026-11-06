; ═══════════════════════════════════════════════════════════════════════════════
; Smart MSL Monitor – NSIS Installer
; Bundles: Node.js 20 portable, backend (+ node_modules), built frontend, NSSM
; Requires: NSIS 3.x  (no extra plug-ins needed)
; ═══════════════════════════════════════════════════════════════════════════════

Unicode True
SetCompressor /SOLID lzma

; ── Metadata ──────────────────────────────────────────────────────────────────
!define APP_NAME    "Smart MSL Monitor"
!define APP_SHORT   "SmartMSLMonitor"
!define APP_VERSION "1.0.0"
!define APP_URL     "http://localhost:4000"
!define APP_ICON    "assets\icon_pro.ico"
!define PUBLISHER   "Shreyas Industrial"

; ── Service settings ──────────────────────────────────────────────────────────
!define SVC_NAME    "SmartMSLMonitor"
!define SVC_DISPLAY "Smart MSL Monitor Service"
!define SVC_DESC    "Runs the Smart MSL Monitor backend. Sends WhatsApp and email notifications automatically."

; ── Registry key ──────────────────────────────────────────────────────────────
!define REG_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_SHORT}"

; ─────────────────────────────────────────────────────────────────────────────
; Headers
; ─────────────────────────────────────────────────────────────────────────────
!include "MUI2.nsh"
!include "LogicLib.nsh"

; ─────────────────────────────────────────────────────────────────────────────
; MUI Pages
; ─────────────────────────────────────────────────────────────────────────────
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "..\LICENSE.txt"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES

; Finish page – offer to open the app
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT   "Open Smart MSL Monitor in browser"
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchApp
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; ─────────────────────────────────────────────────────────────────────────────
; Installer attributes
; ─────────────────────────────────────────────────────────────────────────────
Name              "${APP_NAME} ${APP_VERSION}"
OutFile           "..\dist-installer\SmartMSLMonitor-Setup-${APP_VERSION}.exe"
InstallDir        "$PROGRAMFILES64\${APP_SHORT}"
InstallDirRegKey  HKLM "${REG_KEY}" "InstallLocation"
RequestExecutionLevel admin
ShowInstDetails   show
ShowUnInstDetails show
Icon              "${APP_ICON}"

; ─────────────────────────────────────────────────────────────────────────────
; Install Section
; ─────────────────────────────────────────────────────────────────────────────
Section "Main Application" SecMain
  SectionIn RO

  ; ── Stop existing service if upgrading ────────────────────────────────────
  ; Use a runtime variable so $INSTDIR is resolved at run time, not compile time
  StrCpy $0 "$INSTDIR\runtime\nssm.exe"
  nsExec::ExecToStack '"$0" stop ${SVC_NAME}'
  Pop $1   ; exit code (ignored – service may not exist yet)
  Sleep 1500

  ; ── Copy backend source + node_modules ────────────────────────────────────
  SetOutPath "$INSTDIR"
  File /r /x "*.log" "..\backend\*"

  ; ── Copy built frontend ────────────────────────────────────────────────────
  SetOutPath "$INSTDIR\frontend\dist"
  File /r "..\frontend\dist\*"

  ; ── Copy bundled Node.js runtime ──────────────────────────────────────────
  SetOutPath "$INSTDIR\runtime\node"
  File /r "runtimes\node\*"

  ; ── Copy NSSM service manager ─────────────────────────────────────────────
  SetOutPath "$INSTDIR\runtime"
  File "runtimes\nssm.exe"
  File /oname=nssm-x86.exe "runtimes\nssm-x86.exe"

  ; ── Copy application icon ─────────────────────────────────────────────────
  SetOutPath "$INSTDIR\assets"
  File "assets\icon_pro.ico"
  File "assets\icon_pro-512.png"

  ; ── Create data directories in %APPDATA% ──────────────────────────────────
  CreateDirectory "$APPDATA\${APP_SHORT}"
  CreateDirectory "$APPDATA\${APP_SHORT}\data"
  CreateDirectory "$APPDATA\${APP_SHORT}\uploads"
  CreateDirectory "$APPDATA\${APP_SHORT}\backups"
  CreateDirectory "$APPDATA\${APP_SHORT}\logs"

  ; ── Run first-time database setup ─────────────────────────────────────────
  DetailPrint "Setting up database (first run)..."
  SetOutPath "$INSTDIR"
  nsExec::ExecToLog \
    '"$INSTDIR\runtime\node\node.exe" \
     "scripts\firstrun.js"'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP \
      "Database setup failed (exit code $0).$\n$\nCheck logs and try re-running the installer."
    Abort
  ${EndIf}
  DetailPrint "Database ready."

  ; ── Install Windows Service via NSSM ──────────────────────────────────────
  DetailPrint "Installing Windows Service..."
  StrCpy $0 "$INSTDIR\runtime\nssm.exe"

  ; Remove any old service first (upgrade path)
  nsExec::ExecToLog '"$0" remove ${SVC_NAME} confirm'

  nsExec::ExecToLog '"$0" install ${SVC_NAME} "$INSTDIR\runtime\node\node.exe"'
  nsExec::ExecToLog '"$0" set ${SVC_NAME} AppDirectory     "$INSTDIR"'
  nsExec::ExecToLog '"$0" set ${SVC_NAME} AppParameters    "src\index.js"'
  nsExec::ExecToLog '"$0" set ${SVC_NAME} DisplayName      "${SVC_DISPLAY}"'
  nsExec::ExecToLog '"$0" set ${SVC_NAME} Description      "${SVC_DESC}"'
  nsExec::ExecToLog '"$0" set ${SVC_NAME} Start            SERVICE_AUTO_START'
  nsExec::ExecToLog '"$0" set ${SVC_NAME} AppEnvironmentExtra \
    "NODE_ENV=production" \
    "MSL_DATA_DIR=$APPDATA\${APP_SHORT}\data"'
  nsExec::ExecToLog '"$0" set ${SVC_NAME} AppStdout        "$APPDATA\${APP_SHORT}\logs\service.log"'
  nsExec::ExecToLog '"$0" set ${SVC_NAME} AppStderr        "$APPDATA\${APP_SHORT}\logs\service-error.log"'
  nsExec::ExecToLog '"$0" set ${SVC_NAME} AppRotateFiles   1'
  nsExec::ExecToLog '"$0" set ${SVC_NAME} AppRotateBytes   5242880'
  nsExec::ExecToLog '"$0" set ${SVC_NAME} AppExit          Default Restart'
  nsExec::ExecToLog '"$0" set ${SVC_NAME} AppRestartDelay  5000'

  ; ── Start the service ──────────────────────────────────────────────────────
  DetailPrint "Starting service..."
  nsExec::ExecToLog '"$0" start ${SVC_NAME}'
  Pop $1
  ${If} $1 != 0
    DetailPrint "Warning: service did not start immediately (may start after reboot)."
  ${Else}
    DetailPrint "Service started successfully."
  ${EndIf}

  ; ── Write browser-launcher VBS ────────────────────────────────────────────
  SetOutPath "$INSTDIR"
  FileOpen  $R0 "$INSTDIR\open-app.vbs" w
  FileWrite $R0 "Set sh = CreateObject($\"WScript.Shell$")$\r$\n"
  FileWrite $R0 "sh.Run $\"explorer http://localhost:4000$\", 1, False$\r$\n"
  FileClose $R0

  ; ── Desktop + Start Menu shortcuts ────────────────────────────────────────
  CreateShortcut \
    "$DESKTOP\${APP_NAME}.lnk" \
    "$INSTDIR\open-app.vbs" "" \
    "$INSTDIR\assets\icon_pro.ico" 0 SW_SHOWMINIMIZED

  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortcut \
    "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" \
    "$INSTDIR\open-app.vbs" "" \
    "$INSTDIR\assets\icon_pro.ico" 0 SW_SHOWMINIMIZED
  CreateShortcut \
    "$SMPROGRAMS\${APP_NAME}\Uninstall ${APP_NAME}.lnk" \
    "$INSTDIR\Uninstall.exe"

  ; ── Registry (Add / Remove Programs) ──────────────────────────────────────
  WriteRegStr   HKLM "${REG_KEY}" "DisplayName"     "${APP_NAME}"
  WriteRegStr   HKLM "${REG_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr   HKLM "${REG_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr   HKLM "${REG_KEY}" "Publisher"       "${PUBLISHER}"
  WriteRegStr   HKLM "${REG_KEY}" "DisplayVersion"  "${APP_VERSION}"
  WriteRegStr   HKLM "${REG_KEY}" "DisplayIcon"     "$INSTDIR\assets\icon_pro.ico"
  WriteRegDWORD HKLM "${REG_KEY}" "NoModify"        1
  WriteRegDWORD HKLM "${REG_KEY}" "NoRepair"        1

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  DetailPrint "Installation complete."
SectionEnd

; ─────────────────────────────────────────────────────────────────────────────
; Uninstall Section
; ─────────────────────────────────────────────────────────────────────────────
Section "Uninstall"
  ; Stop and remove the service
  StrCpy $0 "$INSTDIR\runtime\nssm.exe"
  nsExec::ExecToLog '"$0" stop    ${SVC_NAME}'
  Sleep 2000
  nsExec::ExecToLog '"$0" remove  ${SVC_NAME} confirm'

  ; Ask whether to keep user data
  MessageBox MB_YESNO \
    "Delete all app data (database, uploads, backups)?$\n$\nChoose No to keep your data." \
    IDYES wipeData IDNO keepData
  wipeData:
    RMDir /r "$APPDATA\${APP_SHORT}"
  keepData:

  ; Remove app files
  RMDir /r "$INSTDIR"

  ; Remove shortcuts
  Delete "$DESKTOP\${APP_NAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APP_NAME}"

  ; Remove registry
  DeleteRegKey HKLM "${REG_KEY}"
SectionEnd

; ─────────────────────────────────────────────────────────────────────────────
; Helper function – open browser on finish page
; ─────────────────────────────────────────────────────────────────────────────
Function LaunchApp
  ExecShell "open" "${APP_URL}"
FunctionEnd
