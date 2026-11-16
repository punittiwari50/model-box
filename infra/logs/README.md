# Infrastructure Logs

This directory is the canonical location for Docker Compose orchestration logs.

## Policy

- Write operational logs from infrastructure automation to this directory.
- Keep this directory out of source control except for marker/documentation files.
- Log files should use timestamped names for traceability.

## Current conventions

- `docker-compose-orchestrator-YYYYMMDD-HHMMSS.log`
- `performance-stack-YYYYMMDD-HHMMSS.log`
