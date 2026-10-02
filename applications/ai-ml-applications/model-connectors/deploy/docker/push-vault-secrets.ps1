# ==============================================================================
# ModelBox Vault Secrets Push Automation Script (PowerShell)
# Reads all *-secure.env files and pushes values into the Docker Container Vault.
# Adheres to zero-secret-in-git enterprise policy.
# ==============================================================================
param (
    [string]$VaultContainerName = "model-connectors-vault",
    [string]$VaultToken = "modelbox-vault-root-token",
    [string]$EnvDir = $PSScriptRoot
)

$ErrorActionPreference = "Stop"

if (-not $EnvDir) {
    $EnvDir = Get-Location
}

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "[VAULT] ModelBox Vault Secrets Push Utility" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

# 1. Verify Vault container is running
Write-Host "[1/4] Verifying Vault container ($VaultContainerName)..." -ForegroundColor Yellow
$containerCheck = docker ps --filter "name=$VaultContainerName" --filter "status=running" --format "{{.Names}}"
if (-not $containerCheck) {
    Write-Warning "Container '$VaultContainerName' is not currently running. Starting with Docker Compose..."
    docker compose -f (Join-Path $EnvDir "docker-compose.yml") up -d vault
    Start-Sleep -Seconds 3
}

# 2. Find all *-secure.env files
$secureFiles = Get-ChildItem -Path $EnvDir -Filter "*-secure.env"
if ($secureFiles.Count -eq 0) {
    Write-Warning "No *-secure.env files found in $EnvDir!"
    Write-Host "Checking for .example templates to generate defaults..."
    $exampleFiles = Get-ChildItem -Path $EnvDir -Filter "*-secure.env.example"
    foreach ($example in $exampleFiles) {
        $target = $example.FullName.Replace(".example", "")
        if (-not (Test-Path $target)) {
            Copy-Item -Path $example.FullName -Destination $target
            Write-Host "Initialized $target from template." -ForegroundColor Green
        }
    }
    $secureFiles = Get-ChildItem -Path $EnvDir -Filter "*-secure.env"
}

Write-Host "[2/4] Discovered $($secureFiles.Count) secure configuration files:" -ForegroundColor Yellow
foreach ($f in $secureFiles) {
    Write-Host "  -> $($f.Name)" -ForegroundColor DarkCyan
}

# 3. Enable KV v2 secret engine if not enabled
Write-Host "[3/4] Ensuring Vault secret engine is active..." -ForegroundColor Yellow
try {
    $null = docker exec -e "VAULT_TOKEN=$VaultToken" $VaultContainerName vault secrets enable -path=secret kv-v2 2>&1
} catch {
    # Secret engine is already mounted
}

# 4. Parse each *-secure.env and push values to container vault
Write-Host "[4/4] Pushing secrets to container vault..." -ForegroundColor Yellow
foreach ($file in $secureFiles) {
    $secretCategory = $file.Name.Replace("model-box-", "").Replace("-secure.env", "")
    $vaultPath = "secret/modelbox/$secretCategory"
    
    $kvPairs = @()
    Get-Content $file.FullName | ForEach-Object {
        $line = $_.Trim()
        if ($line -and (-not $line.StartsWith("#")) -and ($line.Contains("="))) {
            $parts = $line.Split("=", 2)
            $key = $parts[0].Trim()
            $val = $parts[1].Trim()
            if ($key -and $val) {
                $kvPairs += "$key=$val"
            }
        }
    }

    if ($kvPairs.Count -gt 0) {
        $putArgs = @("exec", "-e", "VAULT_TOKEN=$VaultToken", $VaultContainerName, "vault", "kv", "put", $vaultPath) + $kvPairs
        & docker @putArgs | Out-Null
        Write-Host "  [OK] Pushed $($kvPairs.Count) secret keys to vault at: $vaultPath" -ForegroundColor Green
    }
}

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "[SUCCESS] All sensitive vault credentials pushed successfully to container vault!" -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Cyan
