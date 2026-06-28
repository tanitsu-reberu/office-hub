# Team Office launcher: server + app window (Edge/Chrome --app=)
param(
    [ValidateSet('medium', 'low', 'high', 'eco2d')]
    [string]$Gfx = 'low'
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$port = 8765
$baseUrl = "http://127.0.0.1:$port"

if ($Gfx -eq 'eco2d') {
    $query = '?app=1&eco=1'
} else {
    $query = "?app=1&gfx=$Gfx"
}
$url = "$baseUrl/$query"

function Ensure-HubToken {
    $envFile = Join-Path $PSScriptRoot '.env'
    $token = $null
    if (Test-Path $envFile) {
        Get-Content $envFile | ForEach-Object {
            if ($_ -match '^HUB_TOKEN=(.+)$') { $token = $matches[1].Trim() }
        }
    }
    if (-not $token) {
        $token = [guid]::NewGuid().ToString('N')
        $lines = @()
        if (Test-Path $envFile) {
            $lines = Get-Content $envFile | Where-Object { $_ -notmatch '^HUB_TOKEN=' }
        }
        $lines += "HUB_TOKEN=$token"
        Set-Content -Path $envFile -Value $lines -Encoding UTF8
        Write-Host "Generated HUB_TOKEN in .env (required for Cursor tools / E4)"
    }
}

function Test-ServerUp {
    try {
        $r = Invoke-WebRequest -Uri "$baseUrl/api/health" -UseBasicParsing -TimeoutSec 2
        return $r.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Start-OfficeServer {
    if (Test-ServerUp) {
        Write-Host "Server already running on port $port"
        return
    }
    Write-Host "Starting server..."
    Start-Process -FilePath 'py' `
        -ArgumentList '-m', 'uvicorn', 'server:app', '--host', '127.0.0.1', '--port', "$port" `
        -WorkingDirectory $PSScriptRoot `
        -WindowStyle Minimized
    $deadline = (Get-Date).AddSeconds(12)
    while ((Get-Date) -lt $deadline) {
        if (Test-ServerUp) {
            Write-Host "Server ready."
            return
        }
        Start-Sleep -Milliseconds 400
    }
    throw "Server did not respond in 12 sec. Try: py -m uvicorn server:app --port $port"
}

function Open-AppWindow {
    param([string]$TargetUrl)

    $edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
    if (-not (Test-Path $edge)) {
        $edge = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
    }
    $chrome = "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe"
    if (-not (Test-Path $chrome)) {
        $chrome = "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
    }

    if (Test-Path $edge) {
        Write-Host "Opening Edge app window..."
        Start-Process $edge -ArgumentList "--app=$TargetUrl", '--new-window'
        return
    }
    if (Test-Path $chrome) {
        Write-Host "Opening Chrome app window..."
        Start-Process $chrome -ArgumentList "--app=$TargetUrl", '--new-window'
        return
    }

    Write-Host "Edge/Chrome not found - opening default browser."
    Start-Process $TargetUrl
}

Ensure-HubToken
Start-OfficeServer
Open-AppWindow -TargetUrl $url

Write-Host ""
Write-Host "Team Office: $url"
Write-Host "Stop server: .\stop-office.ps1"
Write-Host "Premium 3D:    .\launch-office.ps1 -Gfx high"
Write-Host "Eco 2D mode:   .\launch-office.ps1 -Gfx eco2d"