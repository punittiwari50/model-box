# Hermetic Container Build Script
# Conforms to STD-BLD-001 & STD-BLD-006

$ErrorActionPreference = "Stop"

# Anchor execution to project root
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "../../..")
Set-Location $ProjectRoot

Write-Host "=========================================================="
Write-Host " Building Hermetic Docker Containers (Node.js & Python)  "
Write-Host " Working Directory: $ProjectRoot                          "
Write-Host " Config Root: config/docker/                              "
Write-Host "=========================================================="

docker compose -f config/docker/docker-compose.yml build

Write-Host "=========================================================="
Write-Host " All container images built successfully! [OK]            "
Write-Host "=========================================================="
