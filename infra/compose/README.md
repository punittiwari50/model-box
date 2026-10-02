# Parent-level Docker Compose entries

These files provide parent-level compose entrypoints from the repository root while keeping each runtime split into separate service files.

## Available parent compose files

1. `infra/compose/compose.comfyui.cpu.yaml`
2. `infra/compose/compose.comfyui.gpu.yaml`
3. `infra/compose/compose.ollama.cpu.yaml`
4. `infra/compose/compose.ollama.gpu.yaml`
5. `infra/compose/compose.performance.yaml`

## Examples

ComfyUI CPU:

```bash
docker compose --env-file infra/compose/comfyui-cpu.env -f infra/compose/compose.comfyui.cpu.yaml up -d --build --wait --wait-timeout 240
```

ComfyUI GPU:

```bash
docker compose --env-file infra/compose/comfyui-gpu.env -f infra/compose/compose.comfyui.gpu.yaml up -d --build --wait --wait-timeout 240
```

Ollama GPU:

```bash
docker compose --env-file infra/compose/ollama-gpu.env -f infra/compose/compose.ollama.gpu.yaml up -d --build --wait --wait-timeout 180
```

Performance stack:

```bash
docker compose --env-file infra/compose/performance.env -f infra/compose/compose.performance.yaml up -d --build --wait --wait-timeout 180
```
