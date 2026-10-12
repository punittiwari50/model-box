# Docker Compose Deployment Guide

Comprehensive step-by-step procedure for deploying ModelBox Docker Compose stacks.

Execution policy: Procedures are tool-neutral and executable from standard PowerShell or Bash shells.

---

## 1. Prerequisites

Before spinning up any container stack, verify host prerequisites:

1. **Docker Engine & Docker Compose v2**:
   ```bash
   docker --version
   docker compose version
   ```
2. **GPU Acceleration (Optional, for GPU stacks)**:
   - NVIDIA Driver installed.
   - NVIDIA Container Toolkit configured (`nvidia-smi` accessible inside containers).
   ```bash
   docker run --rm --gpus all nvidia/cuda:12.0.0-base-ubuntu22.04 nvidia-smi
   ```
3. **Shared External Network**:
   All ModelBox parent compose files require the shared bridge network `model-box-net`.
   ```bash
   docker network create model-box-net
   ```
   *(The automated orchestrator scripts create this network automatically if missing).*

---

## 2. Automated Deployment (Recommended)

ModelBox includes repository-wide orchestration scripts that discover stacks, create networks, apply environment files, and start services in order.

Run from repository root (`model-box/`):

### 2.1 PowerShell (Windows)

```powershell
# 1. Spin up all discovered stacks (Build and Up)
.\infra\scripts\Deploy-All-Compose.ps1

# 2. Spin up specific stack(s)
.\infra\scripts\Deploy-All-Compose.ps1 -Stacks 'ollama'
.\infra\scripts\Deploy-All-Compose.ps1 -Stacks 'comfyui'
.\infra\scripts\Deploy-All-Compose.ps1 -Stacks 'connectors'
.\infra\scripts\Deploy-All-Compose.ps1 -Stacks 'performance'

# 3. Check status of all stacks
.\infra\scripts\Deploy-All-Compose.ps1 -Action Status

# 4. View logs across stacks
.\infra\scripts\Deploy-All-Compose.ps1 -Action Logs -FollowLogs

# 5. Teardown all stacks
.\infra\scripts\Deploy-All-Compose.ps1 -Action Down
```

### 2.2 Linux / macOS (Bash)

```bash
# 1. Spin up all discovered stacks
./infra/scripts/Deploy-All-Compose.sh

# 2. Spin up specific stack(s)
./infra/scripts/Deploy-All-Compose.sh --stack ollama
./infra/scripts/Deploy-All-Compose.sh --stack comfyui
./infra/scripts/Deploy-All-Compose.sh --stack connectors
./infra/scripts/Deploy-All-Compose.sh --stack performance

# 3. Check status
./infra/scripts/Deploy-All-Compose.sh --action Status

# 4. Teardown all stacks
./infra/scripts/Deploy-All-Compose.sh --action Down
```

---

## 3. Step-by-Step Manual Deployment

To run parent-level compose entrypoints manually from the repository root:

### Step 1: Ensure External Network Exists

```bash
docker network inspect model-box-net >/dev/null 2>&1 || docker network create model-box-net
```

### Step 2: Spin Up Ollama Stack

- **GPU Mode**:
  ```bash
  docker compose --env-file infra/compose/ollama-gpu.env -f infra/compose/compose.ollama.gpu.yaml up -d --build --wait --wait-timeout 180
  ```
- **CPU Mode**:
  ```bash
  docker compose --env-file infra/compose/ollama-cpu.env -f infra/compose/compose.ollama.cpu.yaml up -d --build --wait --wait-timeout 180
  ```

### Step 3: Spin Up ComfyUI Stack

- **GPU Mode**:
  ```bash
  docker compose --env-file infra/compose/comfyui-gpu.env -f infra/compose/compose.comfyui.gpu.yaml up -d --build --wait --wait-timeout 240
  ```
- **CPU Mode**:
  ```bash
  docker compose --env-file infra/compose/comfyui-cpu.env -f infra/compose/compose.comfyui.cpu.yaml up -d --build --wait --wait-timeout 240
  ```

