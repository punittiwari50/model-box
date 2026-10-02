# Infrastructure Scripts

This directory contains repository-level operational scripts.

## Standards

- Use this directory as the canonical location for shared infrastructure automation.
- Keep scripts idempotent where practical.
- Emit deterministic, timestamped logs under `infra/logs/`.
- Preserve backward compatibility through thin wrappers only when migration is required.

## Scripts

- `Deploy-All-Compose.ps1`: Repository-wide Docker Compose orchestration entry point for PowerShell.
- `Deploy-All-Compose.sh`: Repository-wide Docker Compose orchestration entry point for Linux Bash.
