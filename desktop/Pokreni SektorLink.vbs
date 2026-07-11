Set objShell = CreateObject("WScript.Shell")
strPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
objShell.CurrentDirectory = strPath
objShell.Run """" & strPath & "\node_modules\electron\dist\electron.exe"" """ & strPath & """", 0, False
