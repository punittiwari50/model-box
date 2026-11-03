# Docker Operations for Ollama

> **Consolidated Master Guide**: For complete, unified clean build, rebuild, volume mount, and lifecycle operations across **both Ollama and ComfyUI**, see the master document:  
> 👉 [**Docker Compose Deployment Master Guide**](./docker-compose-deployment-guide.md)

Execution policy: all steps in this guide are direct terminal procedures and are tool-neutral.
They apply equally to human operators, scripted automation, and AI-assisted workflows.

---

## 1. Execution Context

**Execute all commands directly from the parent Git repository project root (`model-box`)**:

```bash
# If navigating from an external terminal or parent workspace folder:
cd model-box
```

Do not `cd` into subfolders like `infra/ollama/docker` for steady-state operations. Running directly from the parent repository root guarantees consistent relative path resolution across all services, scripts, and shared networks.

### Authoritative references:
- [Ollama Docker Hub image](https://hub.docker.com/r/ollama/ollama)
- [Ollama official site](https://ollama.com)
- [Docker Compose Deployment Master Guide](./docker-compose-deployment-guide.md)

### Compose Path Conventions from Repository Root:
ModelBox provides two equivalent, fully supported ways to run Ollama Compose commands from the parent repository root:

1. **Parent-Level Compose Entrypoints (Recommended):**
   - **GPU Mode:** `docker compose --env-file infra/compose/ollama-gpu.env -f infra/compose/compose.ollama.gpu.yaml <action>`
   - **CPU Mode:** `docker compose --env-file infra/compose/ollama-cpu.env -f infra/compose/compose.ollama.cpu.yaml <action>`
2. **Subsystem Direct Entrypoints:**
   - **GPU Mode:** `docker compose --env-file infra/ollama/docker/ollama-gpu.env -f infra/ollama/docker/compose.gpu.yaml <action>`
   - **CPU Mode:** `docker compose --env-file infra/ollama/docker/ollama-cpu.env -f infra/ollama/docker/compose.cpu.yaml <action>`

### Environment Strategy:
1. `.env` is for Compose interpolation values (host paths, ports, container limits, image).
2. `ollama.env` is the legacy single-stack runtime file.
3. `ollama-gpu.env` and `ollama-cpu.env` are the mode-specific runtime files (available in both `infra/compose/` and `infra/ollama/docker/`).
4. Always pass the matching `--env-file` with the corresponding compose file to ensure path variables are resolved accurately.
5. Initialize local interpolation file from the repository root:
   ```bash
   cp infra/ollama/docker/.env.example infra/ollama/docker/.env
   ```
6. Ensure shared external bridge network exists:
   ```bash
   docker network inspect model-box-net >/dev/null 2>&1 || docker network create model-box-net
   ```

### Relative Path Resolution & Persistence:
1. Canonical host model repository is configured via `COMPOSE_OLLAMA_MODELS_HOST` (Default: `C:\DEV\WSB\CONFIG\volume\volume-docker_ollama`).
2. Both `ollama-gpu.env` and `ollama-cpu.env` point to the identical host model path, ensuring all 11 models remain accessible when switching between CPU and GPU runtimes.
3. When downloading models inside the container (e.g. `ollama pull qwen3:8b`), they are written directly to the host volume and persist across container deletions and rebuilds.

### Mount Behavior Matrix:

| Mount Type | Host Source | Container Target | Behavior | Typical Use |
| :--- | :--- | :--- | :--- | :--- |
| **Bidirectional Bind Mount** | `${COMPOSE_OLLAMA_MODELS_HOST}` | `/models` | Read-Write | Default Ollama models and manifest persistence |
| **Host Read-Only Bind** | `./data` | `/workspace:ro` | Read-Only | Static assets or immutable reference data |
| **Container Rootfs Read-Only** | `read_only: true` | `/` | Read-Only | Restricted runtimes (not recommended for Ollama) |

---

## 2. Runtime Baseline Defaults

| Purpose | Setting | Default | Scope |
| :--- | :--- | :--- | :--- |
| **Image Pinning** | `COMPOSE_OLLAMA_IMAGE` | `ollama/ollama:latest` | Container Image |
| **Host Bind Scope** | `COMPOSE_BIND_IP` | `127.0.0.1` | Localhost only |
| **Host API Port** | `COMPOSE_HOST_PORT` | `11435` | Host listener |
| **Container API Port** | `COMPOSE_CONTAINER_PORT` | `11434` | Internal service port |
| **Model Storage Source** | `COMPOSE_OLLAMA_MODELS_HOST` | `C:\DEV\WSB\CONFIG\volume\volume-docker_ollama` | Host directory |
| **Model Mount Target** | `COMPOSE_OLLAMA_MODELS_CONTAINER` | `/models` | Internal mount |
| **CPU Limit** | `COMPOSE_CPUS` | `6` (CPU) / `8` (GPU) | Resource ceiling |
| **Memory Limit** | `COMPOSE_MEM_LIMIT` | `20g` – `24g` | Maximum RAM |
| **Shared Memory** | `COMPOSE_SHM_SIZE` | `2g` | IPC shared memory |

---

## 2a. Ollama Runtime Properties (CPU Mode)

CPU-only mode is used when GPU is unavailable or for validation runs. Uses `ollama-cpu.env`.

| Property | Purpose | Available Values | Default | Mode |
| :--- | :--- | :--- | :--- | :--- |
| `OLLAMA_HOST` | Network interface and port binding | `0.0.0.0:11434`, `127.0.0.1:11434` | `0.0.0.0:11434` | CPU/GPU |
| `OLLAMA_MODELS` | Container path for model storage | `/models`, `/mnt/models` | `/models` | CPU/GPU |
| `OLLAMA_NO_CLOUD` | Disable Ollama cloud integration | `true`, `false` | `true` | CPU/GPU |
| `OLLAMA_NUM_PARALLEL` | Concurrent model load threads | `1`, `2`, `4`, `8` | `2` | CPU/GPU |
| `OLLAMA_MAX_LOADED_MODELS` | Max models in memory simultaneously | `1`, `2`, `4` | `1` | CPU/GPU |
| `OLLAMA_MAX_QUEUE` | Request queue limit | `32`, `64`, `128`, `256` | `128` | CPU/GPU |
| `OLLAMA_CONTEXT_LENGTH` | Token context window | `2048`, `4096`, `8192`, `16384` | `8192` | CPU/GPU |
| `OLLAMA_KEEP_ALIVE` | Model memory retention time | `5m`, `10m`, `30m`, `1h`, `-1` | `10m` | CPU/GPU |
| `COMPOSE_CPUS` | CPU limit for container | `2`, `4`, `6`, `8`, `12` | `6` | CPU/GPU |
| `COMPOSE_MEM_LIMIT` | Memory limit for container | `8g`, `16g`, `24g`, `32g` | `24g` | CPU/GPU |
| `COMPOSE_SHM_SIZE` | Shared memory for IPC | `1g`, `2g`, `4g` | `2g` | CPU/GPU |

---

## 2b. Ollama Runtime Properties (GPU Mode)

GPU-accelerated mode requires NVIDIA Container Toolkit on host. Uses `ollama-gpu.env`.

| Property | Purpose | Available Values | Default | Mode |
| :--- | :--- | :--- | :--- | :--- |
| `OLLAMA_HOST` | Network interface and port binding | `0.0.0.0:11434`, `127.0.0.1:11434` | `0.0.0.0:11434` | CPU/GPU |
| `OLLAMA_MODELS` | Container path for model storage | `/models`, `/mnt/models` | `/models` | CPU/GPU |
| `OLLAMA_NO_CLOUD` | Disable Ollama cloud integration | `true`, `false` | `true` | CPU/GPU |
| `OLLAMA_NUM_PARALLEL` | Concurrent model load threads | `1`, `2`, `4`, `8` | `4` | CPU/GPU |
| `OLLAMA_MAX_LOADED_MODELS` | Max models in memory simultaneously | `1`, `2`, `4` | `2` | CPU/GPU |
| `OLLAMA_MAX_QUEUE` | Request queue limit | `32`, `64`, `128`, `256` | `256` | CPU/GPU |
| `OLLAMA_CONTEXT_LENGTH` | Token context window | `4096`, `8192`, `16384`, `32768` | `32768` | CPU/GPU |
| `OLLAMA_KEEP_ALIVE` | Model memory retention time | `5m`, `10m`, `30m`, `1h`, `-1` | `30m` | CPU/GPU |
| `COMPOSE_CPUS` | CPU limit for container | `4`, `6`, `8`, `12` | `8` | CPU/GPU |
| `COMPOSE_MEM_LIMIT` | Memory limit for container | `16g`, `20g`, `24g`, `32g` | `20g` | CPU/GPU |
| `NVIDIA_VISIBLE_DEVICES` | GPU device visibility | `0`, `1`, `all` | `all` | GPU only |
| `NVIDIA_DRIVER_CAPABILITIES`| GPU driver capabilities required | `compute,utility,graphics` | `compute,utility,graphics`| GPU only |
| `CUDA_VISIBLE_DEVICES` | CUDA index | `0`, `1` | `0` | GPU only |

### Security and Reliability Defaults (Both Modes):
1. `init: true` enabled to prevent zombie processes.
2. `no-new-privileges:true` enforced.
3. Linux capabilities dropped via `cap_drop: [ALL]`.
4. `pids_limit` set to `1024`.
5. `nofile` ulimit set to `65536`.
6. Non-blocking logging with bounded memory buffer.

---

<a id="4-complete-lifecycle-workflows"></a>
## 3. Operational Command Catalog (Run from `model-box/` Root)

All commands below are executed from the **parent git repository root (`model-box/`)**:

| Operational Goal | Exact Command (From Repository Root) | Expected Output / State |
| :--- | :--- | :--- |
| **Start GPU Runtime** | `docker compose --env-file infra/compose/ollama-gpu.env -f infra/compose/compose.ollama.gpu.yaml up -d --wait` | GPU service started and healthy |
| **Start CPU Runtime** | `docker compose --env-file infra/compose/ollama-cpu.env -f infra/compose/compose.ollama.cpu.yaml up -d --wait` | CPU service started and healthy |
| **Clean Build GPU (No-Cache)** | `docker compose --env-file infra/compose/ollama-gpu.env -f infra/compose/compose.ollama.gpu.yaml build --no-cache` | Clean image layers generated |
| **Clean Build CPU (No-Cache)** | `docker compose --env-file infra/compose/ollama-cpu.env -f infra/compose/compose.ollama.cpu.yaml build --no-cache` | Clean image layers generated |
| **Stop GPU Runtime** | `docker compose --env-file infra/compose/ollama-gpu.env -f infra/compose/compose.ollama.gpu.yaml down` | Containers and stack removed |
| **Stop CPU Runtime** | `docker compose --env-file infra/compose/ollama-cpu.env -f infra/compose/compose.ollama.cpu.yaml down` | Containers and stack removed |
| **Deep Teardown (Orphans/Volumes)** | `docker compose --env-file infra/compose/ollama-gpu.env -f infra/compose/compose.ollama.gpu.yaml down -v --remove-orphans` | Containers, volumes, and orphans removed |
| **Check Runtime Status** | `docker compose --env-file infra/compose/ollama-gpu.env -f infra/compose/compose.ollama.gpu.yaml ps` | Container state, health, port `11435` |
| **Stream Live Logs** | `docker compose --env-file infra/compose/ollama-gpu.env -f infra/compose/compose.ollama.gpu.yaml logs -f ollama` | Real-time NDJSON logs |
| **Health Check (cURL)** | `curl -fsS http://localhost:11435/api/tags` | JSON array of installed model tags |
| **Health Check (PowerShell)** | `(Invoke-WebRequest -UseBasicParsing http://localhost:11435/api/tags).StatusCode` | Returns status code `200` |
| **List Installed Models** | `docker compose --env-file infra/compose/ollama-gpu.env -f infra/compose/compose.ollama.gpu.yaml exec -T ollama ollama list` | Tabular list of 11 loaded models |
| **Pull New Model** | `docker compose --env-file infra/compose/ollama-gpu.env -f infra/compose/compose.ollama.gpu.yaml exec -T ollama ollama pull llama3.2:latest` | Downloads & saves to host volume |
| **Remove Model Tag** | `docker compose --env-file infra/compose/ollama-gpu.env -f infra/compose/compose.ollama.gpu.yaml exec -T ollama ollama rm deepseek-r1:7b` | Model deleted from host volume |

---

## 3a. One-Click Repository Orchestration (From Root)

For automated stack discovery, network creation, and clean rebuilds across Ollama, ComfyUI, and Connectors, execute the orchestrator script directly from the repository root:

### Windows PowerShell:
```powershell
# Clean build and launch Ollama stack only
.\infra\scripts\Deploy-All-Compose.ps1 -Action BuildAndUp -Stacks 'ollama' -CleanRecreate -NoCache -Wait

# Standard start for Ollama
.\infra\scripts\Deploy-All-Compose.ps1 -Stacks 'ollama'

# Check status across all stacks
.\infra\scripts\Deploy-All-Compose.ps1 -Action Status

# Stream logs across all stacks
.\infra\scripts\Deploy-All-Compose.ps1 -Action Logs -FollowLogs

# Stop Ollama stack
.\infra\scripts\Deploy-All-Compose.ps1 -Action Down -Stacks 'ollama'
```

### Linux / macOS Bash:
```bash
# Clean build and launch Ollama stack only
./infra/scripts/Deploy-All-Compose.sh --action BuildAndUp --stack ollama --clean-recreate --no-cache --wait

# Standard start for Ollama
./infra/scripts/Deploy-All-Compose.sh --stack ollama

# Check status across all stacks
./infra/scripts/Deploy-All-Compose.sh --action Status

# Stop Ollama stack
./infra/scripts/Deploy-All-Compose.sh --action Down --stack ollama
```

---

## 4. Current Available Models Inventory

The persistent host storage repository (`C:\DEV\WSB\CONFIG\volume\volume-docker_ollama`) currently houses 11 pre-installed models:

| Model Tag | Disk Footprint | Primary Capability / Architecture |
| :--- | :--- | :--- |
| `tinyllama:latest` | 637 MB | Ultra-lightweight local testing & CPU fallback |
| `qwen3:8b` | 5.2 GB | Advanced reasoning and dialogue |
| `llama3.1:8b` | 4.9 GB | General language instruction & story scripting |
| `qwen3-coder:latest` | 18 GB | Full code synthesis and AST transformation |
| `gemma4:e4b` | 9.6 GB | Google DeepMind multimodal reasoning |
| `phi4:latest` | 9.1 GB | High-accuracy synthetic logic and mathematics |
| `llama3.2-vision:latest` | 7.8 GB | Multimodal visual captioning & scene analysis |
| `nemotron3:33b` | 27 GB | NVIDIA enterprise high-capacity generation |
| `qwen2.5vl:3b` | 3.2 GB | Lightweight vision-language model |
| `deepseek-r1:7b` | 4.7 GB | DeepSeek reasoning & chain-of-thought |
| `minicpm-v:latest` | 5.5 GB | Mobile-efficient visual comprehension |

---

## 5. Runbook and Policy Extensions

- [**Docker Compose Deployment Master Guide**](./docker-compose-deployment-guide.md) — Single consolidated master guide for clean builds, GPU/CPU mode switching, volume mounts, and complete teardown for **Ollama** and **ComfyUI**.
- [**Docker Operations Runbook**](./docker-operations-runbook.md) — Extended operational checklists and lifecycle policies.
- [**Ollama Endpoints Guide**](./ollama-endpoints.md) — API request/response templates and model parameter mapping.
