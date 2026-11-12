; ═══════════════════════════════════════════════════════════════════════════════
; Smart MSL Monitor – NSIS Installer
; Bundles: Node.js 20 portable, backend + node_modules, built frontend, NSSM
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

; ── Service ───────────────────────────────────────────────────────────────────
!define SVC_NAME    "SmartMSLMonitor"
!define SVC_DISPLAY "Smart MSL Monitor Service"
!define SVC_DESC    "Runs the Smart MSL Monitor backend. Sends WhatsApp and email notifications automatically."

; ── Registry ──────────────────────────────────────────────────────────────────
!define REG_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_SHORT}"

; ─────────────────────────────────────────────────────────────────────────────
; Headers
; ─────────────────────────────────────────────────────────────────────────────
!include "MUI2.nsh"
!include "LogicLib.nsh"

; ─────────────────────────────────────────────────────────────────────────────
; MUI Pages
; ─────────────────────────────────────────────────────────────────────────────
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Open Smart MSL Monitor in browser"
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchApp

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "..\LICENSE.txt"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
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

  ; Store NSSM path in a variable (runtime value — cannot use !define with $INSTDIR)
  StrCpy $R0 "$INSTDIR\runtime\nssm.exe"

  ; Stop existing service if upgrading
  nsExec::ExecToStack '"$R0" stop ${SVC_NAME}'
  Pop $0
  Sleep 1500

  ; ── Copy backend (source + node_modules) ──────────────────────────────────
  SetOutPath "$INSTDIR"
  File /r /x "*.log" "..\backend\*"

  ; ── Copy built frontend SPA ────────────────────────────────────────────────
  SetOutPath "$INSTDIR\frontend\dist"
  File /r "..\frontend\dist\*"

  ; ── Copy bundled Node.js runtime ──────────────────────────────────────────
  SetOutPath "$INSTDIR\runtime\node"
  File /r "runtimes\node\*"

  ; ── Copy NSSM ─────────────────────────────────────────────────────────────
  SetOutPath "$INSTDIR\runtime"
  File "runtimes\nssm.exe"
  File /oname=nssm-x86.exe "runtimes\nssm-x86.exe"

  ; ── Copy icon ─────────────────────────────────────────────────────────────
  SetOutPath "$INSTDIR\assets"
  File "assets\icon_pro.ico"
  File "assets\icon_pro-512.png"

  ; ── Create data directories ────────────────────────────────────────────────
  ; All data lives INSIDE $INSTDIR so both the installer (logged-in user)
  ; and the Windows Service (LocalSystem) access the same paths.
  CreateDirectory "$INSTDIR\storage"
  CreateDirectory "$INSTDIR\storage\data"
  CreateDirectory "$INSTDIR\storage\uploads"
  CreateDirectory "$INSTDIR\storage\uploads\_temp"
  CreateDirectory "$INSTDIR\storage\backups"
  CreateDirectory "$INSTDIR\logs"

  ; ── First-run database setup ───────────────────────────────────────────────
  DetailPrint "Setting up database..."
  SetOutPath "$INSTDIR"
  ; Use the bundled node.exe explicitly — never rely on system PATH
  nsExec::ExecToLog '"$INSTDIR\runtime\node\node.exe" "$INSTDIR\scripts\firstrun.js"'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "Database setup failed (exit $0).$\nCheck logs and re-run the installer."
    Abort
  ${EndIf}
  DetailPrint "Database ready."

  ; Tell the client where the generated admin password lives (first install only)
  IfFileExists "$INSTDIR\storage\initial-admin-credentials.txt" credsExist credsDone
  Goto credsDone
  credsExist:
    MessageBox MB_OK "Initial admin credentials were generated.$\r$\n$\r$\nFile: $INSTDIR\storage\initial-admin-credentials.txt$\r$\n$\r$\nOpen Smart MSL Monitor, sign in with those credentials, and set a new password when prompted. The credentials file is deleted automatically after the password change (or you can delete it manually)."
  credsDone:

  ; ── Install Windows Service ────────────────────────────────────────────────
  DetailPrint "Installing Windows Service..."

  ; Remove old service first (clean upgrade)
  nsExec::ExecToLog '"$R0" remove ${SVC_NAME} confirm'

  nsExec::ExecToLog '"$R0" install ${SVC_NAME} "$INSTDIR\runtime\node\node.exe"'
  nsExec::ExecToLog '"$R0" set ${SVC_NAME} AppDirectory "$INSTDIR"'
  nsExec::ExecToLog '"$R0" set ${SVC_NAME} AppParameters "src\index.js"'
  nsExec::ExecToLog '"$R0" set ${SVC_NAME} DisplayName "${SVC_DISPLAY}"'
  nsExec::ExecToLog '"$R0" set ${SVC_NAME} Description "${SVC_DESC}"'
  nsExec::ExecToLog '"$R0" set ${SVC_NAME} Start SERVICE_AUTO_START'
  ; NODE_ENV=production only — no MSL_DATA_DIR so data always goes to $INSTDIR\storage\data
  nsExec::ExecToLog '"$R0" set ${SVC_NAME} AppEnvironmentExtra "NODE_ENV=production"'
  nsExec::ExecToLog '"$R0" set ${SVC_NAME} AppStdout "$INSTDIR\logs\service.log"'
  nsExec::ExecToLog '"$R0" set ${SVC_NAME} AppStderr "$INSTDIR\logs\service-error.log"'
  nsExec::ExecToLog '"$R0" set ${SVC_NAME} AppRotateFiles 1'
  nsExec::ExecToLog '"$R0" set ${SVC_NAME} AppRotateBytes 5242880'
  nsExec::ExecToLog '"$R0" set ${SVC_NAME} AppExit Default Restart'
  nsExec::ExecToLog '"$R0" set ${SVC_NAME} AppRestartDelay 5000'

  ; Start the service
  DetailPrint "Starting service..."
  nsExec::ExecToLog '"$R0" start ${SVC_NAME}'
  Pop $0
  ${If} $0 != 0
    DetailPrint "Note: service will start on next reboot."
  ${Else}
    DetailPrint "Service started — waiting for backend to initialise..."
    ; Give the Node.js process a few seconds to bind the port
    ; The VBS launcher will poll for up to 60s anyway — this is a head-start
    Sleep 4000
    DetailPrint "Service ready."
  ${EndIf}

  ; ── Copy browser-launcher VBS (bundled as static file) ───────────────────
  SetOutPath "$INSTDIR"
  File "open-app.vbs"

  ; ── Shortcuts ─────────────────────────────────────────────────────────────
  CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\open-app.vbs" "" "$INSTDIR\assets\icon_pro.ico" 0 SW_SHOWMINIMIZED

  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\open-app.vbs" "" "$INSTDIR\assets\icon_pro.ico" 0 SW_SHOWMINIMIZED
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\Uninstall.lnk" "$INSTDIR\Uninstall.exe"

  ; ── Add/Remove Programs registry ──────────────────────────────────────────
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
  StrCpy $R0 "$INSTDIR\runtime\nssm.exe"

  nsExec::ExecToLog '"$R0" stop ${SVC_NAME}'
  Sleep 2000
  nsExec::ExecToLog '"$R0" remove ${SVC_NAME} confirm'

  MessageBox MB_YESNO "Delete all app data (database, uploads, backups)?$\n$\nChoose No to keep your data." IDYES wipeData IDNO keepData
  wipeData:
    RMDir /r "$INSTDIR\storage"
    RMDir /r "$INSTDIR\logs"
  keepData:

  RMDir /r "$INSTDIR"
  Delete "$DESKTOP\${APP_NAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APP_NAME}"
  DeleteRegKey HKLM "${REG_KEY}"
SectionEnd

; ─────────────────────────────────────────────────────────────────────────────
; Finish page helper
; ─────────────────────────────────────────────────────────────────────────────
Function LaunchApp
  ExecShell "open" "$INSTDIR\open-app.vbs"
FunctionEnd
