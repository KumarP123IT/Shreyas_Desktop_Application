; ═══════════════════════════════════════════════════════════════════════════════
; Smart MSL Monitor – NSIS Installer
; Bundles: Node.js (portable), pre-built frontend + backend, NSSM service manager
; Requires NSIS 3.x with the following plug-ins:
;   nsProcess, Inetc (for Node download), AccessControl
; ═══════════════════════════════════════════════════════════════════════════════

Unicode True
SetCompressor /SOLID lzma

; ── Metadata ──────────────────────────────────────────────────────────────────
!define APP_NAME      "Smart MSL Monitor"
!define APP_SHORT     "SmartMSLMonitor"
!define APP_VERSION   "1.0.0"
!define APP_URL       "http://localhost:4000"
!define APP_ICON      "assets\icon_pro.ico"
!define PUBLISHER     "Shreyas Industrial"

; ── Service settings ──────────────────────────────────────────────────────────
!define SVC_NAME   "SmartMSLMonitor"
!define SVC_DISPLAY "Smart MSL Monitor Service"
!define SVC_DESC   "Runs the Smart MSL Monitor backend. Sends WhatsApp and email notifications automatically."

; ── Install paths ─────────────────────────────────────────────────────────────
!define INSTDIR_DEFAULT "$PROGRAMFILES64\${APP_SHORT}"
!define DATA_DIR        "$APPDATA\${APP_SHORT}"
!define NODE_DIR        "$INSTDIR\runtime\node"
!define NSSM_PATH       "$INSTDIR\runtime\nssm.exe"

; ── Registry key ──────────────────────────────────────────────────────────────
!define REG_UNINSTALL "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_SHORT}"

; ─────────────────────────────────────────────────────────────────────────────
; Compiler headers
; ─────────────────────────────────────────────────────────────────────────────
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"

; ─────────────────────────────────────────────────────────────────────────────
; MUI Pages
; ─────────────────────────────────────────────────────────────────────────────
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
InstallDir        "${INSTDIR_DEFAULT}"
InstallDirRegKey  HKLM "${REG_UNINSTALL}" "InstallLocation"
RequestExecutionLevel admin
ShowInstDetails   show
ShowUnInstDetails show

Icon "${APP_ICON}"

; ─────────────────────────────────────────────────────────────────────────────
; Install Sections
; ─────────────────────────────────────────────────────────────────────────────

