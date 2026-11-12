Dim sh, http, i, ready, maxWait
Set sh = CreateObject("WScript.Shell")
ready   = False
maxWait = 60   ' seconds to wait before giving up

' Try two HTTP objects — MSXML2.XMLHTTP fails silently on some Windows configs
Dim objNames(1)
objNames(0) = "MSXML2.XMLHTTP"
objNames(1) = "Microsoft.XMLHTTP"

For i = 1 To maxWait
  Dim j
  For j = 0 To 1
    On Error Resume Next
    Set http = CreateObject(objNames(j))
    If Err.Number = 0 Then
      http.open "GET", "http://localhost:4000/api/health", False
      http.setRequestHeader "Connection", "close"
      http.send
      If Err.Number = 0 Then
        If http.status >= 200 And http.status < 500 Then
          ready = True
        End If
      End If
      Err.Clear
    End If
    On Error GoTo 0
    If ready Then Exit For
  Next
  If ready Then Exit For
  WScript.Sleep 1000
Next

sh.Run "explorer http://localhost:4000", 1, False
