# Docker Operations for Ollama

Execution policy: all steps in this guide are direct terminal procedures and are tool-neutral.
They apply equally to human operators, scripted automation, and AI-assisted workflows.

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
5. Canonical host model repository: configured via `COMPOSE_OLLAMA_MODELS_HOST`.
6. Keep the same host path in `compose.ollama.yaml`, `compose.gpu.yaml`, `compose.cpu.yaml`, `ollama.env`, `ollama-gpu.env`, `ollama-cpu.env`, `.env.example`, and `.env`.
7. Use `ollama-gpu.env` for GPU mode and `ollama-cpu.env` for CPU-only mode; both reference the same host model path.
7. The host volume is consolidated into a single root manifest tree; all 11 available models are discoverable via `ollama list` in both CPU and GPU containers.
8. When pulling new models through the container (e.g., `ollama pull qwen3:8b`), they are persisted to the host volume and remain visible across container restarts and mode switches (CPU ↔ GPU).

Mount behavior matrix:

| Mount type | Example | Host side | Container side | Typical use |
|---|---|---|---|---|
| Bind mount, read-write (bidirectional) | `${COMPOSE_OLLAMA_MODELS_HOST}:/models` | Writable | Writable | Default Ollama data and model persistence |
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
| Model data storage source | `COMPOSE_OLLAMA_MODELS_HOST` | configured per host |
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

## 3a. One-click repo orchestration

Use the repository-level orchestrator when you want one PowerShell entry point that discovers and manages all Compose stacks across the repo.

A Linux Bash entry point is available for non-PowerShell environments.

Execution context:

```powershell
# Run from the project root itself
./infra/scripts/Deploy-All-Compose.ps1
```

```bash
# Run from the project root itself (Linux/macOS)
./infra/scripts/Deploy-All-Compose.sh
```

Default behavior:

- Starts all discovered Compose files under the repo by building and then bringing them up
- Logs the exact docker command used for each stack before execution
- Writes detailed operational logs to `infra/logs/docker-compose-orchestrator-<timestamp>.log`
- Produces a final summary table showing the result of each stack execution
- Supports selective execution with `-Stacks` and actions such as `Up`, `Down`, `Build`, `BuildAndUp`, `Status`, `Logs`, and `Config`

Common examples:

```powershell
# Default: start all stacks
./infra/scripts/Deploy-All-Compose.ps1

# Only Ollama stacks
./infra/scripts/Deploy-All-Compose.ps1 -Stacks 'ollama'

# Only performance stack
./infra/scripts/Deploy-All-Compose.ps1 -Stacks 'performance'

# Build and then start all stacks
./infra/scripts/Deploy-All-Compose.ps1 -Action BuildAndUp -Build

# Stop everything
./infra/scripts/Deploy-All-Compose.ps1 -Action Down

# Stream logs for all stacks
./infra/scripts/Deploy-All-Compose.ps1 -Action Logs -FollowLogs
```

```bash
# Default: start all stacks
./infra/scripts/Deploy-All-Compose.sh

# Only Ollama stacks
./infra/scripts/Deploy-All-Compose.sh --stack ollama

# Only performance stack
./infra/scripts/Deploy-All-Compose.sh --stack performance

# Build and then start all stacks
./infra/scripts/Deploy-All-Compose.sh --action BuildAndUp --build

# Stop everything
./infra/scripts/Deploy-All-Compose.sh --action Down

# Stream logs for all stacks
./infra/scripts/Deploy-All-Compose.sh --action Logs --follow-logs
```

Use the single orchestrator for repo-wide operations and keep direct compose commands for stack-specific troubleshooting or precise runtime validation.

## 4. Runbook and Policy Extensions

The deep operational procedures were moved to a dedicated runbook to keep this core document concise and standards-focused.

- [Docker Operations Runbook](./docker-operations-runbook.md)

Use the runbook for the following workflows:

1. Quick start and mode switching (GPU and CPU).
2. Complete teardown and cleanup workflows.
3. Repo-wide rebuild and verification checklist.
4. Bulk model pull/update procedures (PowerShell and Linux/macOS).
5. Model version governance policy.
6. Exposure policy and runtime user policy.