### Step 4: Spin Up Model Connectors Stack
*(Deploys HashiCorp Vault, PostgreSQL, FastAPI Backend, React UI, and Playwright MCP Engine)*

```bash
docker compose -f infra/compose/compose.connectors.yaml up -d --build
```

### Step 5: Spin Up Performance Stack (Optional)
*(Deploys Gatling load simulation engine and Gatling reporting server)*

```bash
docker compose --env-file infra/compose/performance.env -f infra/compose/compose.performance.yaml up -d --build --wait --wait-timeout 180
```

---

## 4. Decoupled Host Volume Storage Architecture

ModelBox follows a decoupled storage model where each runtime manages its own dedicated volume without cross-service dependencies:

- **ComfyUI Host Storage**:
  - Root: `C:\DEV\WSB\CONFIG\volume\volume-docker_comfyui` (mounted to `/data/comfyui` inside ComfyUI)
  - Workflows: `C:\DEV\WSB\CONFIG\volume\volume-docker_comfyui\workflows`
- **Ollama Host Storage**:
  - Root: `C:\DEV\WSB\CONFIG\volume\volume-docker_ollama` (mounted to `/models` inside Ollama)

### 4.1 ComfyUI Environment Configuration (`comfyui-gpu.env` / `comfyui-cpu.env`):
```env
COMPOSE_COMFYUI_VOLUME_HOST=C:\DEV\WSB\CONFIG\volume\volume-docker_comfyui
COMPOSE_COMFYUI_WORKFLOWS_HOST=C:\DEV\WSB\CONFIG\volume\volume-docker_comfyui\workflows
```

### 4.2 Ollama Environment Configuration (`ollama-gpu.env` / `ollama-cpu.env`):
```env
COMPOSE_OLLAMA_MODELS_HOST=C:\DEV\WSB\CONFIG\volume\volume-docker_ollama
COMPOSE_OLLAMA_MODELS_CONTAINER=/models
```

---

## 5. Port Map and Service Health Verification

| Service | Port | Health Check / Verification Command |
|---|---|---|
| **Ollama API** | `11435` | `curl -fsS http://localhost:11435/api/tags` |
| **ComfyUI Web Interface** | `8189` | `curl -fsS http://localhost:8189/` |
| **Model Connectors API** | `8000` | `curl -fsS http://localhost:8000/health` |
| **Model Connectors UI** | `3000` | `curl -fsS http://localhost:3000/` |
| **Playwright MCP Engine** | `8940` | `curl -fsS http://localhost:8940/health` |
| **Playwright noVNC Stream** | `6080` | Open `http://localhost:6080/vnc.html` in browser |
| **HashiCorp Vault** | `8200` | `curl -fsS http://localhost:8200/v1/sys/health` |
| **PostgreSQL Database** | `5432` | `docker exec -it model-connectors-postgres pg_isready` |
| **Gatling Report Server** | `8080` | `curl -fsS http://localhost:8080/` |

---

## 6. Teardown and Cleanup Procedures

### 6.1 Graceful Teardown

```bash
docker compose -f infra/compose/compose.connectors.yaml down
docker compose --env-file infra/compose/comfyui-gpu.env -f infra/compose/compose.comfyui.gpu.yaml down
docker compose --env-file infra/compose/ollama-gpu.env -f infra/compose/compose.ollama.gpu.yaml down
docker compose --env-file infra/compose/performance.env -f infra/compose/compose.performance.yaml down
```

### 6.2 Deep Teardown with Volumes and Orphan Removal

```bash
docker compose -f infra/compose/compose.connectors.yaml down -v --remove-orphans
docker compose --env-file infra/compose/comfyui-gpu.env -f infra/compose/compose.comfyui.gpu.yaml down -v --remove-orphans
docker compose --env-file infra/compose/ollama-gpu.env -f infra/compose/compose.ollama.gpu.yaml down -v --remove-orphans
docker compose --env-file infra/compose/performance.env -f infra/compose/compose.performance.yaml down -v --remove-orphans
docker network rm model-box-net
```
