# Docker Operations Runbook

> **Consolidated Master Guide**: For complete, unified clean build, rebuild, volume mount, and lifecycle operations across **both Ollama and ComfyUI**, see the master document:  
> 👉 [**Docker Compose Deployment Master Guide**](./docker-compose-deployment-guide.md)

This runbook contains detailed operational procedures that extend [docker-operations.md](./docker-operations.md).

Execution policy: all procedures are tool-neutral and apply equally to human operators,
scripted automation, and AI-assisted workflows.

**Execution Context**: Run all commands directly from the **parent Git repository root (`model-box`)**:

```bash
cd model-box
```

---

## 1. Ollama Operations & Runtime Mode Switching (From `model-box/` Root)

### Step 0: Ensure Required Shared Network Exists
All ModelBox stacks communicate over the external `model-box-net` bridge network:

```bash
# Bash / Linux / macOS
docker network inspect model-box-net >/dev/null 2>&1 || docker network create model-box-net
```

```powershell
# PowerShell (Windows)
if (-not (docker network ls --filter name=^model-box-net$ -q)) { docker network create model-box-net }
```

### 1.1 Quick Start (GPU Mode)

Start GPU runtime:
```bash
docker compose --env-file infra/compose/ollama-gpu.env -f infra/compose/compose.ollama.gpu.yaml up -d --wait --wait-timeout 180
```

Verify model inventory:
```bash
docker compose --env-file infra/compose/ollama-gpu.env -f infra/compose/compose.ollama.gpu.yaml exec -T ollama ollama list
```

Verify mount visibility:
```bash
docker compose --env-file infra/compose/ollama-gpu.env -f infra/compose/compose.ollama.gpu.yaml exec -T ollama bash -lc "mount | grep models"
```

Verify API health:
```bash
curl -fsS http://localhost:11435/api/tags
```

---

### 1.2 Switch to CPU Mode

Stop GPU runtime:
```bash
docker compose --env-file infra/compose/ollama-gpu.env -f infra/compose/compose.ollama.gpu.yaml down
```

Start CPU runtime:
```bash
docker compose --env-file infra/compose/ollama-cpu.env -f infra/compose/compose.ollama.cpu.yaml up -d --build --wait --wait-timeout 180
```

Verify model inventory remains available:
```bash
docker compose --env-file infra/compose/ollama-cpu.env -f infra/compose/compose.ollama.cpu.yaml exec -T ollama ollama list
```

---

## 2. ComfyUI Container Step-by-Step Operations (From `model-box/` Root)

### Step 2.0: Environment Initialization & Template Setup

Initialize the ComfyUI interpolation environment file from the template if not already present:
```bash
# Linux / macOS / Git Bash
cp infra/comfyui/docker/.env.example infra/comfyui/docker/.env
```
```powershell
# PowerShell (Windows)
Copy-Item infra/comfyui/docker/.env.example infra/comfyui/docker/.env
```

> **Compose Entrypoints:** You can execute ComfyUI either via the parent compose entrypoint (`infra/compose/compose.comfyui.gpu.yaml` with `infra/compose/comfyui-gpu.env`) or directly via subsystem compose (`infra/comfyui/docker/compose.gpu.yaml` with `infra/comfyui/docker/comfyui-gpu.env`). The parent-level entrypoints are recommended when executing from repository root.

---

### 2.1 GPU Runtime Clean Build & Launch (Step by Step)

#### Step 1: Teardown existing ComfyUI containers
```bash
docker compose --env-file infra/compose/comfyui-gpu.env -f infra/compose/compose.comfyui.gpu.yaml down --remove-orphans
docker builder prune -f
```

#### Step 2: Build ComfyUI GPU image with `--no-cache`
```bash
docker compose --env-file infra/compose/comfyui-gpu.env -f infra/compose/compose.comfyui.gpu.yaml build --no-cache
```

#### Step 3: Launch ComfyUI GPU runtime and wait for healthy startup
```bash
docker compose --env-file infra/compose/comfyui-gpu.env -f infra/compose/compose.comfyui.gpu.yaml up -d --wait --wait-timeout 240
```

#### Step 4: Verify ComfyUI Web Studio and GPU acceleration
```bash
# 1. Verify ComfyUI Web Studio responds with HTTP 200 OK
curl -fsS http://localhost:8189/ >/dev/null && echo "ComfyUI GPU Studio Online (Port 8189)"

# 2. Inspect ComfyUI system stats and GPU VRAM allocation
curl -fsS http://localhost:8189/system_stats

# 3. Verify CUDA acceleration and PyTorch device inside the running container
docker compose --env-file infra/compose/comfyui-gpu.env -f infra/compose/compose.comfyui.gpu.yaml exec -T comfyui python3 -c "import torch; print(f'CUDA Available: {torch.cuda.is_available()}, Device: {torch.cuda.get_device_name(0)}'); assert torch.cuda.is_available()"

# 4. Verify persistent host volume mounts and workflows directory
docker compose --env-file infra/compose/comfyui-gpu.env -f infra/compose/compose.comfyui.gpu.yaml exec -T comfyui ls -la /data/comfyui
docker compose --env-file infra/compose/comfyui-gpu.env -f infra/compose/compose.comfyui.gpu.yaml exec -T comfyui ls -la /data/comfyui/user/default/workflows
```

