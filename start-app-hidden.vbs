' Smart MSL Monitor – Silent launcher for Task Scheduler / startup.
' Starts the backend server without showing a console window.
' This file is only used when NOT running as a Windows Service.
' The NSIS installer uses NSSM instead (better for service management).
Option Explicit
Dim fso, sh, dir
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
' 0 = hidden window, False = don't wait
sh.Run "cmd /c npm start --prefix backend", 0, False
