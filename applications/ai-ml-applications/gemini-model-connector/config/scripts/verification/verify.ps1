# Hermetic In-Container Verification Script
# Conforms to STD-BLD-001 & STD-BLD-006

$ErrorActionPreference = "Stop"

# Anchor execution to project root
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "../../..")
Set-Location $ProjectRoot

Write-Host "=========================================================="
Write-Host " Running Hermetic Verification inside Docker Container    "
Write-Host " Working Directory: $ProjectRoot                          "
Write-Host " Config Root: config/docker/                              "
Write-Host "=========================================================="

# Ensure server container is up and healthy
Write-Host "[1/2] Building and starting Node.js Gemini Model Connector container..."
docker compose -f config/docker/docker-compose.yml up -d --build gemini-model-connector
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to start gemini-model-connector container."
    exit $LASTEXITCODE
}

# Run Python verification suite in dedicated verifier container
Write-Host "[2/2] Running Python verification suite inside gemini-python-verifier container..."
docker compose -f config/docker/docker-compose.yml run --rm --build gemini-python-verifier
if ($LASTEXITCODE -ne 0) {
    Write-Error "Python verification suite failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Host "=========================================================="
Write-Host " In-container verification completed successfully! [OK]   "
Write-Host "=========================================================="
