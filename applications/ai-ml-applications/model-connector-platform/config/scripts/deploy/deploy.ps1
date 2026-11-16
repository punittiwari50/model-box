<#
.SYNOPSIS
    Standardized deploy script for ModelConnector Enterprise Platform.
    Conforms to STD-BLD-006 (Workspace Directory Grid & Scripts).
#>
[CmdletBinding()]
param(
    [switch]$Down,
    [switch]$Logs
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path "$ScriptDir\..\..\.."

Set-Location $ProjectRoot

if ($Down) {
    Write-Host "[DEPLOY] Stopping and removing containers..." -ForegroundColor Yellow
    docker compose -f config/docker/docker-compose.yml down
    exit 0
}

if ($Logs) {
    docker compose -f config/docker/docker-compose.yml logs -f
    exit 0
}

Write-Host "[DEPLOY] Deploying ModelConnector dual-service via Docker Compose..." -ForegroundColor Green
docker compose -f config/docker/docker-compose.yml up -d --build

Write-Host "`n✓ Services deployed successfully!" -ForegroundColor Green
Write-Host "  Backend Service: http://localhost:8095/api/v1/health" -ForegroundColor Cyan
Write-Host "  Frontend Web UI: http://localhost:3005" -ForegroundColor Cyan
