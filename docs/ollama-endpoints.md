# Ollama Endpoints and Use Cases

## 1. Endpoint Capability Matrix

| Endpoint | Purpose | Command example | Output |
| --- | --- | --- | --- |
| `/api/tags` | Health and model inventory | `curl -fsS http://localhost:11435/api/tags` | JSON with `models` |
| `/api/generate` (text) | Single-turn text generation | See Section 6.1 template | JSON with `response` |
| `/api/generate` (image) | Vision prompt with image payload | Not available locally (install a vision model first, then call `/api/generate` with `images`) | JSON with image-grounded `response` |
| `/api/chat` | Multi-turn conversation | See Section 6.2 template | JSON with assistant message |
| `/api/embeddings` | Vector generation for retrieval | See Section 6.3 template | JSON vector/embedding payload |

## 2. Model-to-Endpoint Matrix

| Endpoint | Input type | Recommended models |
| --- | --- | --- |
| `/api/generate` | Text | `deepseek-r1:7b` |
| `/api/generate` | Image | No image-capable model currently installed locally |
| `/api/chat` | Text | `deepseek-r1:7b` |
| `/api/chat` | Image | No image-capable model currently installed locally |
| `/api/embeddings` | Text | No embedding-focused model currently installed locally |

## Local Model Inventory (Verified on 2026-09-27)

Source: `GET http://127.0.0.1:11435/api/tags`

| Local model tag | Size (bytes) | Modified at (UTC) |
| --- | ---: | --- |
| `qwen3:8b` | `5225388164` | `2026-09-27T01:54:54.5654285Z` |
| `llama3.1:8b` | `4920753328` | `2026-09-27T01:54:52.9981672Z` |
| `qwen3-coder:latest` | `18556700761` | `2026-09-27T01:54:50.4357782Z` |
| `gemma4:e4b` | `9608350718` | `2026-09-27T01:54:48.9249085Z` |
| `phi4:latest` | `9053116391` | `2026-09-27T01:54:47.4541171Z` |
| `llama3.2-vision:latest` | `7816589186` | `2026-09-27T01:54:45.9560336Z` |
| `nemotron3:33b` | `27638631632` | `2026-09-27T01:54:44.5730504Z` |
| `qwen2.5vl:3b` | `3200627168` | `2026-09-27T01:54:43.1160431Z` |
| `deepseek-r1:7b` | `4683075440` | `2026-09-27T01:54:41.7060439Z` |
| `minicpm-v:latest` | `5473838466` | `2026-09-27T01:54:40.2467056Z` |

## 3. Available Ollama Models and Download Commands

The table below lists the model tags currently available in the local Ollama registry
and the corresponding `ollama pull` commands.
The Ollama runtime itself is published as the official Docker image `ollama/ollama`.
Use `docker pull ollama/ollama:latest` to pull the runtime image.

| Model family | Ollama tag | Pull command | Official Docker image reference |
| --- | --- | --- | --- |
| `deepseek-r1` | `deepseek-r1:7b` | `ollama pull deepseek-r1:7b` | `docker pull ollama/ollama:latest` |
| `qwen3` | `qwen3:8b` | `ollama pull qwen3:8b` | `docker pull ollama/ollama:latest` |
| `llama3.1` | `llama3.1:8b` | `ollama pull llama3.1:8b` | `docker pull ollama/ollama:latest` |
| `qwen2.5vl` | `qwen2.5vl:3b` | `ollama pull qwen2.5vl:3b` | `docker pull ollama/ollama:latest` |
| `qwen3-coder` | `qwen3-coder:latest` | `ollama pull qwen3-coder:latest` | `docker pull ollama/ollama:latest` |
| `llama3.2-vision` | `llama3.2-vision:latest` | `ollama pull llama3.2-vision:latest` | `docker pull ollama/ollama:latest` |
| `phi4` | `phi4:latest` | `ollama pull phi4:latest` | `docker pull ollama/ollama:latest` |
| `minicpm-v` | `minicpm-v:latest` | `ollama pull minicpm-v:latest` | `docker pull ollama/ollama:latest` |
| `gemma4` | `gemma4:e4b` | `ollama pull gemma4:e4b` | `docker pull ollama/ollama:latest` |
| `nemotron3` | `nemotron3:33b` | `ollama pull nemotron3:33b` | `docker pull ollama/ollama:latest` |

