# TrustLedger — Tear down Drunix Network (PowerShell)
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DrunixNetworkDir = Join-Path $ScriptDir "..\drunix\drunix-network\test-network"

Write-Host "Tearing down Drunix network..." -ForegroundColor Yellow

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Warning "Docker is not detected in your environment."
    exit 0
}

if (Test-Path $DrunixNetworkDir) {
    Push-Location $DrunixNetworkDir
    try {
        bash ./network.sh down
    } finally {
        Pop-Location
    }
}
Write-Host "Drunix network cleaned up." -ForegroundColor Green
