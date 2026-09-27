# Report Service Configuration

## Overview

The Report Service is an nginx-based web server that serves Gatling performance test reports. It runs in a separate container and depends on the Gatling service completing successfully.

## Endpoints

### Available Endpoints

| Endpoint | Purpose | Status |
|---|---|---|
| `http://localhost:8080/` | Landing page with report index | 200 OK |
| `http://localhost:8080/reports` | Main reports endpoint (alias for `/`) | 200 OK |
| `http://localhost:8080/runs/` | Directory listing of test runs | 200 OK |
| `http://localhost:8080/reports/runs/` | Runs directory (alternate path) | 200 OK |
| `http://localhost:8080/runs/{run-id}/` | Individual Gatling report | 200 OK |

### Endpoint Details

#### Root Landing Page (`/`)
- Serves `index.html` from `/reports` volume
- Lists all available test runs
- Provides links to individual run reports

#### Reports Endpoint (`/reports`)
- Alias for the root landing page
- Returns the same `index.html` as `/`
- Useful for explicit reports path requests

#### Runs Directory (`/runs/`, `/reports/runs/`)
- Lists all test run directories
- Each directory contains a complete Gatling HTML report
- Format: `{timestamp}_{simulation_class}/{index.html}`

#### Individual Run Reports
- Access via: `/runs/{timestamp}_{simulation_class}/`
- Example: `/runs/2026-09-27T05-27-55Z_com_modelbox_simulation_ollama_OllamaSimulation/`
- Displays full Gatling performance metrics and analysis

## Troubleshooting

### 404 Error on `/reports`

**Symptoms:**
```
curl http://localhost:8080/reports
404 Not Found
```

**Causes:**
1. Report volume not mounted or empty
2. nginx location block misconfigured
3. index.html file missing in reports directory

**Solutions:**
1. Verify report volume is mounted: `docker inspect report-service | grep Mounts`
2. Check reports directory exists: `docker compose exec report-service ls -la /reports/`
3. Verify index.html exists: `docker compose exec report-service test -f /reports/index.html && echo "exists" || echo "missing"`
4. Check nginx error logs: `docker compose logs report-service`

### 404 Error on `/runs/`

**Symptoms:**
```
curl http://localhost:8080/runs/
404 Not Found
```

**Causes:**
1. Gatling service has not completed a run
2. Reports directory structure not created
3. nginx alias configuration issue

**Solutions:**
1. Verify Gatling service status: `docker compose ps gatling-service`
2. Wait for Gatling service to complete: `docker compose logs gatling-service | tail -50`
3. Check runs directory: `docker compose exec report-service ls -la /reports/runs/`

## Volume Structure

Report data is persisted in a named volume: `report-data`

```
/reports/
├── index.html                    # Landing page
├── runs/                         # Test run results
│   ├── 2026-09-27T05-20-03Z.../
│   │   ├── index.html           # Gatling report
│   │   ├── js/                  # Report assets
│   │   ├── css/
│   │   └── ...
│   └── 2026-09-27T05-27-55Z.../
└── jfr/                         # Optional JFR profiles (if enabled)
    └── gatling.jfr
```

## Health Check

The report service performs an HTTP health check:

```
wget -S -O /dev/null http://127.0.0.1:8080/ 2>&1 | grep -Eq 'HTTP/[0-9.]+ (200|404)' || exit 1
```

**Note:** The health check accepts both 200 and 404, allowing the service to be considered healthy even before reports are generated.

## Security Configuration

- **User:** `report_svc` (UID 10002, GID 10002)
- **Privileges:** Dropped all Linux capabilities (`cap_drop: [ALL]`)
- **Read-only filesystem:** `true`
- **Temporary writable mounts:**
  - `/tmp` (64MB, no exec, no suid, no dev)
  - `/var/cache/nginx` (64MB, no exec, no suid, no dev)
  - `/run/nginx` (16MB, no exec, no suid, no dev)
- **PID limit:** 256 processes

## Performance Characteristics

- **Memory limit:** Inherited from compose configuration
- **CPU limit:** Inherited from compose configuration
- **Logging:** JSON driver with 10MB max size, 3 file rotation

## Integration with Gatling Service

The report service:
1. Depends on Gatling service health check (waits for Ollama connectivity)
2. Shares the `report-data` volume with Gatling
3. Shares `model-box-net` network for inter-service communication
4. Starts only after Gatling reports successful healthcheck status

## Accessing Reports

### From Host

```bash
# View landing page
curl -fsS http://localhost:8080/

# View runs directory
curl -fsS http://localhost:8080/runs/

# View specific run
curl -fsS http://localhost:8080/runs/{timestamp}_{simulation}/{index.html}
```

### Browser Access

- **Landing Page:** `http://localhost:8080`
- **Reports List:** `http://localhost:8080/reports` or `http://localhost:8080/`
- **Specific Run:** Click on run link from landing page

## Configuration Files

- **Compose:** `compose.performance.yaml`
- **Dockerfile:** `report.Dockerfile`
- **Main config:** `nginx/nginx.conf`
- **Server config:** `nginx/default.conf`
- **Environment:** `.env`, `performance-local.env`

## Common Tasks

For all Gatling + report-service operational commands, use the unified command reference:

- `SERVICE_COMMANDS.md`

If no command is passed, use the default create/start command for both services:

```bash
docker compose --env-file infra/performance/infra-gatling/docker/.env --env-file infra/performance/infra-gatling/docker/performance-local.env -f infra/performance/infra-gatling/docker/compose.performance.yaml up -d gatling-service report-service
```

### Rebuild Report Service After nginx Config Change

```bash
# From repository root (model-box/)
docker compose --env-file infra/performance/infra-gatling/docker/.env --env-file infra/performance/infra-gatling/docker/performance-local.env -f infra/performance/infra-gatling/docker/compose.performance.yaml down
docker rmi model-box-report-service:local
docker compose --env-file infra/performance/infra-gatling/docker/.env --env-file infra/performance/infra-gatling/docker/performance-local.env -f infra/performance/infra-gatling/docker/compose.performance.yaml up -d --build
```

### View Report Service Logs

```bash
docker compose --env-file infra/performance/infra-gatling/docker/.env --env-file infra/performance/infra-gatling/docker/performance-local.env -f infra/performance/infra-gatling/docker/compose.performance.yaml logs -f report-service
```

### Access Container Shell (for debugging)

```bash
docker compose --env-file infra/performance/infra-gatling/docker/.env --env-file infra/performance/infra-gatling/docker/performance-local.env -f infra/performance/infra-gatling/docker/compose.performance.yaml exec report-service sh
```
