# Team Office — LAN (доступ с телефона в Wi-Fi)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$port = 8765
Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1

$ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown" } |
  Select-Object -ExpandProperty IPAddress -Unique)

Write-Host ""
Write-Host "Team Office (LAN)" -ForegroundColor Cyan
Write-Host "  PC:      http://127.0.0.1:$port"
foreach ($ip in $ips) { Write-Host "  Phone:   http://${ip}:$port" -ForegroundColor Green }
$sceneDir = Join-Path $PSScriptRoot "scene"
if ((Test-Path (Join-Path $sceneDir "package.json")) -and (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  Write-Host "Building 3D scene (R3F)..." -ForegroundColor DarkGray
  Push-Location $sceneDir
  if (-not (Test-Path "node_modules")) { npm.cmd ci 2>$null; if ($LASTEXITCODE -ne 0) { npm.cmd install } }
  npm.cmd run build
  Pop-Location
}

Write-Host ""
Start-Process "http://127.0.0.1:$port"
py -m uvicorn server:app --host 0.0.0.0 --port $port