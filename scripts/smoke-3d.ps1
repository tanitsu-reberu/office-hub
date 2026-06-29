# A3/G5 — start server, run 3D WebGL/FPS smoke, stop server
param(
    [string]$BaseUrl = 'http://127.0.0.1:8765',
    [int]$Port = 8765
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..

function Test-ServerUp {
    try {
        $r = Invoke-WebRequest -Uri "$BaseUrl/api/health" -UseBasicParsing -TimeoutSec 2
        return $r.StatusCode -eq 200
    } catch { return $false }
}

$startedServer = $false
$serverJob = $null

if (-not (Test-ServerUp)) {
    Write-Host "Starting uvicorn on port $Port..."
    $serverJob = Start-Job -ScriptBlock {
        param($root, $port)
        Set-Location $root
        & py -3 -m uvicorn server:app --host 127.0.0.1 --port $port 2>&1
    } -ArgumentList (Get-Location).Path, $Port
    $startedServer = $true
    $deadline = (Get-Date).AddSeconds(25)
    while ((Get-Date) -lt $deadline) {
        if (Test-ServerUp) { break }
        Start-Sleep -Milliseconds 400
    }
    if (-not (Test-ServerUp)) {
        if ($serverJob) { Stop-Job $serverJob; Remove-Job $serverJob }
        throw "Server did not start on $BaseUrl"
    }
}

try {
    $env:SMOKE_BASE_URL = $BaseUrl
    & node scripts\smoke-3d.mjs $BaseUrl
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    if ($startedServer -and $serverJob) {
        Stop-Job $serverJob -ErrorAction SilentlyContinue
        Remove-Job $serverJob -Force -ErrorAction SilentlyContinue
    }
}