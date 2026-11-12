Dim sh, http, i
Set sh   = CreateObject("WScript.Shell")
Set http = CreateObject("MSXML2.XMLHTTP")

' Poll localhost:4000 up to 60 seconds before opening the browser
For i = 1 To 60
  On Error Resume Next
  http.open "GET", "http://localhost:4000", False
  http.send
  On Error GoTo 0
  If http.status > 0 Then Exit For
  WScript.Sleep 1000
Next

sh.Run "explorer http://localhost:4000", 1, False
