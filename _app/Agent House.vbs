' Runs Agent House with no console window, so it can stay on all the time.
' With /background (any argument does) it only starts the server (that's how Windows runs it at logon).
' Without it, it also opens the app in its own window. The desktop icon does that.
Const URL = "http://127.0.0.1:3737/"
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

Function IsUp()
  On Error Resume Next
  Set request = CreateObject("MSXML2.ServerXMLHTTP")
  request.setTimeouts 1000, 1000, 1000, 1000
  request.open "GET", URL & "api/house", False
  request.send
  IsUp = (Err.Number = 0 And request.status = 200)
  On Error GoTo 0
End Function

If Not IsUp() Then shell.Run "cmd /c npm run serve > data\server.log 2>&1", 0, False

If WScript.Arguments.Count = 0 Then
  For i = 1 To 60
    If IsUp() Then Exit For
    WScript.Sleep 1000
  Next
  On Error Resume Next
  shell.Run "chrome.exe --app=" & URL, 1, False
  If Err.Number <> 0 Then
    Err.Clear
    shell.Run URL, 1, False
  End If
End If
