# Stop Team Office Hub (free port 8765)
$port = 8765
$conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
if (-not $conns) {
    Write-Host "Server not running (port $port is free)."
    exit 0
}
$conns | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1
Write-Host "OK: server stopped. Close the office window to free GPU."