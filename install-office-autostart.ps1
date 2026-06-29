# Add Team Office to Windows Startup (runs start-office.ps1 at login)
$ErrorActionPreference = "Stop"
$startup = [Environment]::GetFolderPath('Startup')
$target = Join-Path $PSScriptRoot 'start-office.ps1'
$link = Join-Path $startup 'Team Office.lnk'

$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($link)
$shortcut.TargetPath = 'powershell.exe'
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File `"$target`""
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.WindowStyle = 7
$shortcut.Description = 'Team Office Hub'
$shortcut.Save()

Write-Host "OK: автозапуск добавлен -> $link"
Write-Host "Убрать: удалите ярлык из папки Автозагрузка"