---

### 2.2 Switch to CPU Mode (Step by Step)

#### Step 1: Stop GPU runtime
```bash
docker compose --env-file infra/compose/comfyui-gpu.env -f infra/compose/compose.comfyui.gpu.yaml down
```

#### Step 2: Build & start CPU runtime
```bash
docker compose --env-file infra/compose/comfyui-cpu.env -f infra/compose/compose.comfyui.cpu.yaml up -d --build --wait --wait-timeout 240
```

#### Step 3: Verify ComfyUI CPU runtime
```bash
# Verify Web Studio HTTP endpoint
curl -fsS http://localhost:8189/ >/dev/null && echo "ComfyUI CPU Studio Online (Port 8189)"

# Verify PyTorch CPU environment
docker compose --env-file infra/compose/comfyui-cpu.env -f infra/compose/compose.comfyui.cpu.yaml exec -T comfyui python3 -c "import torch; print(f'PyTorch CPU Version: {torch.__version__}')"
```

---

### 2.3 Enabling PostgreSQL Metadata & Asset Profile (Step by Step)

ComfyUI includes an optional PostgreSQL 16 database profile with Apache AGE graph extensions for persistent asset metadata and node lineage:

#### Step 1: Launch ComfyUI with PostgreSQL Profile
```bash
docker compose --env-file infra/compose/comfyui-gpu.env -f infra/compose/compose.comfyui.gpu.yaml --profile postgres up -d --build --wait
```

#### Step 2: Verify PostgreSQL database health
```bash
docker compose --env-file infra/compose/comfyui-gpu.env -f infra/compose/compose.comfyui.gpu.yaml exec -T comfyui-postgres pg_isready -U comfyui -d comfyui
```

---

### 2.4 ComfyUI Dedicated Teardown & Artifact Cleanup

#### Safe Teardown (Preserves Checkpoints, Workflows & Output Data)
```bash
docker compose --env-file infra/compose/comfyui-gpu.env -f infra/compose/compose.comfyui.gpu.yaml down
```

#### Complete Purge of ComfyUI Containers, Networks & Images
```bash
docker compose --env-file infra/compose/comfyui-gpu.env -f infra/compose/compose.comfyui.gpu.yaml down -v --remove-orphans
docker rmi -f $(docker images --filter "reference=*comfyui*" -q) 2>/dev/null || true
```

---

## 3. Teardown and Cleanup (From `model-box/` Root)

### 3.1 Stop and Remove Ollama Stacks
```bash
# GPU stack
docker compose --env-file infra/compose/ollama-gpu.env -f infra/compose/compose.ollama.gpu.yaml down -v --remove-orphans

# CPU stack
docker compose --env-file infra/compose/ollama-cpu.env -f infra/compose/compose.ollama.cpu.yaml down -v --remove-orphans
```

### 3.2 Stop and Remove ComfyUI Stacks
```bash
# GPU stack
docker compose --env-file infra/compose/comfyui-gpu.env -f infra/compose/compose.comfyui.gpu.yaml down -v --remove-orphans

# CPU stack
docker compose --env-file infra/compose/comfyui-cpu.env -f infra/compose/compose.comfyui.cpu.yaml down -v --remove-orphans
```

### 3.3 Remove Container Images
```bash
docker rmi -f $(docker images --filter "reference=ollama/*" -q) 2>/dev/null || true
docker rmi -f $(docker images --filter "reference=*comfyui*" -q) 2>/dev/null || true
```

### 3.4 Remove Named Volumes
```bash
# Named volumes only (preserving host bind-mounted model and workflow files)
docker volume ls --filter "name=*ollama*" -q | xargs -r docker volume rm -f
docker volume ls --filter "name=*comfyui*" -q | xargs -r docker volume rm -f
```

### 3.5 Verify Teardown Status
```bash
docker ps -a --filter "name=ollama*" --filter "name=comfyui*"
docker images --filter "reference=ollama*" --filter "reference=*comfyui*"
docker volume ls --filter "name=*ollama*" --filter "name=*comfyui*"
```

---

## 4. Repo-wide Rebuild Checklist (From `model-box/` Root)

### 4.1 Remove stacks
```bash
# Performance stack
docker compose \
  --env-file infra/performance/infra-gatling/docker/.env \
  --env-file infra/performance/infra-gatling/docker/performance-local.env \
  -f infra/performance/infra-gatling/docker/compose.performance.yaml \
  down -v --remove-orphans

# Ollama stacks
docker compose --env-file infra/compose/ollama-gpu.env -f infra/compose/compose.ollama.gpu.yaml down -v --remove-orphans
docker compose --env-file infra/compose/ollama-cpu.env -f infra/compose/compose.ollama.cpu.yaml down -v --remove-orphans

# ComfyUI stacks
docker compose --env-file infra/compose/comfyui-gpu.env -f infra/compose/compose.comfyui.gpu.yaml down -v --remove-orphans
docker compose --env-file infra/compose/comfyui-cpu.env -f infra/compose/compose.comfyui.cpu.yaml down -v --remove-orphans
```

### 4.2 Cleanup resources
```bash
docker rmi -f $(docker images --filter "reference=ollama/*" -q) 2>/dev/null || true
docker rmi -f $(docker images --filter "reference=*comfyui*" -q) 2>/dev/null || true
docker rmi -f $(docker images --filter "reference=*gatling*" -q) 2>/dev/null || true
docker rmi -f $(docker images --filter "reference=*report*" -q) 2>/dev/null || true

docker container prune -f
docker image prune -f
docker volume prune -f
docker network prune -f
docker buildx prune -a -f
```

### 4.3 Rebuild stacks
```bash
# 1. Ollama GPU
docker compose --env-file infra/compose/ollama-gpu.env -f infra/compose/compose.ollama.gpu.yaml up -d --build --wait --wait-timeout 180

# 2. ComfyUI GPU
docker compose --env-file infra/compose/comfyui-gpu.env -f infra/compose/compose.comfyui.gpu.yaml up -d --build --wait --wait-timeout 240

# 3. Performance / Gatling
docker compose \
  --env-file infra/performance/infra-gatling/docker/.env \
  --env-file infra/performance/infra-gatling/docker/performance-local.env \
  -f infra/performance/infra-gatling/docker/compose.performance.yaml \
  up -d --build --wait --wait-timeout 180
```

### 4.4 Verify stacks
```bash
# Ollama verification
docker compose --env-file infra/compose/ollama-gpu.env -f infra/compose/compose.ollama.gpu.yaml ps
docker compose --env-file infra/compose/ollama-gpu.env -f infra/compose/compose.ollama.gpu.yaml exec -T ollama ollama list
curl -fsS http://localhost:11435/api/tags | head -c 100

# ComfyUI verification
docker compose --env-file infra/compose/comfyui-gpu.env -f infra/compose/compose.comfyui.gpu.yaml ps
curl -fsS http://localhost:8189/ >/dev/null && echo "ComfyUI GPU Studio Online (Port 8189)"

# Performance verification
docker compose \
  --env-file infra/performance/infra-gatling/docker/.env \
  --env-file infra/performance/infra-gatling/docker/performance-local.env \
  -f infra/performance/infra-gatling/docker/compose.performance.yaml ps
curl -fsS http://localhost:8080/ | head -c 100
```

---

## 5. Bulk Model Lifecycle (From `model-box/` Root)

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
$models | ForEach-Object { 
  docker compose --env-file infra/compose/ollama-gpu.env -f infra/compose/compose.ollama.gpu.yaml exec -T ollama ollama pull $_ 
}
docker compose --env-file infra/compose/ollama-gpu.env -f infra/compose/compose.ollama.gpu.yaml exec -T ollama ollama list
```

### 5.2 Linux / macOS
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
for m in "${models[@]}"; do 
  docker compose --env-file infra/compose/ollama-gpu.env -f infra/compose/compose.ollama.gpu.yaml exec -T ollama ollama pull "$m"
done
docker compose --env-file infra/compose/ollama-gpu.env -f infra/compose/compose.ollama.gpu.yaml exec -T ollama ollama list
```

---

## 6. Governance and Security Policies

### 6.1 Model version governance
1. Re-run `ollama pull <model:tag>` to refresh the same tag.
2. Prefer pinned tags (`:7b`, `:3b`, `:e4b`) for reproducibility.
3. Use `:latest` only when rolling updates are acceptable.

### 6.2 Exposure policy
1. Keep default exposure localhost-only (`127.0.0.1`) for development.
2. For LAN access, set `COMPOSE_BIND_IP=0.0.0.0` in `.env` and restart.

### 6.3 Runtime user policy
1. All Compose services in this repository must run as non-root users.
2. Root runtime (`0:0`) is forbidden for steady-state execution.
3. New services must define explicit non-root `user` mapping.

Current UID:GID mappings:

| Stack | Service | UID:GID |
| :--- | :--- | :--- |
| `infra/ollama/docker/compose.ollama.yaml` | `ollama` | `10001:10001` |
| `infra/performance/infra-gatling/docker/compose.performance.yaml` | `gatling-service` | `1500:1500` |
| `infra/performance/infra-gatling/docker/compose.performance.yaml` | `report-service` | `10002:10002` |
