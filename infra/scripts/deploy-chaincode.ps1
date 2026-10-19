# TrustLedger — Deploy Chaincode to Drunix (PowerShell)
param (
    [string]$Channel = "trustledgerchannel",
    [string]$Name = "trustledger",
    [string]$Version = "1.0",
    [string]$Sequence = "1"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DrunixNetworkDir = Join-Path $ScriptDir "..\drunix\drunix-network\test-network"
$ChaincodePath = Join-Path $ScriptDir "..\..\backend\chaincode\trustledger"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Warning "Docker is not detected in your environment. Cannot deploy chaincode to Docker network."
    exit 1
}

Write-Host "Deploying chaincode '$Name' v$Version to channel '$Channel'..." -ForegroundColor Cyan
Push-Location $DrunixNetworkDir
try {
    bash ./network.sh deployCC `
        -c $Channel `
        -ccn $Name `
        -ccp $ChaincodePath `
        -ccl go `
        -ccv $Version `
        -ccs $Sequence `
        -ccep "AND('PlatformOrgMSP.peer', OR('BankAOrgMSP.peer', 'NbfcOrgMSP.peer'))"
} finally {
    Pop-Location
}
