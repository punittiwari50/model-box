# Gatling + Report Service Commands

This is the single command reference for both services.

Run all commands from one location (repository root):

`model-box/`

## Compose Base

Use both env files in every command:

```bash
docker compose --env-file infra/performance/infra-gatling/docker/.env --env-file infra/performance/infra-gatling/docker/performance-local.env -f infra/performance/infra-gatling/docker/compose.performance.yaml <command>
```

If no command is passed, use this default command to create/start both services:

```bash
docker compose --env-file infra/performance/infra-gatling/docker/.env --env-file infra/performance/infra-gatling/docker/performance-local.env -f infra/performance/infra-gatling/docker/compose.performance.yaml up -d gatling-service report-service
```

## Build and Start

### Rebuild both images (no cache)

```bash
docker compose --env-file infra/performance/infra-gatling/docker/.env --env-file infra/performance/infra-gatling/docker/performance-local.env -f infra/performance/infra-gatling/docker/compose.performance.yaml build --no-cache gatling-service report-service
```

### Start both services

```bash
docker compose --env-file infra/performance/infra-gatling/docker/.env --env-file infra/performance/infra-gatling/docker/performance-local.env -f infra/performance/infra-gatling/docker/compose.performance.yaml up -d gatling-service report-service
```

### Recreate from scratch (recommended after config/script changes)

```bash
docker compose --env-file infra/performance/infra-gatling/docker/.env --env-file infra/performance/infra-gatling/docker/performance-local.env -f infra/performance/infra-gatling/docker/compose.performance.yaml down --remove-orphans
docker compose --env-file infra/performance/infra-gatling/docker/.env --env-file infra/performance/infra-gatling/docker/performance-local.env -f infra/performance/infra-gatling/docker/compose.performance.yaml build --no-cache gatling-service report-service
docker compose --env-file infra/performance/infra-gatling/docker/.env --env-file infra/performance/infra-gatling/docker/performance-local.env -f infra/performance/infra-gatling/docker/compose.performance.yaml up -d gatling-service report-service
```

## Stop and Cleanup

### Stop only

```bash
docker compose --env-file infra/performance/infra-gatling/docker/.env --env-file infra/performance/infra-gatling/docker/performance-local.env -f infra/performance/infra-gatling/docker/compose.performance.yaml stop gatling-service report-service
```

### Remove containers and orphans

```bash
docker compose --env-file infra/performance/infra-gatling/docker/.env --env-file infra/performance/infra-gatling/docker/performance-local.env -f infra/performance/infra-gatling/docker/compose.performance.yaml down --remove-orphans
```

### Remove containers and volumes (deletes reports and cached Maven repo volume)

```bash
docker compose --env-file infra/performance/infra-gatling/docker/.env --env-file infra/performance/infra-gatling/docker/performance-local.env -f infra/performance/infra-gatling/docker/compose.performance.yaml down -v --remove-orphans
```

## Status and Health

### Show service status

```bash
docker compose --env-file infra/performance/infra-gatling/docker/.env --env-file infra/performance/infra-gatling/docker/performance-local.env -f infra/performance/infra-gatling/docker/compose.performance.yaml ps
```

### Check health quickly

```bash
docker inspect --format='{{.State.Health.Status}}' gatling-service
docker inspect --format='{{.State.Health.Status}}' report-service
```

## Logs

### Follow both services

```bash
docker compose --env-file infra/performance/infra-gatling/docker/.env --env-file infra/performance/infra-gatling/docker/performance-local.env -f infra/performance/infra-gatling/docker/compose.performance.yaml logs -f gatling-service report-service
```

### Gatling only

```bash
docker compose --env-file infra/performance/infra-gatling/docker/.env --env-file infra/performance/infra-gatling/docker/performance-local.env -f infra/performance/infra-gatling/docker/compose.performance.yaml logs -f gatling-service
```

### Report service only

```bash
docker compose --env-file infra/performance/infra-gatling/docker/.env --env-file infra/performance/infra-gatling/docker/performance-local.env -f infra/performance/infra-gatling/docker/compose.performance.yaml logs -f report-service
```

## Container Shell Access

### Gatling shell

```bash
docker compose --env-file infra/performance/infra-gatling/docker/.env --env-file infra/performance/infra-gatling/docker/performance-local.env -f infra/performance/infra-gatling/docker/compose.performance.yaml exec gatling-service sh
```

### Report service shell

```bash
docker compose --env-file infra/performance/infra-gatling/docker/.env --env-file infra/performance/infra-gatling/docker/performance-local.env -f infra/performance/infra-gatling/docker/compose.performance.yaml exec report-service sh
```

## Report Validation

### Landing page

```bash
curl -fsS http://localhost:8080/
```

### Reports endpoint

```bash
curl -fsS http://localhost:8080/reports
```

### Runs listing

```bash
curl -fsS http://localhost:8080/reports/runs/
```

### Inspect report files from report container

```bash
docker compose --env-file infra/performance/infra-gatling/docker/.env --env-file infra/performance/infra-gatling/docker/performance-local.env -f infra/performance/infra-gatling/docker/compose.performance.yaml exec report-service ls -la /reports/
docker compose --env-file infra/performance/infra-gatling/docker/.env --env-file infra/performance/infra-gatling/docker/performance-local.env -f infra/performance/infra-gatling/docker/compose.performance.yaml exec report-service ls -la /reports/runs/
```

## Image Management

### Show local images

```bash
docker images | grep -E 'model-box-gatling|model-box-report-service'
```

### Remove images manually

```bash
docker rmi model-box-gatling:local model-box-report-service:local
```

## Notes

- Report links should use `/reports/runs/<run-id>/index.html`.
- `report-service` depends on `gatling-service` health.
- If variables are reported as missing, confirm both `--env-file .env` and `--env-file performance-local.env` are present.
