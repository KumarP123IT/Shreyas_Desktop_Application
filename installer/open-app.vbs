Dim sh, http, i, ready, st
Set sh    = CreateObject("WScript.Shell")
Set http  = CreateObject("MSXML2.XMLHTTP")
ready     = False

' Poll 127.0.0.1:4000 up to 90 seconds (server binds loopback only).
' Reading http.status after a failed connection raises a VBScript error,
' so we guard with On Error Resume Next and read status into st only when
' no error occurred.
For i = 1 To 90
  st = 0
  On Error Resume Next
  http.open "GET", "http://127.0.0.1:4000/", False
  http.send
  If Err.Number = 0 Then st = http.status
  Err.Clear
  On Error GoTo 0
  If st > 0 Then ready = True : Exit For
  WScript.Sleep 1000
Next

If ready Then
  sh.Run "explorer http://localhost:4000", 1, False
Else
  MsgBox "Smart MSL Monitor did not start within 90 seconds." & vbCrLf & vbCrLf & _
    "Possible causes:" & vbCrLf & _
    "  - Service is still initialising on first run (try again in 30s)" & vbCrLf & _
    "  - Service failed to start (check Windows Services or logs at:" & vbCrLf & _
    "    " & sh.ExpandEnvironmentStrings("%PROGRAMFILES%") & "\SmartMSLMonitor\logs\service-error.log)" & vbCrLf & vbCrLf & _
    "You can also open Services (services.msc) and check SmartMSLMonitor.", _
    48, "Smart MSL Monitor"
End If
