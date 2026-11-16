# ==============================================================================
# Model Connector Platform - Docker Build & Run Pipeline (PowerShell)
# Invariants Enforced:
# 1. All node and python scripts execute STRICTLY inside Docker containers
# 2. Hermetic Docker image build/test/verify without host bind mount dependence
# 3. Dedicated separated Mobile and Desktop UI architectures
# 4. Ultra-lean production images (Frontend Nginx ~30MB, Backend Node)
# 5. Builder image automatically purged post spin-up
# ==============================================================================

$ErrorActionPreference = "Stop"

# Determine project root directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "../..")

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "  MODEL CONNECTOR PLATFORM - CONTAINER PIPELINE" -ForegroundColor Cyan
Write-Host "  Project Root: $ProjectRoot" -ForegroundColor Gray
Write-Host "================================================================================" -ForegroundColor Cyan

Set-Location $ProjectRoot

# Step 1: Execute clean build inside Docker builder image
Write-Host "`n[1/5] Building packages inside hermetic Docker builder container..." -ForegroundColor Yellow
docker compose --project-directory "$ProjectRoot" -f config/docker/docker-compose.build.yml run --rm model-connector-platform-builder

if ($LASTEXITCODE -ne 0) {
    Write-Error "Build container failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}
Write-Host ">> Build completed. Host dist/ folders populated successfully." -ForegroundColor Green

# Step 2: Execute all TypeScript unit tests inside Docker
Write-Host "`n[2/5] Running test suites inside Docker tester container..." -ForegroundColor Yellow
docker compose --project-directory "$ProjectRoot" -f config/docker/docker-compose.build.yml run --rm model-connector-platform-tester

if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker unit test suite failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}
Write-Host ">> All 23 unit tests passed inside Docker." -ForegroundColor Green

# Step 3: Execute Python architectural verification inside Docker
Write-Host "`n[3/5] Running architectural verification inside Docker verifier container..." -ForegroundColor Yellow
docker compose --project-directory "$ProjectRoot" -f config/docker/docker-compose.build.yml run --rm model-connector-platform-verifier

if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker Python verification suite failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}
Write-Host ">> All 9 architectural invariant suites verified successfully inside Docker." -ForegroundColor Green

# Step 4: Build & start lean runtime containers using pre-built dist/
Write-Host "`n[4/5] Starting lean runtime containers (Nginx ~30MB, Node runner)..." -ForegroundColor Yellow
docker compose -f config/docker/docker-compose.yml up -d --build

if ($LASTEXITCODE -ne 0) {
    Write-Error "Runtime compose failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}
Write-Host ">> Runtime containers are up and running." -ForegroundColor Green

# Step 5: Remove builder image and prune dangling/unused images
Write-Host "`n[5/5] Removing temporary builder image and pruning unused Docker images..." -ForegroundColor Yellow
try {
    docker rmi model-connector-platform-builder:latest -f
    docker image prune -a -f
    Write-Host ">> Builder image 'model-connector-platform-builder:latest' successfully purged." -ForegroundColor Green
} catch {
    Write-Warning "Could not remove builder image: $_"
}

Write-Host "`n================================================================================" -ForegroundColor Cyan
Write-Host "  DEPLOYMENT READY!" -ForegroundColor Green
Write-Host "  Desktop Studio:     http://localhost:3005" -ForegroundColor White
Write-Host "  Mobile Responsive:  http://localhost:3005 (or toggle mode in UI)" -ForegroundColor White
Write-Host "  Backend REST API:   http://localhost:8095" -ForegroundColor White
Write-Host "  Health Endpoint:    http://localhost:8095/api/v1/health" -ForegroundColor White
Write-Host "================================================================================" -ForegroundColor Cyan
