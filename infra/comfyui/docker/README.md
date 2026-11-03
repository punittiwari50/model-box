# ComfyUI Docker Runtime

This directory stores ComfyUI runtime artifacts (Dockerfiles, Compose files, and local volume definitions).

> **Master Guide Reference**: All end-to-end clean build procedures, GPU/CPU mode switching, volume mount persistence, and teardown commands are consolidated into the single authoritative document:  
> 👉 [**Docker Compose Deployment Master Guide**](../../../docs/docker-compose-deployment-guide.md)

---

## 1. Quick Execution Commands

### Clean Build & Launch (GPU Mode)
```bash
docker compose --env-file comfyui-gpu.env -f compose.gpu.yaml down --remove-orphans
docker compose --env-file comfyui-gpu.env -f compose.gpu.yaml build --no-cache
docker compose --env-file comfyui-gpu.env -f compose.gpu.yaml up -d --wait --wait-timeout 240
```

### Clean Build & Launch (CPU Mode)
```bash
docker compose --env-file comfyui-cpu.env -f compose.cpu.yaml down --remove-orphans
docker compose --env-file comfyui-cpu.env -f compose.cpu.yaml build --no-cache
docker compose --env-file comfyui-cpu.env -f compose.cpu.yaml up -d --wait --wait-timeout 240
```

### Teardown
```bash
docker compose --env-file comfyui-gpu.env -f compose.gpu.yaml down --remove-orphans
```

---

## 2. Persistence and Bidirectional Mounts

1. **Host Data Root:** `COMPOSE_COMFYUI_VOLUME_HOST` mounted to `/data/comfyui`.
2. **Workflows:** `COMPOSE_COMFYUI_WORKFLOWS_HOST` mounted to `/data/comfyui/user/default/workflows`.
3. **Source Path:** `COMPOSE_COMFYUI_SOURCE_HOST` mounted to `/workspace/comfyui-source`.
4. **Skills Source:** `COMPOSE_COMFYUI_SKILLS_HOST` mounted to `/workspace/skills`.

See `.env.example` for portable baseline template values (with project-relative `./volumes/...` paths).


For complete automated orchestration across ComfyUI and Ollama, use:
```powershell
# From repository root:
.\infra\scripts\Deploy-All-Compose.ps1 -Action BuildAndUp -Stacks 'comfyui' -CleanRecreate -NoCache -Wait
```
