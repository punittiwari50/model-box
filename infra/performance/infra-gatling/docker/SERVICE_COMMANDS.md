# Gatling + Report Service Commands

This is the single command reference for both services.

Execution policy: commands are tool-neutral and apply equally to human operators,
scripted automation, and AI-assisted workflows.

Run all commands from one location (repository root):

`model-box/`

## OS + Workspace Path Guide

Use the command variant that matches both your shell and current working directory.

### Linux/macOS (or Git Bash) from inner repo root

Working directory:

`.../model-box/model-box`

```bash
docker compose \
	--env-file infra/performance/infra-gatling/docker/.env \
	--env-file infra/performance/infra-gatling/docker/performance-local.env \
	-f infra/performance/infra-gatling/docker/compose.performance.yaml \
	<command>
```

### Windows PowerShell from outer workspace root

Working directory:

`.../model-box`

```powershell
docker compose \
	--env-file model-box/infra/performance/infra-gatling/docker/.env \
	--env-file model-box/infra/performance/infra-gatling/docker/performance-local.env \
	-f model-box/infra/performance/infra-gatling/docker/compose.performance.yaml \
	<command>
```

### Windows PowerShell from inner repo root

Working directory:

`.../model-box/model-box`

```powershell
docker compose \
	--env-file infra/performance/infra-gatling/docker/.env \
	--env-file infra/performance/infra-gatling/docker/performance-local.env \
	-f infra/performance/infra-gatling/docker/compose.performance.yaml \
	<command>
```

## Compose Base

Use both env files in every command:

```bash
docker compose \
	--env-file infra/performance/infra-gatling/docker/.env \
	--env-file infra/performance/infra-gatling/docker/performance-local.env \
	-f infra/performance/infra-gatling/docker/compose.performance.yaml \
	<command>
```

If no command is passed, use this default command to create/start both services:

```bash
docker compose \
	--env-file infra/performance/infra-gatling/docker/.env \
	--env-file infra/performance/infra-gatling/docker/performance-local.env \
	-f infra/performance/infra-gatling/docker/compose.performance.yaml \
	up -d gatling-service report-service
```

Windows PowerShell equivalent from outer workspace root:

```powershell
docker compose \
	--env-file model-box/infra/performance/infra-gatling/docker/.env \
	--env-file model-box/infra/performance/infra-gatling/docker/performance-local.env \
	-f model-box/infra/performance/infra-gatling/docker/compose.performance.yaml \
	up -d gatling-service report-service
```

## Runtime Profile Commands (Java and Scala)

Use these commands when your working directory is the outer workspace root:

`.../model-box`

### Start both services (same for Java or Scala)

```powershell
docker compose \
	--env-file model-box/infra/performance/infra-gatling/docker/.env \
	--env-file model-box/infra/performance/infra-gatling/docker/performance-local.env \
	-f model-box/infra/performance/infra-gatling/docker/compose.performance.yaml \
	up -d gatling-service report-service
```

### Run Java profile performance test

```powershell
docker compose \
	--env-file model-box/infra/performance/infra-gatling/docker/.env \
	--env-file model-box/infra/performance/infra-gatling/docker/performance-local.env \
	-f model-box/infra/performance/infra-gatling/docker/compose.performance.yaml \
	run --rm -e GATLING_RUNTIME_PROFILE=java -e APP_PROFILE=java-local gatling-service
```

### Run Scala profile performance test

```powershell
docker compose \
	--env-file model-box/infra/performance/infra-gatling/docker/.env \
	--env-file model-box/infra/performance/infra-gatling/docker/performance-local.env \
	-f model-box/infra/performance/infra-gatling/docker/compose.performance.yaml \
	run --rm -e GATLING_RUNTIME_PROFILE=scala -e APP_PROFILE=scala-local gatling-service
```

### Follow logs for model-specific progress

```powershell
docker compose \
	--env-file model-box/infra/performance/infra-gatling/docker/.env \
	--env-file model-box/infra/performance/infra-gatling/docker/performance-local.env \
	-f model-box/infra/performance/infra-gatling/docker/compose.performance.yaml \
	logs -f gatling-service
```

## Sequential Runtime Validation

The Gatling runner now executes runtimes sequentially so both Java and Scala are validated in one flow.

- If primary runtime is `java`, companion runtime `scala` runs first with 1 user, then `java` runs with requested settings.
- If primary runtime is `scala`, companion runtime `java` runs first with 1 user, then `scala` runs with requested settings.
- Companion runtime failures are logged but do not block primary runtime execution.

