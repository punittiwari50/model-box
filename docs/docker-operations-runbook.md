# Docker Operations Runbook

This runbook contains detailed procedures that extend [docker-operations.md](./docker-operations.md).

Execution policy: all procedures are tool-neutral and apply equally to human operators,
scripted automation, and AI-assisted workflows.

## 1. Quick Start and Runtime Mode Switching

### 1.1 Quick Start (GPU Mode)

Execution context:

```bash
cd infra/ollama/docker
```

Start GPU runtime:

```bash
docker compose --env-file ollama-gpu.env -f compose.gpu.yaml up -d --build --wait --wait-timeout 180
```

Verify model inventory:

```bash
docker compose --env-file ollama-gpu.env -f compose.gpu.yaml exec -T ollama ollama list
```

Verify mount visibility:

```bash
docker compose --env-file ollama-gpu.env -f compose.gpu.yaml exec -T ollama bash -lc "mount | grep models"
```

Verify API health:

```bash
curl -fsS http://localhost:11435/api/tags
```

### 1.2 Switch to CPU Mode

Stop GPU runtime:

```bash
docker compose --env-file ollama-gpu.env -f compose.gpu.yaml down
```

Start CPU runtime:

```bash
docker compose --env-file ollama-cpu.env -f compose.cpu.yaml up -d --build --wait --wait-timeout 180
```

Verify model inventory remains available:

```bash
docker compose --env-file ollama-cpu.env -f compose.cpu.yaml exec -T ollama ollama list
```

## 2. Teardown and Cleanup

Execution context:

```bash
cd infra/ollama/docker
```

Remove GPU stack:

```bash
docker compose --env-file ollama-gpu.env -f compose.gpu.yaml down -v --remove-orphans
```

Remove CPU stack:

```bash
docker compose --env-file ollama-cpu.env -f compose.cpu.yaml down -v --remove-orphans
```

Remove Ollama images:

```bash
docker rmi -f $(docker images --filter "reference=ollama/*" -q)
```

Remove Ollama volumes:

```bash
docker volume ls --filter "name=*ollama*" -q | xargs -r docker volume rm -f
```

Verify teardown:

```bash
docker ps -a --filter "name=ollama*"
docker images --filter "reference=ollama*"
docker volume ls --filter "name=*ollama*"
```

## 3. Repo-wide Rebuild Checklist

Execution context:

```bash
cd model-box
```

### 3.1 Remove stacks

```bash
docker compose \
  --env-file infra/performance/infra-gatling/docker/.env \
  --env-file infra/performance/infra-gatling/docker/performance-local.env \
  -f infra/performance/infra-gatling/docker/compose.performance.yaml \
  down -v --remove-orphans

docker compose --env-file infra/ollama/docker/ollama-gpu.env -f infra/ollama/docker/compose.gpu.yaml down -v --remove-orphans

docker compose --env-file infra/ollama/docker/ollama-cpu.env -f infra/ollama/docker/compose.cpu.yaml down -v --remove-orphans
```

### 3.2 Cleanup resources

```bash
docker rmi -f $(docker images --filter "reference=ollama/*" -q) 2>/dev/null

docker rmi -f $(docker images --filter "reference=*gatling*" -q) 2>/dev/null

docker rmi -f $(docker images --filter "reference=*report*" -q) 2>/dev/null

docker container prune -f
docker image prune -f
docker volume prune -f
docker network prune -f
docker buildx prune -a -f
```

### 3.3 Rebuild stacks

```bash
docker compose --env-file infra/ollama/docker/ollama-gpu.env -f infra/ollama/docker/compose.gpu.yaml up -d --build --wait --wait-timeout 180

docker compose --env-file infra/ollama/docker/ollama-cpu.env -f infra/ollama/docker/compose.cpu.yaml up -d --build --wait --wait-timeout 180

docker compose \
  --env-file infra/performance/infra-gatling/docker/.env \
  --env-file infra/performance/infra-gatling/docker/performance-local.env \
  -f infra/performance/infra-gatling/docker/compose.performance.yaml \
  up -d --build --wait --wait-timeout 180
```

### 3.4 Verify stacks

```bash
docker compose --env-file infra/ollama/docker/ollama-gpu.env -f infra/ollama/docker/compose.gpu.yaml ps
docker compose --env-file infra/ollama/docker/ollama-gpu.env -f infra/ollama/docker/compose.gpu.yaml exec -T ollama ollama list
curl -fsS http://localhost:11435/api/tags | head -c 100

docker compose \
  --env-file infra/performance/infra-gatling/docker/.env \
  --env-file infra/performance/infra-gatling/docker/performance-local.env \
  -f infra/performance/infra-gatling/docker/compose.performance.yaml ps
curl -fsS http://localhost:8080/ | head -c 100
```

### 3.5 Optional aggressive cleanup

```bash
docker system prune -a --volumes -f
```

Use aggressive cleanup only when you intentionally want machine-wide cleanup.

## 4. Bulk Model Lifecycle

### 4.1 PowerShell

```powershell
$models = @(
  "minicpm-v:latest",
  "deepseek-r1:7b",
  "qwen2.5vl:3b",
  "nemotron3:33b",
  "llama3.2-vision:latest",
  "phi4:latest",
  "gemma4:e4b",
  "qwen3-coder:latest",
  "llama3.1:8b",
  "qwen3:8b"
)
$models | ForEach-Object { docker compose --env-file ollama.env -f compose.ollama.yaml exec -T ollama ollama pull $_ }
docker compose --env-file ollama.env -f compose.ollama.yaml exec -T ollama ollama list
```

### 4.2 Linux/macOS

```bash
models=(
  minicpm-v:latest
  deepseek-r1:7b
  qwen2.5vl:3b
  nemotron3:33b
  llama3.2-vision:latest
  phi4:latest
  gemma4:e4b
  qwen3-coder:latest
  llama3.1:8b
  qwen3:8b
)
for m in "${models[@]}"; do docker compose --env-file ollama.env -f compose.ollama.yaml exec -T ollama ollama pull "$m"; done
docker compose --env-file ollama.env -f compose.ollama.yaml exec -T ollama ollama list
```

## 5. Governance and Security Policies

### 5.1 Model version governance

1. Re-run `ollama pull <model:tag>` to refresh the same tag.
2. Prefer pinned tags (`:7b`, `:3b`, `:e4b`) for reproducibility.
3. Use `:latest` only when rolling updates are acceptable.

### 5.2 Exposure policy

1. Keep default exposure localhost-only (`127.0.0.1`) for development.
2. For LAN access, set `COMPOSE_BIND_IP=0.0.0.0` in `.env` and restart.

### 5.3 Runtime user policy

1. All Compose services in this repository must run as non-root users.
2. Root runtime (`0:0`) is forbidden for steady-state execution.
3. New services must define explicit non-root `user` mapping.

Current UID:GID mappings:

| Stack | Service | UID:GID |
|---|---|---|
| `infra/ollama/docker/compose.ollama.yaml` | `ollama` | `10001:10001` |
| `infra/performance/infra-gatling/docker/compose.performance.yaml` | `gatling-service` | `1500:1500` |
| `infra/performance/infra-gatling/docker/compose.performance.yaml` | `report-service` | `10002:10002` |
