# Gatling + Report Service Extended Operations

Use this companion document with [SERVICE_COMMANDS.md](./SERVICE_COMMANDS.md) for diagnostics and maintenance workflows.

Execution policy: operations are tool-neutral and apply equally to human operators,
scripted automation, and AI-assisted workflows.

## Status and Health

### Show service status

```bash
docker compose \
  --env-file infra/performance/infra-gatling/docker/.env \
  --env-file infra/performance/infra-gatling/docker/performance-local.env \
  -f infra/performance/infra-gatling/docker/compose.performance.yaml ps
```

### Check health quickly

```bash
docker inspect --format='{{.State.Health.Status}}' gatling-service
docker inspect --format='{{.State.Health.Status}}' report-service
```

## Logs

### Follow both services

```bash
docker compose \
  --env-file infra/performance/infra-gatling/docker/.env \
  --env-file infra/performance/infra-gatling/docker/performance-local.env \
  -f infra/performance/infra-gatling/docker/compose.performance.yaml \
  logs -f gatling-service report-service
```

### Gatling only

```bash
docker compose \
  --env-file infra/performance/infra-gatling/docker/.env \
  --env-file infra/performance/infra-gatling/docker/performance-local.env \
  -f infra/performance/infra-gatling/docker/compose.performance.yaml \
  logs -f gatling-service
```

### Report service only

```bash
docker compose \
  --env-file infra/performance/infra-gatling/docker/.env \
  --env-file infra/performance/infra-gatling/docker/performance-local.env \
  -f infra/performance/infra-gatling/docker/compose.performance.yaml \
  logs -f report-service
```

## Container Shell Access

### Gatling shell

```bash
docker compose \
  --env-file infra/performance/infra-gatling/docker/.env \
  --env-file infra/performance/infra-gatling/docker/performance-local.env \
  -f infra/performance/infra-gatling/docker/compose.performance.yaml \
  exec gatling-service sh
```

### Report service shell

```bash
docker compose \
  --env-file infra/performance/infra-gatling/docker/.env \
  --env-file infra/performance/infra-gatling/docker/performance-local.env \
  -f infra/performance/infra-gatling/docker/compose.performance.yaml \
  exec report-service sh
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
docker compose \
  --env-file infra/performance/infra-gatling/docker/.env \
  --env-file infra/performance/infra-gatling/docker/performance-local.env \
  -f infra/performance/infra-gatling/docker/compose.performance.yaml \
  exec report-service ls -la /reports/
docker compose \
  --env-file infra/performance/infra-gatling/docker/.env \
  --env-file infra/performance/infra-gatling/docker/performance-local.env \
  -f infra/performance/infra-gatling/docker/compose.performance.yaml \
  exec report-service ls -la /reports/runs/
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

- Report links should use /reports/runs/<run-id>/index.html.
- report-service depends on gatling-service health.
- If variables are reported as missing, confirm both --env-file .env and --env-file performance-local.env are present.
- If you see couldn't find env file, verify your current directory and choose the matching path variant from the OS + Workspace Path Guide.
