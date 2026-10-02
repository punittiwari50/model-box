# Ollama Docker runtime

This directory stores runtime artifacts only (Compose files, env files, and local volume placeholders).

Operational content has been consolidated into centralized project docs:

1. Manual runtime commands and rebuild workflow: [../../../docs/docker-operations.md](../../../docs/docker-operations.md)
2. Endpoint usage and payload examples: [../../../docs/ollama-endpoints.md](../../../docs/ollama-endpoints.md)
3. Documentation policy and ownership: [../../../docs/README.md](../../../docs/README.md)

## Quick Commands

**Start GPU Ollama (all 11 models available):**
```bash
docker compose --env-file ollama-gpu.env -f compose.gpu.yaml up -d --build --wait --wait-timeout 180
```

**Start CPU Ollama (all 11 models available):**
```bash
docker compose --env-file ollama-cpu.env -f compose.cpu.yaml up -d --build --wait --wait-timeout 180
```

**List all models:**
```bash
docker compose --env-file ollama-gpu.env -f compose.gpu.yaml exec -T ollama ollama list
```

**Remove containers, images, and volumes completely:**
```bash
docker compose --env-file ollama-gpu.env -f compose.gpu.yaml down -v --remove-orphans
docker rmi -f $(docker images --filter "reference=ollama/*" -q)
docker volume ls --filter "name=*ollama*" -q | xargs -r docker volume rm -f
```

**Full lifecycle workflows:** See [../../../docs/docker-operations.md#4-complete-lifecycle-workflows](../../../docs/docker-operations.md#4-complete-lifecycle-workflows)

## Configuration Properties

### CPU Mode Properties (`ollama-cpu.env`)

| Property | Purpose | Available Values | Default |
|---|---|---|---|
| `OLLAMA_HOST` | Network binding | `0.0.0.0:11434`, `127.0.0.1:11434` | `0.0.0.0:11434` |
| `OLLAMA_MODELS` | Model storage path in container | `/models`, `/mnt/models` | `/models` |
| `OLLAMA_NO_CLOUD` | Disable cloud sync | `true`, `false` | `true` |
| `OLLAMA_NUM_PARALLEL` | Concurrent load threads | `1`, `2`, `4`, `8` | `2` |
| `OLLAMA_MAX_LOADED_MODELS` | Max models in memory | `1`, `2`, `4` | `1` |
| `OLLAMA_MAX_QUEUE` | Request queue limit | `32`, `64`, `128`, `256` | `128` |
| `OLLAMA_CONTEXT_LENGTH` | Token context window | `2048`, `4096`, `8192`, `16384` | `8192` |
| `OLLAMA_KEEP_ALIVE` | Model memory retention | `5m`, `10m`, `30m`, `1h`, `-1` | `10m` |
| `COMPOSE_CPUS` | CPU limit | `2`, `4`, `6`, `8`, `12` | `6` |
| `COMPOSE_MEM_LIMIT` | Memory limit | `8g`, `16g`, `24g`, `32g` | `24g` |
| `COMPOSE_SHM_SIZE` | Shared memory | `1g`, `2g`, `4g` | `2g` |

**Host Path:** `COMPOSE_OLLAMA_MODELS_HOST` → Container: `/models`

### GPU Mode Properties (`ollama-gpu.env`)

| Property | Purpose | Available Values | Default |
|---|---|---|---|
| `OLLAMA_HOST` | Network binding | `0.0.0.0:11434`, `127.0.0.1:11434` | `0.0.0.0:11434` |
| `OLLAMA_MODELS` | Model storage path in container | `/models`, `/mnt/models` | `/models` |
| `OLLAMA_NO_CLOUD` | Disable cloud sync | `true`, `false` | `true` |
| `OLLAMA_NUM_PARALLEL` | Concurrent load threads | `1`, `2`, `4`, `8` | `2` |
| `OLLAMA_MAX_LOADED_MODELS` | Max models in memory | `1`, `2`, `4` | `1` |
| `OLLAMA_MAX_QUEUE` | Request queue limit | `32`, `64`, `128`, `256` | `128` |
| `OLLAMA_CONTEXT_LENGTH` | Token context window | `2048`, `4096`, `8192`, `16384` | `8192` |
| `OLLAMA_KEEP_ALIVE` | Model memory retention | `5m`, `10m`, `30m`, `1h`, `-1` | `10m` |
| `COMPOSE_CPUS` | CPU limit | `2`, `4`, `6`, `8`, `12` | `6` |
| `COMPOSE_MEM_LIMIT` | Memory limit | `8g`, `16g`, `24g`, `32g` | `24g` |
| `COMPOSE_SHM_SIZE` | Shared memory | `1g`, `2g`, `4g` | `2g` |
| `NVIDIA_VISIBLE_DEVICES` | GPU device access | `0`, `1`, `2`, `all` | `0` |
| `NVIDIA_DRIVER_CAPABILITIES` | GPU capabilities | `compute,utility`, `graphics,compute,utility` | `compute,utility` |

**Host Path:** `COMPOSE_OLLAMA_MODELS_HOST` → Container: `/models`

**GPU Requirements:** NVIDIA Container Toolkit, NVIDIA GPU, `gpus: all` in compose



1. This runtime must run as a non-root user only.
2. The Compose service user mapping is 10001:10001.
3. Do not change the service to root (0:0) in normal operation.

Deployment modes:

1. GPU runtime: [compose.gpu.yaml](compose.gpu.yaml) with [ollama-gpu.env](ollama-gpu.env)
2. CPU runtime: [compose.cpu.yaml](compose.cpu.yaml) with [ollama-cpu.env](ollama-cpu.env)
3. Legacy baseline: [compose.ollama.yaml](compose.ollama.yaml) remains as the generic official-image runtime

Operational notes:

1. GPU mode (`ollama-gpu.env`) adds NVIDIA runtime settings: `NVIDIA_VISIBLE_DEVICES=0` and `NVIDIA_DRIVER_CAPABILITIES=compute,utility`. Requires host with NVIDIA Container Toolkit configured.
2. CPU mode (`ollama-cpu.env`) omits GPU-specific variables and is the fallback for non-GPU or validation runs.
3. Both modes keep the same persistent host model directory (configured via `COMPOSE_OLLAMA_MODELS_HOST`) mounted at `/models` as a bidirectional read-write bind mount.
4. See `.env.example` for base configuration and `ollama-gpu.env`/`ollama-cpu.env` for mode-specific overrides.

Consolidated model store (2026-09-27):

1. All 11 models (tinyllama, qwen3, llama3.1, qwen3-coder, gemma4, phi4, llama3.2-vision, nemotron3, qwen2.5vl, deepseek-r1, minicpm-v) are now accessible via `ollama list` in both CPU and GPU containers.
2. Model manifests are consolidated in `/manifests/registry.ollama.ai/library/` at the root of the host volume.
3. Blob data is consolidated in `/blobs/` at the root of the host volume.
4. Metadata is consolidated in `/metadata/` at the root of the host volume.
5. New models pulled through the container will be saved to the root manifest tree and remain visible to both runtimes.
6. Do not maintain separate nested `models/` directories; all model artifacts must reside at the root level.
