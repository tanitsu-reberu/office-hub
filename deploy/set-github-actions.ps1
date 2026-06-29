# Configure GitHub Actions for cloud Pages (B3.4)
# Usage: powershell -ExecutionPolicy Bypass -File deploy\set-github-actions.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
py -3 (Join-Path $PSScriptRoot 'set_github_actions.py')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Done. Trigger Pages: Actions -> Deploy to GitHub Pages -> Run workflow" -ForegroundColor Green