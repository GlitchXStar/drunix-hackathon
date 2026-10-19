# TrustLedger — Bring up Drunix Network (PowerShell)
param (
    [string]$Channel = "trustledgerchannel",
    [string]$Database = "yugabyte"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DrunixNetworkDir = Join-Path $ScriptDir "..\drunix\drunix-network\test-network"

Write-Host "Checking prerequisites..." -ForegroundColor Cyan

# Check Docker availability
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Warning "Docker is not detected in your environment. Drunix containers require Docker or Podman."
    Write-Warning "Ensure Docker Desktop is running before launching the network."
    exit 1
}

if (-not (Test-Path $DrunixNetworkDir)) {
    Write-Error "Drunix test-network directory not found at $DrunixNetworkDir"
    exit 1
}

Write-Host "Starting Drunix network on channel '$Channel' with state database '$Database'..." -ForegroundColor Green
Push-Location $DrunixNetworkDir
try {
    bash ./network.sh up createChannel -c $Channel -s $Database
} finally {
    Pop-Location
}
