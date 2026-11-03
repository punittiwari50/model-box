# ModelConnector Enterprise Platform (`@model-box/model-connector-platform`)

[![Architecture: Multi-Module Monorepo](https://img.shields.io/badge/Architecture-Multi--Module%20Workspace-blue.svg)](#architecture)
[![Standards: STD-COD & STD-BLD](https://img.shields.io/badge/Standards-STD--COD%20%26%20STD--BLD-emerald.svg)](#standards-compliance)
[![Runtime: Node.js 22 LTS](https://img.shields.io/badge/Runtime-Node.js%2022%20LTS-green.svg)](#runtime)
[![UI: React 18 + Vite](https://img.shields.io/badge/UI-React%2018%20%2B%20Vite-cyan.svg)](#model-connector-ui)
[![Structure: Maven Style](https://img.shields.io/badge/Structure-Maven--Style%20Layout-orange.svg)](#maven-style-directory-layout)

An enterprise multi-module Node.js platform providing omni-channel AI model connectivity via **Headless CLI**, **REST API**, and **Cookie Session Lineage**, tightly coupled with upstream **`gemini-model-connector`** and local containerized runtimes (Ollama, ComfyUI).

---

## 🏛️ System Architecture

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        model-connector-ui (Port 3005 / Port 80)                         │
│       • React 18 + Vite + TypeScript + Glassmorphism Design System                      │
│       • Desktop Widescreen Sidebar & Responsive Mobile Bottom Navigation                │
│       • Dynamic Strategy Toggle: [ CLI ] [ REST API ] [ Cookie Session ]               │
│       • Model Registry Explorer, Cookie Jar Inspector & Upstream Sync Monitor          │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ HTTP / REST & Server-Sent Events (SSE)
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        model-connector-service (Port 8095)                             │
│       • Node.js Express Backend Service with Helmet, CORS & Correlation Tracing        │
│       • Zod-Validated API: /api/v1/chat, /api/v1/models, /api/v1/sessions              │
│       • Upstream Health & Compliance Audit Aggregation Engine                          │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ Library Dependency (workspace:*)
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        model-connector-client (Omni-Channel Engine)                    │
│       ┌───────────────────────┬───────────────────────┬───────────────────────┐        │
│       │  CliConnectorStrategy │  ApiConnectorStrategy │ CookieConnectorStrat  │        │
│       │  • Headless CLI spawn │  • Direct REST & SSE  │  • Cookie Jar Store   │        │
│       │  • @google/gemini-cli │  • Header Auth Schemes│  • Multi-Turn Lineage │        │
│       │  • Ollama run local   │  • Fallback Emulation │  • Session Rotation   │        │
│       └───────────────────────┴───────────────────────┴───────────────────────┘        │
│                                           │                                            │
│                                           ▼                                            │
│                       UnifiedModelExecutionAdapter (Upstream Bridge)                   │
│                 Connects to upstream model connector (Port 8090)                       │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ Core Foundation Dependency (workspace:*)
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        model-connector-core (Enterprise Foundation)                    │
│       • Spring-Style Environment Interface with Relaxed Property Binding               │
│       • Strict Utils Encapsulation: processUtils, argParser, fileUtils, concurrency    │
│       • Resilience4j Engine: CircuitBreaker, RetryPolicy, RateLimiter, Bulkhead        │
│       • Generic ObjectConnectionPool (HikariCP / DBCP-inspired)                        │
│       • Protocol Configurations: REST, gRPC, WebSocket, Security & Structured Logging  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Maven-Style Directory Layout

All modules in this workspace follow a rigorous **Maven-style structure** (`src/main/typescript`, `src/main/resources`, `src/test/typescript`, `src/test/resources`).

The parent root directory and package roots adhere strictly to root isolation: **only `README.md`, `package.json`, and `.gitignore` reside at the root level**. All configuration files are centralized under `config/` or `src/main/resources/`.

```
model-connector-platform/
├── .gitignore
├── package.json                                 # Multi-package npm/pnpm workspace manifest
├── README.md                                    # Architectural platform documentation
├── config/                                      # Centralized platform configurations
│   ├── docker/
│   │   ├── .dockerignore
│   │   ├── docker-compose.yml                  # Dual-service (backend + frontend) compose
│   │   └── entrypoint.sh                       # Container entrypoint script
│   ├── env/
│   │   ├── .env                                # Local environment secrets
│   │   └── .env.example                        # Template environment specification
│   ├── pnpm/
│   │   └── pnpm-workspace.yaml                 # Pnpm workspace definition
│   ├── scripts/
│   │   ├── build/ (build.ps1, build.sh)        # Platform build automation
│   │   ├── deploy/ (deploy.ps1, deploy.sh)     # Containerized deploy automation
│   │   └── verification/ (verify.ps1, verify.sh, verify_platform.py)
│   └── typescript/
│       └── tsconfig.base.json                  # Shared TypeScript compiler options
└── packages/
    ├── model-connector-core/
    │   ├── .gitignore
    │   ├── package.json
    │   ├── README.md
    │   ├── config/
    │   │   └── typescript/ (tsconfig.json, tsconfig.test.json)
    │   └── src/
    │       ├── main/
    │       │   ├── typescript/                 # Foundation source files
    │       │   │   ├── config/ (environment, rest, grpc, websocket, security)
    │       │   │   ├── constants/ (modelConstants, systemConstants)
    │       │   │   ├── logging/ (logger)
    │       │   │   ├── pool/ (connectionPool)
    │       │   │   ├── resilience/ (circuitBreaker, retry, rateLimiter, bulkhead)
    │       │   │   ├── utils/ (process, args, file, concurrency, crypto)
    │       │   │   └── index.ts
    │       │   └── resources/                  # Core configurations & defaults
    │       │       ├── application.yml
    │       │       └── core-defaults.json
    │       └── test/
    │           ├── typescript/ (environment, utils, resilience, pool unit tests)
    │           └── resources/ (test-core-config.yml)
    ├── model-connector-client/
    │   ├── .gitignore
    │   ├── package.json
    │   ├── README.md
    │   ├── config/
    │   │   └── typescript/ (tsconfig.json, tsconfig.test.json)
    │   └── src/
    │       ├── main/
    │       │   ├── typescript/                 # All .ts source files
    │       │   │   ├── adapters/
    │       │   │   ├── client/
    │       │   │   ├── domain/ (constants, errors, models)
    │       │   │   ├── strategies/ (api, cli, cookie)
    │       │   │   └── index.ts
    │       │   └── resources/                  # Configuration & YAML assets
    │       │       ├── application.yml
    │       │       └── client-defaults.json
    │       └── test/
    │           ├── typescript/ (unit/client.test.ts)
    │           └── resources/ (test-config.yml)
    ├── model-connector-service/
    │   ├── .gitignore
    │   ├── package.json
    │   ├── README.md
    │   ├── config/
    │   │   └── typescript/ (tsconfig.json, tsconfig.test.json)
    │   └── src/
    │       ├── main/
    │       │   ├── typescript/                 # Express backend source files
    │       │   │   ├── config/
    │       │   │   ├── constants/
    │       │   │   ├── controllers/
    │       │   │   ├── middleware/
    │       │   │   ├── routes/
    │       │   │   ├── services/
    │       │   │   └── index.ts
    │       │   └── resources/                  # Service Dockerfile & YAML
    │       │       ├── Dockerfile
    │       │       └── application.yml
    │       └── test/
    │           ├── typescript/ (unit/service.test.ts)
    │           └── resources/ (application-test.yml)
    └── model-connector-ui/
        ├── .gitignore
        ├── package.json
        ├── README.md
        ├── config/
        │   ├── typescript/ (tsconfig.json)
        │   └── vite/ (vite.config.ts)
        └── src/
            ├── main/
            │   ├── typescript/                 # React 18 & TSX application
            │   │   ├── components/ (chat, layout, metrics, models, sessions)
            │   │   ├── services/
            │   │   ├── types/
            │   │   ├── App.tsx
            │   │   ├── main.scss (Modular SCSS styling)
            │   │   └── main.tsx
            │   └── resources/                  # Frontend Dockerfile, HTML & Nginx
            │       ├── Dockerfile
            │       ├── index.html
            │       ├── nginx.conf
            │       └── application.yml
            └── test/
                ├── typescript/ (unit/ui.test.ts)
                └── resources/ (test-ui-config.yml)
```

---

## 📦 Multi-Module Package Breakdown

### 1. `model-connector-core` (`packages/model-connector-core`)
Cross-cutting enterprise foundation module conforming to **STD-COD-001 through STD-COD-010**:
- **Spring-Style `Environment` (`StandardEnvironment`)**: Centralized interface providing profile management (`getActiveProfiles()`, `acceptsProfiles()`), relaxed binding (`server.port` <-> `SERVER_PORT`), type-safe conversion, fail-fast required checks, and platform detection without direct `process.env` scattering.
- **Strict Process & Utils Encapsulation (`processUtils`, `argParser`, `fileUtils`, `concurrencyUtils`, `cryptoUtils`)**: All direct interactions with `process.env`, `process.pid`, `process.platform`, `process.exit()`, and `process.argv` are strictly routed through this leaf package.
- **Resilience4j Fault-Tolerance Engine**: Full state-machine `CircuitBreaker`, exponential backoff `RetryPolicy`, token bucket `RateLimiter`, concurrency-limiting `Bulkhead`, and composable `ResiliencePipeline`.
- **Generic Object & Connection Pool (`ObjectConnectionPool`)**: HikariCP-inspired pooling with `minConnections`, `maxConnections`, acquire timeouts, and wait-queue management.
- **Protocol Configurations & Logging**: Protocol configuration beans for REST, gRPC, WebSocket, Security, and structured JSON / ANSI console logging with correlation ID propagation.

### 2. `model-connector-client` (`packages/model-connector-client`)
Reusable enterprise client library implementing model connectivity through the **Strategy Pattern** (`STD-COD-005`):
- **CLI Connectivity (`CliConnectorStrategy`)**: Headless non-interactive process orchestration (`@google/gemini-cli`, `ollama`), token accounting, and timeout governance.
- **REST API Connectivity (`ApiConnectorStrategy`)**: Native HTTP/REST and streaming SSE dispatch with automatic header injection and correlation ID propagation.
- **Cookie Session Lineage (`CookieConnectorStrategy`)**: `SessionLineageManager` maintaining session cookie lineage and rotation.
- **Upstream Gemini Connector Adapter (`GeminiConnectorAdapter`)**: Synchronizes verified models, health, and audit logs from upstream `gemini-model-connector`.

### 3. `model-connector-service` (`packages/model-connector-service`)
Production Node.js Express backend service:
- Consumes `@model-box/model-connector-core` and `@model-box/model-connector-client` as internal workspace library dependencies.
- Exposes clean REST API and Server-Sent Events (SSE) streaming endpoints.
- Global security and tracing middleware (`helmet`, `cors`, `x-correlation-id`, `x-trace-id`).
- Zod request validation and domain exception error mapping (`STD-COD-007`).

### 4. `model-connector-ui` (`packages/model-connector-ui`)
Modern React Web and Mobile application built with Vite:
- **Responsive Dual Layout**: Desktop sidebar navigation and touch-friendly mobile bottom navigation bar.
- **Omni-Channel Model Chat**: Live interactive prompt execution with dynamic toggle between **CLI Strategy**, **REST API**, and **Cookie Session** modes.
- **Model Registry & Capabilities**: Visual card grid of discovered models from upstream Gemini Model Connector and local runtimes.
- **Cookie & Session Lineage Vault**: Visual cookie jar inspector displaying session cookies, turn counts, and lineage switching.
- **Upstream Sync Monitor**: Real-time status cards for upstream health and compliance audit logs.
- **Glassmorphism Design System**: Curated dark palette, fluid gradients, typography (`Inter`, `Outfit`, `JetBrains Mono`), and subtle micro-interactions.

### 5. Multi-Model OAuth 2.0 Integration & Strategy Pattern (`STD-COD-005`)
Aligned with the official [Gemini CLI authentication setup | Gemini CLI](https://geminicli.com/docs/get-started/authentication/) and documentation:
- **Individual Account Authentication Support**:
  - **Google Gemini**: Full support for personal Google accounts (Free tier, Google AI Pro / Ultra, personal Gmail) via `gemini auth login --browser`. **No Google Cloud Project required** (unlike enterprise Vertex AI projects). Credentials cached locally in `~/.gemini`.
  - **xAI Grok**: Individual developer portal tokens via `xai auth login` ([xAI Docs](https://docs.x.ai/)).
  - **Anthropic Claude**: Individual Claude Pro / Team / Max credentials via `claude login` ([Claude Code Overview](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview)).
  - **GitHub Copilot**: Personal Copilot subscriptions via `gh auth login --web` ([Copilot Individual Subscriber Guide](https://docs.github.com/en/copilot/managing-copilot/managing-copilot-as-an-individual-subscriber)).
  - **OpenAI**: Personal user accounts and developer API tokens via `openai login` ([OpenAI Quickstart](https://platform.openai.com/docs/quickstart)).
- **Strategy Pattern Architecture**: Replaced ad-hoc conditionals with polymorphic provider strategies (`GoogleGeminiOAuthStrategy`, `XAiGrokOAuthStrategy`, `AnthropicClaudeOAuthStrategy`, `OpenAiOAuthStrategy`, `GitHubCopilotOAuthStrategy`, `MicrosoftAzureOAuthStrategy`) in both backend (`modelOAuthProviderService.ts`) and frontend (`oauthProviderRegistry.ts`).
- **Trusted & Authorized Scopes (Zero Restricted Client Errors)**:
  - Google Gemini requests only trusted, public OAuth scopes: `openid`, `https://www.googleapis.com/auth/userinfo.email`, `https://www.googleapis.com/auth/userinfo.profile`, `https://www.googleapis.com/auth/cloud-platform`.
  - Omits unregistered restricted scopes (`generative-language`), completely preventing `Error 403: restricted_client`.
- **Google Client ID**: Resolved from the database-backed OAuth client registry (`PROVIDER_OAUTH_CLIENTS`) and surfaced to UI for redirect construction.
- **Antigravity Gemini CLI Mode (No Manual Client Metadata in Files)**: When Google client registration is not configured in DB, Antigravity falls back to Gemini CLI-native login instructions (`gemini` → **Sign in with Google**), and OAuth client metadata remains DB/runtime-managed only.
- **Default Loopback Redirect URI**: `http://localhost:8085/oauth2callback`
- **RFC Compliance**: Employs PKCE / Web Consent with structured audit state (`app=modelbox-studio&provider=google&model=gemini-3.8-flash&flow=cli_oauth&nonce=...&ts=...`), completely eliminating Google's `Error 401: invalid_client` and `Error 403: restricted_client`.
- **Live Gemini OAuth Verification**: `cli_oauth` verification now routes through CLI execution and requires real model output; unauthorized OAuth tokens are no longer treated as verified.
- **No Simulated OAuth Success**: Loopback OAuth flows now redirect to real provider authorization endpoints and no longer mint synthetic PKCE/session tokens.
- **No YAML Client Secrets**: OAuth `clientId` / `clientSecret` are not sourced from YAML; they are loaded from database OAuth client records.
- **Database-Persisted Multi-Auth**: Successful OAuth exchanges are persisted into `MODEL_ACCOUNTS` with provider metadata, enabling multiple account credentials per model/user.

---

## 🐳 Dual-Service Docker Compose

The platform provides a hermetic dual-service setup in `config/docker/docker-compose.yml`:

| Container | Service Name | Base Image | Port | Description |
| :--- | :--- | :--- | :--- | :--- |
| `backend` | `model-connector-service` | `node:22-bookworm-slim` | `8095` | REST & SSE API microservice running client & core libraries |
| `frontend` | `model-connector-ui` | `nginx:alpine-slim` | `3005` (mapped to 80) | High-performance Nginx static web server with API reverse proxy |

### Starting Dual Services

```bash
# Build and run containers
npm run docker:build
npm run docker:up

# View combined container logs
npm run docker:logs

# Stop containers
npm run docker:down

# Prune unused and <none> images
npm run docker:prune-unused
```

---

## 🧪 Verification & Building

```bash
# Run automated verification suite
npm run verify

# Run full Node + Python pipeline strictly inside Docker
npm run docker:pipeline

# Build all packages via workspaces
npm run build

# Run unit tests across workspaces
npm run test
```
