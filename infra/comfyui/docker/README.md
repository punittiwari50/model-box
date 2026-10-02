# ComfyUI Docker runtime

This directory contains ComfyUI runtime artifacts (Dockerfiles, Compose files, env files).

## Quick Commands

Start GPU ComfyUI:

```bash
docker compose --env-file comfyui-gpu.env -f compose.gpu.yaml up -d --build --wait --wait-timeout 240
```

Start CPU ComfyUI:

```bash
docker compose --env-file comfyui-cpu.env -f compose.cpu.yaml up -d --build --wait --wait-timeout 240
```

Stop ComfyUI:

```bash
docker compose --env-file comfyui-gpu.env -f compose.gpu.yaml down --remove-orphans
```

## Persistence and Bidirectional Sync

1. Host data root is configured by `COMPOSE_COMFYUI_VOLUME_HOST` and mounted to `/data/comfyui`.
2. Workflow path is configured by `COMPOSE_COMFYUI_WORKFLOWS_HOST` and mounted to `/data/comfyui/user/default/workflows`.
3. Source path is configured by `COMPOSE_COMFYUI_SOURCE_HOST` and mounted to `/workspace/comfyui-source`.
4. Skills source path is configured by `COMPOSE_COMFYUI_SKILLS_HOST` and mounted to `/workspace/skills`.

All mounts are read-write bind mounts, enabling host-to-container and container-to-host updates.

## Deployment Modes

1. GPU runtime: `compose.gpu.yaml` with `comfyui-gpu.env`.
2. CPU runtime: `compose.cpu.yaml` with `comfyui-cpu.env`.
