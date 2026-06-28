# Register Team Office Hub MCP server in Cursor
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$envFile = Join-Path $PSScriptRoot '.env'
if (-not (Test-Path $envFile)) {
    $token = [guid]::NewGuid().ToString('N')
    Set-Content -Path $envFile -Value "HUB_TOKEN=$token" -Encoding UTF8
    Write-Host "Created .env with new HUB_TOKEN"
}

$hubToken = $null
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^HUB_TOKEN=(.+)$') { $hubToken = $matches[1].Trim() }
}
if (-not $hubToken) {
    $hubToken = [guid]::NewGuid().ToString('N')
    Add-Content -Path $envFile -Value "HUB_TOKEN=$hubToken" -Encoding UTF8
    Write-Host "Added HUB_TOKEN to .env"
}

$mcpPath = Join-Path $env:USERPROFILE '.cursor\mcp.json'
$mcpDir = Split-Path $mcpPath -Parent
if (-not (Test-Path $mcpDir)) { New-Item -ItemType Directory -Path $mcpDir -Force | Out-Null }

$config = @{}
if (Test-Path $mcpPath) {
    $raw = Get-Content $mcpPath -Raw -Encoding UTF8
    if ($raw.Trim()) {
        $config = $raw | ConvertFrom-Json -AsHashtable
    }
}
if (-not $config.mcpServers) { $config.mcpServers = @{} }

$serverScript = Join-Path $PSScriptRoot 'mcp_server.py'
$config.mcpServers['office-hub'] = @{
    command = 'py'
    args    = @($serverScript)
    env     = @{
        HUB_URL   = 'http://127.0.0.1:8765'
        HUB_TOKEN = $hubToken
        HUB_AGENT = 'backend'
    }
}

($config | ConvertTo-Json -Depth 6) | Set-Content -Path $mcpPath -Encoding UTF8
Write-Host "Registered office-hub MCP in $mcpPath"
Write-Host "Restart Cursor to load MCP tools."