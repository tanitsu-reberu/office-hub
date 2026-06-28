# Create "Team Office" desktop shortcut (double-click = launch)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$desktop = [Environment]::GetFolderPath('Desktop')
$target = Join-Path $PSScriptRoot 'launch-office.bat'
$link = Join-Path $desktop 'Team Office.lnk'

if (-not (Test-Path $target)) {
    throw "Not found: $target"
}

$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($link)
$shortcut.TargetPath = $target
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.IconLocation = "$env:SystemRoot\System32\imageres.dll,109"
$shortcut.Description = 'Team Office - 3D hub launcher'
$shortcut.Save()

Write-Host "Done: $link"
Write-Host "Double-click to start server + app window."