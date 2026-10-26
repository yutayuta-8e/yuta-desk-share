' yuta-desk launcher for the Startup folder.
' Logs every attempt to %APPDATA%\yuta-desk\launcher.log, starts Electron hidden (no console),
' and retries up to 3 times if the app exits within 20 seconds (early-logon flakiness).
Option Explicit
Dim sh, fso, root, exe, logPath, f, i, t0, rc
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
exe = root & "\node_modules\electron\dist\electron.exe"
logPath = sh.ExpandEnvironmentStrings("%APPDATA%") & "\yuta-desk\launcher.log"

Sub Log(msg)
  On Error Resume Next
  Set f = fso.OpenTextFile(logPath, 8, True)
  f.WriteLine Now & " " & msg
  f.Close
End Sub

Log "launcher start root=" & root
If Not fso.FileExists(exe) Then
  Log "electron.exe not found"
  WScript.Quit 1
End If
sh.CurrentDirectory = root
For i = 1 To 3
  Log "attempt " & i
  t0 = Timer
  rc = sh.Run("""" & exe & """ """ & root & """", 0, True)
  Log "exit code " & rc & " after " & Round(Timer - t0) & "s"
  If Timer - t0 > 20 Then Exit For
  WScript.Sleep 15000
Next
Log "launcher end"
