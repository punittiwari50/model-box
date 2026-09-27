# model-box

ModelBox is an Ollama-first runtime baseline for enterprise workloads.

## Manual operations only

Use command-line procedures from the project docs. Do not rely on assistants or token-based workflows for routine operations.

- Runtime operations and command catalog: [docs/docker-operations.md](docs/docker-operations.md)
- Performance run procedures: [applications/performance/infra-gatling/README.md](applications/performance/infra-gatling/README.md)
- Performance test guidance: [applications/performance/infra-gatling/docs/PERFORMANCE_TESTING.md](applications/performance/infra-gatling/docs/PERFORMANCE_TESTING.md)

## 1. Design decision

- Runtime is direct Ollama access, without an app wrapper by default.
- Current Ollama runtime ships GPU and CPU compose variants for the same service.
- App-layer services are added only when there is a clear API, orchestration, or business-logic requirement.

## 2. Repository structure

```text
model-box/
├── .gitignore
├── LICENSE
├── README.md
├── applications/
│   └── performance/
│       └── infra-gatling/
│           ├── config/
│           │   └── infra-iac/
│           │       └── docker/
│           │           ├── Dockerfile.gatling
│           │           └── run-gatling.sh
│           ├── docs/
│           │   └── PERFORMANCE_TESTING.md
│           └── README.md
├── docs/
│   ├── README.md
│   ├── docker-operations.md
│   └── ollama-endpoints.md
└── infra/
    ├── performance/
    │   └── infra-gatling/
    │       └── docker/
    │           └── compose.performance.yaml
    └── ollama/
        └── docker/
            ├── compose.ollama.yaml
            ├── compose.cpu.yaml
            ├── compose.gpu.yaml
            ├── ollama-cpu.env
            ├── ollama-gpu.env
            ├── ollama.env
            ├── README.md
            └── volumes/
                └── ollama/
                    └── .gitkeep
```

## 3. Documentation map

- Runtime operations and Docker commands: [Docker Operations Guide](docs/docker-operations.md)
- Endpoint purpose, usage patterns, and model mapping: [Ollama Endpoint Guide](docs/ollama-endpoints.md)
- Documentation scope and ownership: [Documentation Index](docs/README.md)
- Component-specific container config details: [Ollama Docker Runtime Notes](infra/ollama/docker/README.md)

## 4. Run from repository root

If you are in the parent folder and need to enter the repo first, use a relative directory switch:

```bash
cd model-box
docker compose -f infra/ollama/docker/compose.ollama.yaml up -d
docker compose --env-file infra/performance/infra-gatling/docker/.env --env-file infra/performance/infra-gatling/docker/performance-local.env -f infra/performance/infra-gatling/docker/compose.performance.yaml up -d --build
```

If you are already inside the repo root, you can run the same Compose commands directly without changing into a Docker subfolder.

## 5. Build and validation status

| Build target | Status | Evidence |
|---|---|---|
| Ollama CPU Compose runtime | Success | `docker compose --env-file infra/ollama/docker/ollama-cpu.env -f infra/ollama/docker/compose.cpu.yaml up -d` completed successfully |
| Ollama GPU Compose runtime | Success | `docker compose --env-file infra/ollama/docker/ollama-gpu.env -f infra/ollama/docker/compose.gpu.yaml up -d` completed successfully |
| Ollama API smoke test | Success | API endpoint responded at `http://127.0.0.1:11435/api/tags` |
| GitHub workflow validation | Configured | [.github/workflows/ollama-compose-validate.yml](.github/workflows/ollama-compose-validate.yml) added for CI checks |
| Documentation integrity | Success | Centralized doc map maintained in [docs/README.md](docs/README.md) |
| Security governance | Configured | [SECURITY.md](SECURITY.md) and [CODEOWNERS](CODEOWNERS) added |

## 6. Governance and quality controls

- Default repository ownership is defined in [CODEOWNERS](CODEOWNERS).
- Security reporting and secret handling policy is defined in [SECURITY.md](SECURITY.md).
- CI validation for the Ollama runtime is defined in [.github/workflows/ollama-compose-validate.yml](.github/workflows/ollama-compose-validate.yml).

## 7. Scope policy

- Keep repository-level architecture decisions in this file.
- Keep Docker command procedures only in the [Docker Operations Guide](docs/docker-operations.md).
- Keep endpoint and API behavior only in the [Ollama Endpoint Guide](docs/ollama-endpoints.md).
