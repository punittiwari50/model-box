# ModelBox Enterprise Model Connectors & Universal Client

[![Architecture: Hexagonal / Clean Architecture](https://img.shields.io/badge/Architecture-Hexagonal%20%2F%20Clean-blue.svg)](#architecture)
[![Orchestration: LangGraph](https://img.shields.io/badge/Orchestration-LangGraph-orange.svg)](#langgraph-orchestration)
[![Environment: Spring Boot Pattern](https://img.shields.io/badge/Environment-Spring%20Boot%20Profiles-green.svg)](#spring-boot-environment-hierarchy)
[![Standards: STD-COD & STD-BLD](https://img.shields.io/badge/Standards-STD--COD%20%26%20STD--BLD-emerald.svg)](#standards-compliance)

Enterprise multi-protocol AI model connectors connecting containerized **Ollama** and **ComfyUI** runtimes, external APIs, WebSockets, gRPC, and Kafka distributed event streams. Features continuous token consumption tracking, token bucket rate-limiting with refill wait-time estimation, session/cookie lineage tracking, conversation compaction, static image inspection, chunked video streaming, and LangGraph workflow orchestration.

---

## 1. System Architecture & Standards Compliance

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│              Presentation Layer: FastAPI Microservice & Node UI Project                │
│    • Python Backend Service: FastAPI Routes, REST, Video Streaming, Image Viewing      │
│    • Node UI Project: Vite + React 18 + TypeScript + Glassmorphism UI (Port 3000)      │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              Application Layer (Use Cases)                             │
│    • LangGraph StateGraph Workflow (Token Guard -> Compactor -> Universal Dispatch)     │
│    • Use Cases: ExecuteInference, ManageConnection, ManageSession, TokenMetrics        │
└──────────────────────────┬───────────────────────────────────────────────┬─────────────┘
                           │ calls                                         │ implements
                           ▼                                               ▼
┌──────────────────────────────────────────────────┐ ┌───────────────────────────────────┐
│                   Domain Layer                   │ │      Infrastructure Adapters      │
│  • Pure Domain Models (Frozen Dataclasses)       │ │  • UniversalModelConnector        │
│  • Result[T, E] Monad (Zero Null Returns)        │ │  • Protocol Strategies:           │
│  • Centralized Final Static Constants (typing)   │ │    - REST (Ollama / HTTP)         │
│  • Port Interfaces: IUniversalModelConnector,    │ │    - WebSocket (ComfyUI)          │
│    IModelConnector, IMediaStreamingConnector,    │ │    - gRPC (High-Speed RPC)        │
│    ISessionRepository, IConversationRepository   │ │    - Kafka (Distributed PubSub)   │
│                                                  │ │  • Media Handlers:                │
│                                                  │ │    - ImageViewerHandler           │
│                                                  │ │    - VideoStreamHandler (Range)   │
│                                                  │ │  • Security Pipeline (Chain of    │
│                                                  │ │    Responsibility: Auth, Roles)   │
│                                                  │ │  • Circuit Breaker Resilience     │
│                                                  │ │  • Storage Strategy Manager:      │
│                                                  │ │    - InMemorySqliteRepository     │
│                                                  │ │    - PostgresRepository           │
│                                                  │ │    - YamlRepository               │
│                                                  │ │  • SpringEnvironment & Hierarchy: │
│                                                  │ │    - SystemEnvironment (Exclusive)│
│                                                  │ │    - YamlPropertySource           │
│                                                  │ │    - CommandLinePropertySource    │
└──────────────────────────────────────────────────┘ └───────────────────────────────────┘
```

---

## 2. Spring Boot Externalized Environment Hierarchy

The configuration system mirrors the Spring Boot `Environment` pattern with strict layering:

### Precedence Hierarchy (Highest to Lowest):
1. **Command Line Arguments (`CommandLinePropertySource`):** e.g., `--server.port=9000 --spring.profiles.active=docker,prod`
2. **Active Profile Configurations (`application-{profile}.yml`):**
   - Multiple active profiles are supported simultaneously (e.g., `docker,prod` or `dev`).
   - Profile YAML documents override base configuration properties sequentially.
3. **Base Application Configuration (`application.yml`):** Default enterprise settings for server, storage, endpoints, connectors, media, and security.
4. **Host System Environment (`SystemEnvironmentPropertySource`):** Base environment values.

> [!IMPORTANT]
> **Single Access Point Rule (`STD-COD-002`):** `SystemEnvironmentPropertySource` in `infrastructure.config.environment` is the **EXCLUSIVE** authority permitted to inspect `os.environ` or call `os.getenv`. Zero scattered `os.getenv` calls exist in any other class, connector, service, or repository.

---

## 3. Centralized Final Static Constants

Modeled after Java `public static final` and TypeScript `const`, all constants are immutable and typed with `typing.Final`:
- **`ProfileConstants`:** `DEFAULT`, `DEV`, `DOCKER`, `PROD`, `TEST`
- **`ServerConstants`:** `DEFAULT_HOST`, `DEFAULT_PORT`, `DEFAULT_TIMEOUT_SECONDS`, `DEFAULT_CORS_ORIGINS`
- **`StorageConstants`:** `BACKEND_IN_MEMORY`, `BACKEND_POSTGRES`, `BACKEND_YAML`, `DEFAULT_SQLITE_PATH`, `DEFAULT_POSTGRES_DSN`
- **`ProtocolConstants`:** `REST`, `GRPC`, `WEBSOCKET`, `KAFKA`, `COOKIE_SESSION`
- **`SecurityConstants`:** Headers, Bearer prefix, Auth methods, Roles (`ROLE_ADMIN`, `ROLE_ML_ENGINEER`, `ROLE_SERVICE_ACCOUNT`)
- **`MediaConstants`:** MIME types (`image/png`, `video/mp4`, `video/webm`), buffer sizes, maximum chunk limits

---

## 4. Universal Omni-Channel Client (`UniversalModelConnector`)

A single cohesive client (`IUniversalModelConnector`) serving all communication protocols and media:
- **REST Protocol Strategy:** Ollama LLM chat inference, embeddings, and tags discovery.
- **WebSocket Protocol Strategy:** ComfyUI diffusion prompt queueing and event streaming.
- **gRPC Protocol Strategy:** High-throughput unary and streaming protobuf inference (Triton / TensorRT-LLM).
- **Kafka Protocol Strategy:** Distributed asynchronous pub/sub inference and token event streaming.
- **Multimedia Capabilities:**
  - `view_image()`: Static image artifact inspection with MIME detection.
  - `stream_video()`: Real-time chunked video streaming with HTTP byte-range seekability.
- **Microservices Resilience:** Built-in `CircuitBreaker` (Closed / Open / Half-Open state machine) preventing cascading failures.
- **Security Pipeline:** Chain-of-responsibility authentication (Bearer, API Key, Cookie Session, HMAC signature), role authorization, and audit logging.

---

## 5. Persistence Strategy Engine (`StorageManager`)

Dynamically resolves storage engines based on the active Spring profile or `storage.default_backend`:
- **In-Memory SQLite (`IN_MEMORY`):** Transient in-memory persistence with microsecond latency.
- **Enterprise PostgreSQL (`POSTGRESQL`):** Relational connection pool with DDL auto-provisioning and JSONB conversation compactions.
- **YAML Config Store (`YAML`):** Declarative file-based model profiles.

---

## 6. Project Structure


```
model-connectors/
├── README.md                      # Orchestration & architecture documentation
├── docker-compose.yaml            # Parent orchestrator (delegates to deploy/docker)
├── deploy/                        # Parent Orchestration Deploy Directory
│   ├── docker/                    # Centralized Docker Compose definitions
│   │   ├── docker-compose.yml     # Multi-subproject orchestrator
│   │   ├── docker-compose.service.yml
│   │   └── docker-compose.ui.yml
│   ├── kubernetes/                # Centralized Ingress & Kustomize
│   └── helm/                      # Centralized Umbrella Helm Chart
│
├── service/                       # Backend Python Microservice Subproject
│   ├── pyproject.toml             # Modern packaging (FastAPI 0.115+, Pydantic 2.10+)
│   ├── README.md                  # Microservice documentation
│   ├── config/                    # Spring Boot externalized configuration directory
│   │   ├── application.yml        # Base profile
│   │   ├── application-dev.yml    # Development profile
│   │   ├── application-docker.yml # Docker internal network profile
│   │   ├── application-prod.yml   # Production profile
│   │   ├── application-test.yml   # Test profile
│   │   └── connections/           # Pre-configured connector descriptors
│   ├── deploy/                    # Service Deployment Directory
│   │   ├── docker/                # Multi-stage Python 3.12 Dockerfile & compose
│   │   ├── kubernetes/            # Deployment, Service & Kustomize
│   │   └── helm/                  # Subproject Helm Chart
│   ├── src/                       # Pure Hexagonal Clean Architecture (Domain, Ports, Adapters)
│   │   └── model_connectors/
│   │       └── infrastructure/
│   │           └── utils/
│   │               └── file_utils.py # Centralized FileUtils I/O & Path Traversal Guard
│   └── tests/                     # Verification test suites & AST cycle analyzer
│
└── ui/                            # Frontend React 19 / Vite 8 / TypeScript 7 Subproject
    ├── package.json               # Subproject package manifest (only package.json & index.html at root)
    ├── index.html                 # Single page application entrypoint
    ├── config/                    # Toolchain Configuration Directory
    │   ├── typescript/
    │   │   ├── tsconfig.json      # Configured with @/* path alias (no baseUrl)
    │   │   └── tsconfig.node.json
    │   └── vite/
    │       └── vite.config.ts     # Configured with @ alias & native dirname
    ├── deploy/                    # UI Deployment Directory
    │   ├── docker/                # Node 20 build + Nginx Alpine runtime & compose
    │   ├── kubernetes/            # Deployment, Service & Kustomize
    │   └── helm/                  # Subproject Helm Chart
    └── src/                       # All TS/TSX application files (Zero ./ or ../ imports)
        ├── config/
        │   └── env.config.ts      # Application environment configuration
        ├── utils/
        │   └── file_utils.ts      # Centralized FileUtils (Blob, Base64, Downloads)
        ├── components/            # UI components importing via @/
        └── services/              # API Client layer importing via @/
```

---

## 7. Container-First Execution & Testing

All execution and testing is conducted hermetically inside Docker containers:

### 1. Build and Run the Complete Application Stack:
```bash
docker compose up -d --build
```

### 2. Run AST Cyclic Reference Verification:
```bash
docker run --rm --entrypoint python model-connectors-service:latest tests/verify_no_cyclic_references.py
```

### 3. Run Enterprise Architecture Verification Test Suite:
```bash
docker run --rm --network model-box-net --entrypoint python model-connectors-service:latest tests/test_enterprise_architecture.py
```

### 4. Run Functional Verification Test Suite:
```bash
docker run --rm --network model-box-net --entrypoint python model-connectors-service:latest tests/verify_suite.py
```

### 5. Run Pytest Unit Test Suite:
```bash
docker run --rm --entrypoint pytest model-connectors-service:latest tests/unit/
```
