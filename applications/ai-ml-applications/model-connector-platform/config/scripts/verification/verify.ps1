<#
.SYNOPSIS
    Automated verification runner for ModelConnector Enterprise Platform.
    Conforms to STD-BLD-006 & STD-COD-009.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path "$ScriptDir\..\..\.."

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Running ModelConnector Platform Verification" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

Set-Location $ProjectRoot

python "$ScriptDir\verify_platform.py"
if ($LASTEXITCODE -ne 0) {
    Write-Host "`n✗ Verification failed!" -ForegroundColor Red
    exit 1
}

Write-Host "`n✓ Verification completed successfully with zero defects!" -ForegroundColor Green
exit 0
