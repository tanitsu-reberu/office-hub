# Team Office — локальный запуск (только этот ПК)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$port = 8765
Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1

Write-Host "Team Office: http://127.0.0.1:$port"
Write-Host "Для телефона в Wi-Fi: .\start-office-lan.ps1"
Write-Host "Для интернета:        .\start-office-tunnel.ps1"
Start-Process "http://127.0.0.1:$port"
py -m uvicorn server:app --host 127.0.0.1 --port $port