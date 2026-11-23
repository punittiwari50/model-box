# Hermetic Deployment & Handover Script
# Conforms to STD-BLD-006

$ErrorActionPreference = "Stop"

# Anchor execution to project root
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "../../..")
Set-Location $ProjectRoot

Write-Host "=========================================================="
Write-Host " Deploying Gemini Model Connector Stack in Docker        "
Write-Host " Working Directory: $ProjectRoot                          "
Write-Host " Config Root: config/docker/                              "
Write-Host "=========================================================="

docker compose -f config/docker/docker-compose.yml up -d gemini-model-connector

# Wait for readiness
Write-Host "Waiting for service health probe..."
$healthy = $false
for ($i = 0; $i -lt 15; $i++) {
    try {
        $resp = Invoke-RestMethod -Uri "http://127.0.0.1:8090/api/v1/health" -Method Get -TimeoutSec 2
        if ($resp.status -eq "HEALTHY") {
            $healthy = $true
            break
        }
    } catch {
        Start-Sleep -Seconds 1
    }
}

if ($healthy) {
    Write-Host "Service is healthy and ready!"
    Write-Host "Dashboard: http://127.0.0.1:8090/"
    Write-Host "Health:    http://127.0.0.1:8090/api/v1/health"
} else {
    Write-Error "Service failed health probe check within timeout period."
}
