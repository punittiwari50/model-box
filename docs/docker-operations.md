# Docker Operations for Ollama

Manual-first policy: all steps in this guide are direct terminal procedures and do not require assistant or token-driven automation.

## 1. Execution Context

Run commands from:

```bash
infra/ollama/docker
```

Authoritative references:

- [Ollama Docker Hub image](https://hub.docker.com/r/ollama/ollama)
- [Ollama official site](https://ollama.com)

Environment strategy:

1. `.env` is for Compose interpolation values (host paths, ports, container limits, image).
2. `ollama.env` is the legacy single-stack runtime file.
3. `ollama-gpu.env` and `ollama-cpu.env` are the current mode-specific runtime files.
4. Use the matching `--env-file` with the matching compose file, otherwise default `.env` values may be used.
5. Initialize local interpolation file:

```bash
cp .env.example .env
```

Relative path resolution note:

1. Default values use a bind mount for Ollama data and a named volume for `workspace_data` for portability.
2. To use alternative bind mounts, set relative or absolute paths in `.env`.
3. Compose resolves relative paths from the directory that contains the selected compose file.
4. Example bind override: `COMPOSE_OLLAMA_MODELS_HOST=./volumes/ollama`.
5. Canonical host model repository: `C:/volume-docker_ollama`.
6. Keep the same host path in `compose.ollama.yaml`, `compose.gpu.yaml`, `compose.cpu.yaml`, `ollama.env`, `ollama-gpu.env`, `ollama-cpu.env`, `.env.example`, and `.env`.
7. Use `ollama-gpu.env` for GPU mode and `ollama-cpu.env` for CPU-only mode; both reference the same host model path.
7. The host volume is consolidated into a single root manifest tree; all 11 available models are discoverable via `ollama list` in both CPU and GPU containers.
8. When pulling new models through the container (e.g., `ollama pull qwen3:8b`), they are persisted to the host volume and remain visible across container restarts and mode switches (CPU ↔ GPU).

Mount behavior matrix:

| Mount type | Example | Host side | Container side | Typical use |
|---|---|---|---|---|
| Bind mount, read-write (bidirectional) | `C:/volume-docker_ollama:/models` | Writable | Writable | Default Ollama data and model persistence |
| Bind mount, host read-only | `./data:/workspace:ro` | Read-only to container | Read-only inside container | Static assets or source data |
| Full container filesystem read-only | `read_only: true` | No direct change from host | Read-only for app filesystem | Only when app does not write to disk |

Notes:

1. The default configuration is read-write in both directions, so the Ollama model bind is bidirectional (`read_only: false`).
2. To make a mounted path read-only for the container, append `:ro` to the mount definition.
3. `read_only: true` is a service-level setting and affects the whole container filesystem, not just one path.
4. Ollama writes model/runtime state, so `read_only: true` is not recommended unless the runtime is intentionally constrained.
5. Bidirectional read-write is required so that models downloaded inside the container (via `ollama pull`) are persisted to the host volume and remain discoverable after container restarts or mode changes.

## 2. Runtime baseline defaults

| Purpose | Setting | Default |
|---|---|---|
| Image pinning | `COMPOSE_OLLAMA_IMAGE` | `ollama/ollama:latest` |
| Host bind scope | `COMPOSE_BIND_IP` | `127.0.0.1` |
| Host API port | `COMPOSE_HOST_PORT` | `11435` |
| Container API port | `COMPOSE_CONTAINER_PORT` | `11434` |
| Model data storage source | `COMPOSE_OLLAMA_MODELS_HOST` | `C:/volume-docker_ollama` |
| Model mount target | `COMPOSE_OLLAMA_MODELS_CONTAINER` | `/models` |
| CPU limit | `COMPOSE_CPUS` | `6` |
| Memory limit | `COMPOSE_MEM_LIMIT` | `24g` |
| Shared memory | `COMPOSE_SHM_SIZE` | `2g` |

## 2a. Ollama Runtime Properties (CPU Mode)

CPU-only mode is used when GPU is unavailable or for validation runs. Use `ollama-cpu.env` environment file.

| Property | Purpose | Available Values | Default | Mode |
|---|---|---|---|---|
| `OLLAMA_HOST` | Network interface and port binding | `0.0.0.0:11434`, `127.0.0.1:11434`, `[::]:11434` | `0.0.0.0:11434` | CPU/GPU |
| `OLLAMA_MODELS` | Container path for model storage | `/models`, `/mnt/models`, any mounted path | `/models` | CPU/GPU |
| `OLLAMA_NO_CLOUD` | Disable Ollama cloud integration | `true`, `false` | `true` | CPU/GPU |
| `OLLAMA_NUM_PARALLEL` | Concurrent model load threads | `1`, `2`, `4`, `8` (depends on CPU cores) | `2` | CPU/GPU |
| `OLLAMA_MAX_LOADED_MODELS` | Max models in memory simultaneously | `1`, `2`, `4`, (1 recommended for limited RAM) | `1` | CPU/GPU |
| `OLLAMA_MAX_QUEUE` | Request queue limit | `32`, `64`, `128`, `256` | `128` | CPU/GPU |
| `OLLAMA_CONTEXT_LENGTH` | Token context window | `2048`, `4096`, `8192`, `16384` | `8192` | CPU/GPU |
| `OLLAMA_KEEP_ALIVE` | Model memory retention time | `5m`, `10m`, `30m`, `1h`, `-1` (permanent) | `10m` | CPU/GPU |
| `COMPOSE_CPUS` | CPU limit for container | `2`, `4`, `6`, `8`, `12` (count of cores) | `6` | CPU/GPU |
| `COMPOSE_MEM_LIMIT` | Memory limit for container | `8g`, `16g`, `24g`, `32g` | `24g` | CPU/GPU |
| `COMPOSE_SHM_SIZE` | Shared memory for inter-process communication | `1g`, `2g`, `4g` | `2g` | CPU/GPU |

**CPU Mode Environment File (`ollama-cpu.env`):**
All properties above with no GPU-specific settings. Omits `NVIDIA_VISIBLE_DEVICES` and `NVIDIA_DRIVER_CAPABILITIES`.

## 2b. Ollama Runtime Properties (GPU Mode)

GPU-accelerated mode requires NVIDIA Container Toolkit on host. Use `ollama-gpu.env` environment file.

| Property | Purpose | Available Values | Default | Mode |
|---|---|---|---|---|
| `OLLAMA_HOST` | Network interface and port binding | `0.0.0.0:11434`, `127.0.0.1:11434`, `[::]:11434` | `0.0.0.0:11434` | CPU/GPU |
| `OLLAMA_MODELS` | Container path for model storage | `/models`, `/mnt/models`, any mounted path | `/models` | CPU/GPU |
| `OLLAMA_NO_CLOUD` | Disable Ollama cloud integration | `true`, `false` | `true` | CPU/GPU |
| `OLLAMA_NUM_PARALLEL` | Concurrent model load threads | `1`, `2`, `4`, `8` | `2` | CPU/GPU |
| `OLLAMA_MAX_LOADED_MODELS` | Max models in memory simultaneously | `1`, `2`, `4` (GPU memory dependent) | `1` | CPU/GPU |
| `OLLAMA_MAX_QUEUE` | Request queue limit | `32`, `64`, `128`, `256` | `128` | CPU/GPU |
| `OLLAMA_CONTEXT_LENGTH` | Token context window | `2048`, `4096`, `8192`, `16384` | `8192` | CPU/GPU |
| `OLLAMA_KEEP_ALIVE` | Model memory retention time | `5m`, `10m`, `30m`, `1h`, `-1` (permanent) | `10m` | CPU/GPU |
| `COMPOSE_CPUS` | CPU limit for container | `2`, `4`, `6`, `8`, `12` | `6` | CPU/GPU |
| `COMPOSE_MEM_LIMIT` | Memory limit for container | `8g`, `16g`, `24g`, `32g` | `24g` | CPU/GPU |
| `COMPOSE_SHM_SIZE` | Shared memory for inter-process communication | `1g`, `2g`, `4g` | `2g` | CPU/GPU |
| `NVIDIA_VISIBLE_DEVICES` | GPU device visibility to container | `0`, `1`, `2` (device index), `all` | `0` | GPU only |
| `NVIDIA_DRIVER_CAPABILITIES` | GPU driver capabilities required | `compute,utility`, `graphics,compute,utility` | `compute,utility` | GPU only |

**GPU Mode Environment File (`ollama-gpu.env`):**
All properties above plus GPU-specific NVIDIA settings. Requires `gpus: all` in compose service definition.

**GPU Requirements:**
- NVIDIA GPU on host
- NVIDIA Container Toolkit installed and running
- Docker daemon configured to use NVIDIA runtime

Security and reliability defaults (both modes):

1. `init: true` is enabled to handle zombie processes correctly.
2. `no-new-privileges:true` is enabled.
3. Linux capabilities are dropped with `cap_drop: [ALL]`.
4. `pids_limit` is set to `1024`.
5. `nofile` ulimit is set to `65536`.
6. Logging uses non-blocking mode with bounded buffer.

## 3. Operational Command Catalog

| Purpose | Command | Output |
|---|---|---|
| Start GPU runtime | `docker compose --env-file ollama-gpu.env -f compose.gpu.yaml up -d` | GPU service started |
| Start CPU runtime | `docker compose --env-file ollama-cpu.env -f compose.cpu.yaml up -d` | CPU service started |
| Stop GPU runtime | `docker compose --env-file ollama-gpu.env -f compose.gpu.yaml down` | GPU service and Compose network removed |
| Stop CPU runtime | `docker compose --env-file ollama-cpu.env -f compose.cpu.yaml down` | CPU service and Compose network removed |
| Full cleanup (including orphans) | `docker compose --env-file ollama-gpu.env -f compose.gpu.yaml down -v --remove-orphans` | Containers, network, volumes, and orphans removed |
| Runtime status | `docker compose --env-file ollama-gpu.env -f compose.gpu.yaml ps` | Current service state and ports |
| Stream logs | `docker compose --env-file ollama-gpu.env -f compose.gpu.yaml logs -f ollama` | Real-time runtime logs |
| Health check (Linux/macOS) | `curl -fsS http://localhost:11435/api/tags` | Model inventory JSON |
| Health check (PowerShell) | `Invoke-WebRequest -UseBasicParsing http://localhost:11435/api/tags | Select-Object -ExpandProperty StatusCode` | HTTP status code (`200` expected) |
| List models | `docker compose --env-file ollama-gpu.env -f compose.gpu.yaml exec -T ollama ollama list` | Installed model tags (currently 11 models) |
| Pull or update model | `docker compose --env-file ollama-gpu.env -f compose.gpu.yaml exec -T ollama ollama pull llama2:7b` | Model pulled to host volume and persisted |
| Remove model tag | `docker compose --env-file ollama-gpu.env -f compose.gpu.yaml exec -T ollama ollama rm deepseek-r1:7b` | Local model tag removed from host volume |

Current available models (consolidated 2026-09-27):

| Model | Size | Status |
|---|---|---|
| tinyllama:latest | 637 MB | ✓ Available |
| qwen3:8b | 5.2 GB | ✓ Available |
| llama3.1:8b | 4.9 GB | ✓ Available |
| qwen3-coder:latest | 18 GB | ✓ Available |
| gemma4:e4b | 9.6 GB | ✓ Available |
| phi4:latest | 9.1 GB | ✓ Available |
| llama3.2-vision:latest | 7.8 GB | ✓ Available |
| nemotron3:33b | 27 GB | ✓ Available |
| qwen2.5vl:3b | 3.2 GB | ✓ Available |
| deepseek-r1:7b | 4.7 GB | ✓ Available |
| minicpm-v:latest | 5.5 GB | ✓ Available |

## 4. Complete Lifecycle Workflows

### 4.1 Quick Start (GPU Mode)

Execution context:

```bash
cd infra/ollama/docker
```

Start GPU Ollama runtime with all 11 models immediately available:

```bash
docker compose --env-file ollama-gpu.env -f compose.gpu.yaml up -d --build --wait --wait-timeout 180
```

Verify all models are accessible:

```bash
docker compose --env-file ollama-gpu.env -f compose.gpu.yaml exec -T ollama ollama list
```

Verify bidirectional R/W mount:

```bash
docker compose --env-file ollama-gpu.env -f compose.gpu.yaml exec -T ollama bash -c "mount | grep models"
```

Check API health:

```bash
curl -fsS http://localhost:11435/api/tags
```

### 4.2 Switch to CPU Mode (Runtime Mode Change)

Stop GPU container:

```bash
docker compose --env-file ollama-gpu.env -f compose.gpu.yaml down
```

Start CPU container (models remain accessible on host):

```bash
docker compose --env-file ollama-cpu.env -f compose.cpu.yaml up -d --build --wait --wait-timeout 180
```

Verify all models are still accessible:

```bash
docker compose --env-file ollama-cpu.env -f compose.cpu.yaml exec -T ollama ollama list
```

### 4.3 Complete Removal (Containers, Images, Volumes)

Execution context:

```bash
cd infra/ollama/docker
```

**Remove GPU stack completely:**

```bash
docker compose --env-file ollama-gpu.env -f compose.gpu.yaml down -v --remove-orphans
```

**Remove CPU stack completely:**

```bash
docker compose --env-file ollama-cpu.env -f compose.cpu.yaml down -v --remove-orphans
```

**Remove Ollama images:**

```bash
docker rmi -f $(docker images --filter "reference=ollama/*" -q)
```

**Remove Ollama volumes (if any):**

```bash
docker volume ls --filter "name=*ollama*" -q | xargs -r docker volume rm -f
```

**Verify complete removal:**

```bash
docker ps -a --filter "name=ollama*"
docker images --filter "reference=ollama*"
docker volume ls --filter "name=*ollama*"
```

### 4.4 Rebuild and Cleanup Checklist (Repo-wide)

Execution context for this section:

```bash
cd model-box
```

Use this checklist when you need a clean rebuild of all containers in this repository and want to remove unwanted Docker artifacts (images, volumes, networks, and build cache).

#### Step 1: Remove all stacks

- [ ] Stop and remove performance stack (containers, volumes, orphans):

```bash
docker compose -f infra/performance/infra-gatling/docker/compose.performance.yaml down -v --remove-orphans
```

- [ ] Stop and remove Ollama GPU stack (containers, volumes, orphans):

```bash
docker compose --env-file infra/ollama/docker/ollama-gpu.env -f infra/ollama/docker/compose.gpu.yaml down -v --remove-orphans
```

- [ ] Stop and remove Ollama CPU stack (containers, volumes, orphans):

```bash
docker compose --env-file infra/ollama/docker/ollama-cpu.env -f infra/ollama/docker/compose.cpu.yaml down -v --remove-orphans
```

#### Step 2: Remove images and cleanup

- [ ] Remove all Ollama images:

```bash
docker rmi -f $(docker images --filter "reference=ollama/*" -q) 2>/dev/null
```

- [ ] Remove all Gatling images:

```bash
docker rmi -f $(docker images --filter "reference=*gatling*" -q) 2>/dev/null
```

- [ ] Remove all report images:

```bash
docker rmi -f $(docker images --filter "reference=*report*" -q) 2>/dev/null
```

- [ ] Remove unused containers:

```bash
docker container prune -f
```

- [ ] Remove dangling images:

```bash
docker image prune -f
```

- [ ] Remove unused volumes:

```bash
docker volume prune -f
```

- [ ] Remove unused networks:

```bash
docker network prune -f
```

- [ ] Remove BuildKit cache:

```bash
docker buildx prune -a -f
```

#### Step 3: Rebuild all stacks

- [ ] Rebuild and start Ollama GPU stack:

```bash
docker compose --env-file infra/ollama/docker/ollama-gpu.env -f infra/ollama/docker/compose.gpu.yaml up -d --build --wait --wait-timeout 180
```

- [ ] Rebuild and start Ollama CPU stack (optional, for testing):

```bash
docker compose --env-file infra/ollama/docker/ollama-cpu.env -f infra/ollama/docker/compose.cpu.yaml up -d --build --wait --wait-timeout 180
```

- [ ] Rebuild and start performance stack:

```bash
docker compose -f infra/performance/infra-gatling/docker/compose.performance.yaml up -d --build --wait --wait-timeout 180
```

#### Step 4: Verify all stacks

- [ ] Verify Ollama GPU stack is running:

```bash
docker compose --env-file infra/ollama/docker/ollama-gpu.env -f infra/ollama/docker/compose.gpu.yaml ps
```

- [ ] Verify all models are accessible:

```bash
docker compose --env-file infra/ollama/docker/ollama-gpu.env -f infra/ollama/docker/compose.gpu.yaml exec -T ollama ollama list
```

- [ ] Verify Ollama health (HTTP 200 expected):

```bash
curl -fsS http://localhost:11435/api/tags | head -c 100
```

- [ ] Verify performance stack is running:

```bash
docker compose -f infra/performance/infra-gatling/docker/compose.performance.yaml ps
```

- [ ] Verify report service health:

```bash
curl -fsS http://localhost:8080/ | head -c 100
```

- [ ] Remove unused containers:

```bash
docker container prune -f
```

- [ ] Remove unwanted images (dangling first, then all unused):

```bash
docker image prune -f
docker image prune -a -f
```

- [ ] Remove unused volumes:

```bash
docker volume prune -f
```

- [ ] Remove unused networks:

```bash
docker network prune -f
```

- [ ] Remove BuildKit/buildx cache:

```bash
docker buildx prune -a -f
docker builder prune -a -f
```

- [ ] Rebuild and start Ollama GPU stack:

```bash
docker compose --env-file infra/ollama/docker/ollama-gpu.env -f infra/ollama/docker/compose.gpu.yaml up -d --build
```

- [ ] Rebuild and start Ollama CPU stack:

```bash
docker compose --env-file infra/ollama/docker/ollama-cpu.env -f infra/ollama/docker/compose.cpu.yaml up -d --build
```

- [ ] Rebuild and start performance stack:

```bash
docker compose -f infra/performance/infra-gatling/docker/compose.performance.yaml up -d --build
```

- [ ] Verify both Ollama stacks are running:

```bash
docker compose --env-file infra/ollama/docker/ollama-gpu.env -f infra/ollama/docker/compose.gpu.yaml ps
docker compose --env-file infra/ollama/docker/ollama-cpu.env -f infra/ollama/docker/compose.cpu.yaml ps
docker compose -f infra/performance/infra-gatling/docker/compose.performance.yaml ps
```

- [ ] Verify runtime health:

```bash
curl -fsS http://localhost:11435/api/tags
curl -fsS http://localhost:8080/
```

GPU mode note:

1. Use `compose.gpu.yaml` when the host has NVIDIA Container Toolkit configured.
2. Use `compose.cpu.yaml` as the fallback when GPU access is unavailable or not desired.

Optional aggressive cleanup (global):

```bash
docker system prune -a --volumes -f
```

Use the aggressive cleanup only when you intentionally want to remove all unused Docker resources on the machine, not only resources related to this repository.

## 5. Bulk Model Lifecycle Operations

### 5.1 PowerShell

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

### 5.2 Linux/macOS

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

## 6. Model Version Governance

1. Re-run `ollama pull <model:tag>` to refresh the same tag.
2. Prefer pinned tags (`:7b`, `:3b`, `:e4b`) for reproducibility.
3. Use `:latest` only when rolling updates are acceptable.

## 7. Exposure policy

1. Default exposure is localhost-only (`127.0.0.1`) for safer development.
2. For LAN access, set `COMPOSE_BIND_IP=0.0.0.0` in `.env` and restart.

## 8. Runtime user policy

1. All Compose services in this repository must run as non-root users.
2. Root user runtime (`0:0`) is forbidden for steady-state service execution.
3. When adding a new service, define an explicit non-root `user` mapping in Compose.

Current UID:GID mappings:

| Stack | Service | UID:GID |
|---|---|---|
| `infra/ollama/docker/compose.ollama.yaml` | `ollama` | `10001:10001` |
| `infra/performance/infra-gatling/docker/compose.performance.yaml` | `gatling-service` | `1500:1500` |
| `infra/performance/infra-gatling/docker/compose.performance.yaml` | `report-service` | `10002:10002` |
