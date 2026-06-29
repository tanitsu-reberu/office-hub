# Team Office — LAN + Cloudflare quick tunnel (доступ из интернета)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$port = 8765
$cf = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cf) {
    Write-Host "cloudflared не найден. Установите: winget install Cloudflare.cloudflared" -ForegroundColor Yellow
    Write-Host "Или запустите start-office-lan.ps1 только для Wi-Fi." -ForegroundColor Yellow
    exit 1
}

Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1

Write-Host "Запуск сервера на 0.0.0.0:$port ..."
$server = Start-Process -FilePath "py" -ArgumentList "-m","uvicorn","server:app","--host","0.0.0.0","--port",$port -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 2

Write-Host ""
Write-Host "Запуск туннеля (URL появится ниже)..." -ForegroundColor Cyan
Write-Host "Остановка: Ctrl+C" -ForegroundColor Gray
try {
    cloudflared tunnel --url "http://127.0.0.1:$port"
} finally {
    Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
}