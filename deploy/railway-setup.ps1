# One-time Railway setup for Team Office Hub (B3.2)
# Prereq: railway login  (cmd: railway login)
param(
    [string]$ProjectName = 'office-hub',
    [string]$HubToken = '',
    [string]$GitHubPagesOrigin = 'https://tanitsu-reberu.github.io'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent

if (-not $HubToken) {
    $envFile = Join-Path $root '.env'
    if (Test-Path $envFile) {
        $line = Get-Content $envFile | Where-Object { $_ -match '^HUB_TOKEN=' } | Select-Object -First 1
        if ($line) { $HubToken = ($line -replace '^HUB_TOKEN=', '').Trim() }
    }
}
if (-not $HubToken) {
    $HubToken = [guid]::NewGuid().ToString('N')
    Write-Host "Generated HUB_TOKEN (save it): $HubToken"
}

$allowed = "$GitHubPagesOrigin,http://127.0.0.1:8765,http://localhost:8765"

Write-Host "`n=== Railway CLI setup ===" -ForegroundColor Cyan
Write-Host "Run once if needed: railway login`n"

Set-Location $root

if (-not (Get-Command railway -ErrorAction SilentlyContinue)) {
    Write-Host "Install CLI: npm install -g @railway/cli" -ForegroundColor Yellow
    exit 1
}

$who = cmd /c "railway whoami 2>&1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Not logged in. Run: railway login" -ForegroundColor Yellow
    exit 1
}

Write-Host "Logged in as: $who"

if (-not (Test-Path (Join-Path $root 'railway.toml'))) {
    Write-Host "railway.toml missing in repo root" -ForegroundColor Red
    exit 1
}

Write-Host "Linking project (create new if prompted): $ProjectName"
cmd /c "railway link -p $ProjectName 2>&1"

Write-Host "Setting service variables..."
cmd /c "railway variables set DATA_DIR=/data HUB_TOKEN=$HubToken ALLOWED_ORIGINS=$allowed CURSOR_API_LOCALHOST_ONLY=1 2>&1"

Write-Host @"

=== Manual steps in Railway Dashboard ===
1. Service -> Settings -> Volumes -> Add Volume -> mount path: /data
2. Service -> Settings -> Networking -> Generate Domain (if none)
3. Copy public URL -> GitHub repo Settings -> Actions -> Variables:
   - HUB_API = https://YOUR-SERVICE.up.railway.app
   - HUB_BASE = /office-hub
   - Secret HUB_TOKEN = $HubToken
4. Re-run GitHub Actions workflow 'Deploy to GitHub Pages'

Deploy from CLI:
  railway up

Health check:
  curl https://YOUR-SERVICE.up.railway.app/api/health

"@