### Companion override environment variables

- `GATLING_COMPANION_USERS`: Companion runtime users and warmup users (default: `1`).
- `GATLING_COMPANION_SIMULATIONS`: Comma-separated simulation classes for companion runtime.

### Example (Java primary, custom companion settings)

```powershell
docker compose \
	--env-file model-box/infra/performance/infra-gatling/docker/.env \
	--env-file model-box/infra/performance/infra-gatling/docker/performance-local.env \
	-f model-box/infra/performance/infra-gatling/docker/compose.performance.yaml \
	run --rm -e GATLING_RUNTIME_PROFILE=java -e APP_PROFILE=java-local \
	-e GATLING_COMPANION_USERS=1 \
	-e GATLING_COMPANION_SIMULATIONS=com.modelbox.simulation.ollama.OllamaLoadSimulation \
	gatling-service
```

### Example (Scala primary, custom companion settings)

```powershell
docker compose \
	--env-file model-box/infra/performance/infra-gatling/docker/.env \
	--env-file model-box/infra/performance/infra-gatling/docker/performance-local.env \
	-f model-box/infra/performance/infra-gatling/docker/compose.performance.yaml \
	run --rm -e GATLING_RUNTIME_PROFILE=scala -e APP_PROFILE=scala-local \
	-e GATLING_COMPANION_USERS=1 \
	-e GATLING_COMPANION_SIMULATIONS=com.modelbox.simulation.ollama.OllamaJavaLoadSimulation \
	gatling-service
```

## Build and Start

### Rebuild both images (no cache)

```bash
docker compose \
	--env-file infra/performance/infra-gatling/docker/.env \
	--env-file infra/performance/infra-gatling/docker/performance-local.env \
	-f infra/performance/infra-gatling/docker/compose.performance.yaml \
	build --no-cache gatling-service report-service
```

### Start both services

```bash
docker compose \
	--env-file infra/performance/infra-gatling/docker/.env \
	--env-file infra/performance/infra-gatling/docker/performance-local.env \
	-f infra/performance/infra-gatling/docker/compose.performance.yaml \
	up -d gatling-service report-service
```

### Recreate from scratch (recommended after config/script changes)

```bash
docker compose \
	--env-file infra/performance/infra-gatling/docker/.env \
	--env-file infra/performance/infra-gatling/docker/performance-local.env \
	-f infra/performance/infra-gatling/docker/compose.performance.yaml \
	down --remove-orphans
docker compose \
	--env-file infra/performance/infra-gatling/docker/.env \
	--env-file infra/performance/infra-gatling/docker/performance-local.env \
	-f infra/performance/infra-gatling/docker/compose.performance.yaml \
	build --no-cache gatling-service report-service
docker compose \
	--env-file infra/performance/infra-gatling/docker/.env \
	--env-file infra/performance/infra-gatling/docker/performance-local.env \
	-f infra/performance/infra-gatling/docker/compose.performance.yaml \
	up -d gatling-service report-service
```

## Stop and Cleanup

### Stop only

```bash
docker compose \
	--env-file infra/performance/infra-gatling/docker/.env \
	--env-file infra/performance/infra-gatling/docker/performance-local.env \
	-f infra/performance/infra-gatling/docker/compose.performance.yaml \
	stop gatling-service report-service
```

### Remove containers and orphans

```bash
docker compose \
	--env-file infra/performance/infra-gatling/docker/.env \
	--env-file infra/performance/infra-gatling/docker/performance-local.env \
	-f infra/performance/infra-gatling/docker/compose.performance.yaml \
	down --remove-orphans
```

### Remove containers and volumes (deletes reports and cached Maven repo volume)

```bash
docker compose \
	--env-file infra/performance/infra-gatling/docker/.env \
	--env-file infra/performance/infra-gatling/docker/performance-local.env \
	-f infra/performance/infra-gatling/docker/compose.performance.yaml \
	down -v --remove-orphans
```

## Extended Operations

For diagnostics and maintenance commands, use:

- [SERVICE_COMMANDS_OPERATIONS.md](./SERVICE_COMMANDS_OPERATIONS.md)

This companion file includes:

1. Status and health checks.
2. Logs and container shell access.
3. Report validation and report file inspection.
4. Image management commands.
5. Operational notes and env-file troubleshooting.