Section "Main Application" SecMain
  SectionIn RO   ; required

  SetOutPath "$INSTDIR"

  ; ── Stop any running instance ───────────────────────────────────────────────
  nsExec::ExecToStack '"$NSSM_PATH" stop ${SVC_NAME}'
  Pop $0
  Sleep 1500

  ; ── Copy application files ──────────────────────────────────────────────────
  File /r "..\backend\*"
  File /r /x "node_modules" "..\frontend\dist"

  ; The pre-built frontend dist goes under $INSTDIR\frontend\dist
  SetOutPath "$INSTDIR\frontend"
  File /r "..\frontend\dist"

  ; ── Copy bundled runtimes ────────────────────────────────────────────────────
  SetOutPath "$INSTDIR\runtime\node"
  File /r "runtimes\node\*"

  SetOutPath "$INSTDIR\runtime"
  File "runtimes\nssm.exe"
  File "runtimes\nssm-x86.exe"

  ; ── Create data directory ────────────────────────────────────────────────────
  CreateDirectory "${DATA_DIR}"
  CreateDirectory "${DATA_DIR}\data"
  CreateDirectory "${DATA_DIR}\uploads"
  CreateDirectory "${DATA_DIR}\backups"
  CreateDirectory "${DATA_DIR}\logs"

  ; ── Install node_modules (run npm ci inside installer) ──────────────────────
  ; We ship a pre-built node_modules snapshot in the package so this is fast
  SetOutPath "$INSTDIR"
  File /r "node_modules_snapshot\*"

  ; ── Run first-run setup ──────────────────────────────────────────────────────
  DetailPrint "Initialising database…"
  nsExec::ExecToLog '"${NODE_DIR}\node.exe" scripts\firstrun.js'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "Database setup failed. Please check the log and try again."
    Abort
  ${EndIf}

  ; ── Install Windows Service via NSSM ─────────────────────────────────────────
  DetailPrint "Installing Windows Service…"
  nsExec::ExecToLog '"$NSSM_PATH" install ${SVC_NAME} "${NODE_DIR}\node.exe"'
  Pop $0
  nsExec::ExecToLog '"$NSSM_PATH" set ${SVC_NAME} AppDirectory "$INSTDIR"'
  nsExec::ExecToLog '"$NSSM_PATH" set ${SVC_NAME} AppParameters "src\index.js"'
  nsExec::ExecToLog '"$NSSM_PATH" set ${SVC_NAME} DisplayName "${SVC_DISPLAY}"'
  nsExec::ExecToLog '"$NSSM_PATH" set ${SVC_NAME} Description "${SVC_DESC}"'
  nsExec::ExecToLog '"$NSSM_PATH" set ${SVC_NAME} Start SERVICE_AUTO_START'
  nsExec::ExecToLog '"$NSSM_PATH" set ${SVC_NAME} AppEnvironmentExtra "NODE_ENV=production" "MSL_DATA_DIR=${DATA_DIR}\data"'
  nsExec::ExecToLog '"$NSSM_PATH" set ${SVC_NAME} AppStdout "${DATA_DIR}\logs\service.log"'
  nsExec::ExecToLog '"$NSSM_PATH" set ${SVC_NAME} AppStderr "${DATA_DIR}\logs\service-error.log"'
  nsExec::ExecToLog '"$NSSM_PATH" set ${SVC_NAME} AppRotateFiles 1'
  nsExec::ExecToLog '"$NSSM_PATH" set ${SVC_NAME} AppRotateBytes 5242880'
  ; Restart service on failure (after 5s, then 30s)
  nsExec::ExecToLog '"$NSSM_PATH" set ${SVC_NAME} AppExit Default Restart'
  nsExec::ExecToLog '"$NSSM_PATH" set ${SVC_NAME} AppRestartDelay 5000'

  ; ── Start the service ────────────────────────────────────────────────────────
  DetailPrint "Starting service…"
  nsExec::ExecToLog '"$NSSM_PATH" start ${SVC_NAME}'
  Pop $0

  ; ── Copy icon assets ────────────────────────────────────────────────────────
  SetOutPath "$INSTDIR\assets"
  File "assets\icon_pro.ico"
  File "assets\icon_pro-512.png"

  ; ── Create desktop shortcut (opens browser to the app) ───────────────────────
  ; Use a small VBS launcher so it opens the browser cleanly
  SetOutPath "$INSTDIR"
  FileOpen $0 "$INSTDIR\open-app.vbs" w
  FileWrite $0 "Set sh = CreateObject($\"WScript.Shell$")$\r$\n"
  FileWrite $0 "sh.Run $\"explorer http://localhost:4000$\", 1, False$\r$\n"
  FileClose $0
  CreateShortcut "$DESKTOP\${APP_NAME}.lnk"   "$INSTDIR\open-app.vbs" "" "$INSTDIR\assets\icon_pro.ico" 0 SW_SHOWMINIMIZED
  CreateShortcut "$SMPROGRAMS\${APP_NAME}.lnk" "$INSTDIR\open-app.vbs" "" "$INSTDIR\assets\icon_pro.ico" 0 SW_SHOWMINIMIZED

  ; ── Write registry for Add/Remove Programs ───────────────────────────────────
  WriteRegStr   HKLM "${REG_UNINSTALL}" "DisplayName"      "${APP_NAME}"
  WriteRegStr   HKLM "${REG_UNINSTALL}" "UninstallString"  '"$INSTDIR\Uninstall.exe"'
  WriteRegStr   HKLM "${REG_UNINSTALL}" "InstallLocation"  "$INSTDIR"
  WriteRegStr   HKLM "${REG_UNINSTALL}" "Publisher"        "${PUBLISHER}"
  WriteRegStr   HKLM "${REG_UNINSTALL}" "DisplayVersion"   "${APP_VERSION}"
  WriteRegDWORD HKLM "${REG_UNINSTALL}" "NoModify"         1
  WriteRegDWORD HKLM "${REG_UNINSTALL}" "NoRepair"         1
  WriteRegStr   HKLM "${REG_UNINSTALL}" "URLInfoAbout"     "https://github.com/shreyas-industrial/smart-msl-monitor"

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  DetailPrint "Installation complete."
SectionEnd

; ─────────────────────────────────────────────────────────────────────────────
; Uninstall Section
; ─────────────────────────────────────────────────────────────────────────────

Section "Uninstall"
  ; ── Stop and remove service ──────────────────────────────────────────────────
  nsExec::ExecToLog '"${NSSM_PATH}" stop ${SVC_NAME}'
  Sleep 2000
  nsExec::ExecToLog '"${NSSM_PATH}" remove ${SVC_NAME} confirm'

  ; ── Remove application files ─────────────────────────────────────────────────
  ; Keep DATA_DIR (user data) unless the user explicitly chooses to remove it
  MessageBox MB_YESNO "Do you want to delete all your data (database, uploads, backups)?$\n$\nClick No to keep your data." IDYES deleteData IDNO keepData
  deleteData:
    RMDir /r "${DATA_DIR}"
  keepData:

  RMDir /r "$INSTDIR"

  ; ── Remove shortcuts ─────────────────────────────────────────────────────────
  Delete "$DESKTOP\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}.lnk"

  ; ── Remove registry keys ─────────────────────────────────────────────────────
  DeleteRegKey HKLM "${REG_UNINSTALL}"

  DetailPrint "Uninstall complete."
SectionEnd

; ─────────────────────────────────────────────────────────────────────────────
; Finish page – open app in browser
; ─────────────────────────────────────────────────────────────────────────────

Function LaunchApp
  ExecShell "open" "${APP_URL}"
FunctionEnd

!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Open Smart MSL Monitor in browser"
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchApp
