# Parent-level Docker Compose Entries

These files provide parent-level compose entrypoints from the repository root while keeping each runtime split into separate modular service configurations.

For detailed operational procedures, prerequisites, and port matrices, see the [Docker Compose Deployment Guide](../../docs/docker-compose-deployment-guide.md).

---

## 1. Available Parent Compose Files

1. `infra/compose/compose.comfyui.cpu.yaml` - ComfyUI runtime (CPU mode)
2. `infra/compose/compose.comfyui.gpu.yaml` - ComfyUI runtime (NVIDIA GPU accelerated)
3. `infra/compose/compose.ollama.cpu.yaml` - Ollama model server (CPU mode)
4. `infra/compose/compose.ollama.gpu.yaml` - Ollama model server (NVIDIA GPU accelerated)
5. `infra/compose/compose.connectors.yaml` - Model Connectors stack (Vault, Postgres, Service, UI, Playwright MCP)
6. `infra/compose/compose.performance.yaml` - Performance test runner and Gatling report server

---

## 2. Prerequisites

All parent-level compose configurations require the shared external bridge network `model-box-net`:

```bash
docker network create model-box-net
```

---

## 3. Automated Orchestration (Recommended)

From repository root:

```powershell
# PowerShell (Windows)
.\infra\scripts\Deploy-All-Compose.ps1
```

```bash
# Bash (Linux/macOS)
./infra/scripts/Deploy-All-Compose.sh
```

---

## 4. Manual Execution Examples

Run from repository root (`model-box/`):

### 4.1 ComfyUI

- **GPU**:
  ```bash
  docker compose --env-file infra/compose/comfyui-gpu.env -f infra/compose/compose.comfyui.gpu.yaml up -d --build --wait --wait-timeout 240
  ```
- **CPU**:
  ```bash
  docker compose --env-file infra/compose/comfyui-cpu.env -f infra/compose/compose.comfyui.cpu.yaml up -d --build --wait --wait-timeout 240
  ```

### 4.2 Ollama

- **GPU**:
  ```bash
  docker compose --env-file infra/compose/ollama-gpu.env -f infra/compose/compose.ollama.gpu.yaml up -d --build --wait --wait-timeout 180
  ```
- **CPU**:
  ```bash
  docker compose --env-file infra/compose/ollama-cpu.env -f infra/compose/compose.ollama.cpu.yaml up -d --build --wait --wait-timeout 180
  ```

### 4.3 Model Connectors & Playwright MCP

```bash
docker compose -f infra/compose/compose.connectors.yaml up -d --build
```

### 4.4 Performance Stack

```bash
docker compose --env-file infra/compose/performance.env -f infra/compose/compose.performance.yaml up -d --build --wait --wait-timeout 180
```

---

## 5. Decoupled Volume Storage Configuration

ModelBox isolates host storage per service to ensure independent and clean lifecycles:

- **ComfyUI Storage**:
  - `COMPOSE_COMFYUI_VOLUME_HOST=C:\DEV\WSB\CONFIG\volume\volume-docker_comfyui`
  - `COMPOSE_COMFYUI_WORKFLOWS_HOST=C:\DEV\WSB\CONFIG\volume\volume-docker_comfyui\workflows`
- **Ollama Storage**:
  - `COMPOSE_OLLAMA_MODELS_HOST=C:\DEV\WSB\CONFIG\volume\volume-docker_ollama`

---

## 6. Verification Commands

```bash
# Ollama tags
curl -fsS http://localhost:11435/api/tags

# ComfyUI frontend
curl -fsS http://localhost:8189/

# Model Connectors health
curl -fsS http://localhost:8000/health

# Playwright MCP health
curl -fsS http://localhost:8940/health
```

---

## 7. Teardown

```bash
docker compose -f infra/compose/compose.connectors.yaml down
docker compose --env-file infra/compose/comfyui-gpu.env -f infra/compose/compose.comfyui.gpu.yaml down
docker compose --env-file infra/compose/ollama-gpu.env -f infra/compose/compose.ollama.gpu.yaml down
docker compose --env-file infra/compose/performance.env -f infra/compose/compose.performance.yaml down
```