Official Ollama Docker runtime: [Docker Hub - ollama/ollama](https://hub.docker.com/r/ollama/ollama)

## 4. Version Snapshot

The table below reflects the install tag and the corresponding tag version listed in the Ollama library online. The internet column is informational.

| Model family | Install version | Version available over internet |
| --- | --- | --- |
| `deepseek-r1` | `deepseek-r1:7b` | `deepseek-r1:7b` |
| `qwen3` | `qwen3:8b` | `qwen3:8b` |
| `llama3.1` | `llama3.1:8b` | `llama3.1:8b` |
| `qwen2.5vl` | `qwen2.5vl:3b` | `qwen2.5vl:3b` |
| `qwen3-coder` | `qwen3-coder:latest` | `qwen3-coder:latest` |
| `llama3.2-vision` | `llama3.2-vision:latest` | `llama3.2-vision:latest` |
| `phi4` | `phi4:latest` | `phi4:latest` |
| `minicpm-v` | `minicpm-v:latest` | `minicpm-v:latest` |
| `gemma4` | `gemma4:e4b` | `gemma4:e4b` |
| `nemotron3` | `nemotron3:33b` | `nemotron3:33b` |

## 5. RTX Support Snapshot

RTX 5080 is listed by NVIDIA with 16 GB GDDR7 memory and RTX 5090 with 32 GB GDDR7 memory. The table below reflects the tags actually served by the live Ollama API and indicates whether a model is a practical fit for each card.

| Model family | Model size on Ollama | Version available over internet | RTX 5080 (16 GB) | RTX 5090 (32 GB) |
| --- | --- | --- | --- | --- |
| `deepseek-r1` | `deepseek-r1:7b` / 4.7 GB | `deepseek-r1:7b` | Yes | Yes |
| `qwen3` | `qwen3:8b` / 5.2 GB | `qwen3:8b` | Yes | Yes |
| `llama3.1` | `llama3.1:8b` / 4.9 GB | `llama3.1:8b` | Yes | Yes |
| `qwen2.5vl` | `qwen2.5vl:3b` / 3.2 GB | `qwen2.5vl:3b` | Yes | Yes |
| `qwen3-coder` | `qwen3-coder:latest` / 17.3 GB | `qwen3-coder:latest` | No | Yes |
| `llama3.2-vision` | `llama3.2-vision:latest` / 7.8 GB | `llama3.2-vision:latest` | Yes | Yes |
| `phi4` | `phi4:latest` / 9.1 GB | `phi4:latest` | Yes | Yes |
| `minicpm-v` | `minicpm-v:latest` / 5.5 GB | `minicpm-v:latest` | Yes | Yes |
| `gemma4` | `gemma4:e4b` / 9.1 GB | `gemma4:e4b` | Yes | Yes |
| `nemotron3` | `nemotron3:33b` / 27.6 GB | `nemotron3:33b` | No | Yes |

Note: real fit also depends on context length, quantization, GPU driver support, and how much system memory is available for offload.

## 6. Standard Request Templates

1. Text generation (Section 1 `/api/generate` text example):

```bash
curl -fsS http://localhost:11435/api/generate \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek-r1:7b","prompt":"Give one line summary of ModelBox.","stream":false}'
```

2. Multi-turn chat (`/api/chat`):

```bash
curl -fsS http://localhost:11435/api/chat \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek-r1:7b","messages":[{"role":"user","content":"Summarize ModelBox in one line"}],"stream":false}'
```

3. Embeddings (`/api/embeddings`):

```bash
curl -fsS http://localhost:11435/api/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model":"<embedding-model>","prompt":"ModelBox runtime baseline"}'
```

4. Vision generation:

```bash
IMG_B64=$(base64 < /path/to/sample.jpg | tr -d '\n')
curl -fsS http://localhost:11435/api/generate \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"<install-a-vision-model-first>\",\"prompt\":\"Describe this image in 1-2 sentences.\",\"images\":[\"${IMG_B64}\"],\"stream\":false}"
```

5. Health and inventory:

```bash
curl -fsS http://localhost:11435/api/tags
```
