# Playwright MCP Engine

High-concurrency, JSON-driven Playwright application and Model Context Protocol (MCP) server for enterprise web automation, API endpoint cataloging, dynamic authentication sniffing, and code generation with native connectors to **Ollama** and **ComfyUI**.

---

## 🌟 Key Architecture & Features

### 1. Pure Application (Not a Testing Framework)
- Built directly on Playwright (`playwright` core), avoiding `@playwright/test` runners or static test assertions.
- Operates as a background application engine, CLI tool, or headless MCP server that dynamically parses and executes JSON workflows across live web targets.

### 2. Strict `@/...` Path Aliasing (No Relative Imports)
- **Zero relative imports**: All internal imports across the codebase strictly use `@/...` path aliases (e.g. `@/core/config.js`, `@/concurrency/browser-pool.js`, `@/network/sniffer.js`).
- Enforced at both compile-time (`tsconfig.json`), runtime (`package.json#imports`), and via automated import validation (`scripts/verify-imports.js`).

### 3. Deep Endpoint & Authentication/Authorization Sniffer
- Hooks into every page network event to index URLs, HTTP methods, headers, payloads, status codes, and timing.
- **Intelligent Auth Classifier**: Automatically detects and categorizes:
  - `Bearer` JWT tokens in `Authorization` headers.
  - HTTP `Basic` authentication credentials.
  - Custom API keys in headers (`X-API-Key`, `apikey`) or query parameters (`?access_token=...`).
  - Session cookies (`session`, `jwt`, `sid`, `connect.sid`).
  - HTTP 401 Unauthorized and 403 Forbidden endpoints.
  - OAuth2/SSO redirects (`/oauth`, `/auth`, `/login`, Auth0, Cognito).
- Yields a structured endpoint catalog marking whether authentication or specific authorization scopes are required.

### 4. Dynamic JSON Workflow Engine (Low Static Values)
- Eliminates hardcoded selectors, URLs, and static data.
- **Dynamic Resolver**: Evaluates dynamic expressions such as `{{vars.query}}`, `{{env.KEY}}`, `{{steps.login.extracted.token}}`, `{{now()}}`, and `{{randomId()}}`.
- **Selector Fallback Cascade**: Selectors can be configured as prioritized arrays with fallback strategies (CSS, XPath, Text, ARIA).
- Ingests and stores runtime outputs into `context.extracted` for consumption by downstream steps.

### 5. High Concurrency & Watchdog Stuck-Process Killer
- **Browser Pool**: Manages worker slots and isolated browser contexts under high parallel workloads.
- **Task Watchdog**: Monitors individual step and overall workflow execution deadlines.
- **Stuck Process Killer**: If a page or worker freezes (infinite loops, unhandled alert dialogs, hung network calls):
  1. Enforces a strict grace period.
  2. Identifies the child browser process PID.
  3. Forcefully terminates the process tree using `SIGKILL` / `taskkill`.
  4. Automatically cleans up worker slots and respawns a fresh browser instance.
  5. Marks the execution response with `status: 'STUCK_PROCESS_KILLED'` along with full diagnostic telemetry.

### 6. Resilience: Concurrency Tracker, Circuit Breaker & Retries
- **Concurrency Tracker**: Monitors active worker concurrency, peak concurrency, queued wait times, throughput, and average latency.
- **Domain Circuit Breaker**: State machine (`CLOSED`, `OPEN`, `HALF_OPEN`) per target domain. Fast-fails immediately when a target site is unavailable, preventing worker starvation.
- **Retry Engine**: Exponential backoff with jitter and retryable error classification.
- **Response Telemetry**: Enriches every execution result with complete metrics (concurrency level, circuit breaker state, retries attempted, stuck process kills, and auth summaries).

### 7. Docker Connectors for Ollama and ComfyUI
- Joins the shared `model-box-net` network with direct service connectors:
  - **Ollama**: Connects to `http://ollama-model-service-gpu:11434` for AI visual analysis of screenshots, selector synthesis, and prompt generation.
  - **ComfyUI**: Connects to `http://comfyui-model-service-gpu:8188` to trigger generative image/video graphs and poll output assets directly from browser automation flows.

### 8. Enterprise Google X-Ray Automation (Talent Sourcing & OSINT)
- **Zero-Branching Architecture**: Complete adherence to OOP and SOLID principles (Strategy Pattern, Builder Pattern, Dictionary Dispatch) with 0 `if`/`switch` statements.
- **Synthesized Boolean Search**: Automatically constructs specialized Google search queries across:
  - **LinkedIn Profiles**: `site:linkedin.com/in "Senior Engineer" "Distributed Systems" -dir -jobs`
  - **GitHub Accounts**: `site:github.com "vLLM" "PyTorch" -stars -topics`
  - **StackOverflow Users**: `site:stackoverflow.com/users "Kubernetes"`
  - **Document / Resumes**: `filetype:pdf ("resume" OR "cv") "Staff Backend"`
  - **Custom Domains**: Tailored domain slicing with exact phrases and negative filters.
- **Microservice & REST Integration**: Exposes REST endpoints (`POST /api/xray/search`, `GET /api/xray/templates`, `POST /api/xray/preview`) alongside the MCP tool.
- **Resilience**: Integrated with worker slot pooling, domain circuit breakers (`google.com`), and concurrency telemetry.

---

## 📂 Project Structure

```
playwright-mcp-engine/
├── package.json                   # Dependencies, scripts, and "@/*" subpath imports
├── README.md                      # Architecture documentation & execution guide
├── .gitignore                     # Enterprise-grade git ignore specification
├── .dockerignore                  # Enterprise-grade docker build ignore specification
├── config/
│   ├── tsconfig.json              # TypeScript compiler config targeting @/* paths
│   ├── deploy/
│   │   ├── Dockerfile             # Multi-stage hardened build (node:22-alpine + Playwright)
│   │   ├── docker-compose.yml     # Compose orchestration with playwright-mcp.env
│   │   ├── playwright-mcp.env     # Active service configuration
│   │   ├── playwright-mcp.env.example # Environment variable template
│   │   └── .dockerignore          # Context-scoped build rules
│   ├── scripts/
│   │   ├── clean.ts               # TypeScript cleaner for build artifacts
│   │   ├── healthcheck.ts         # TypeScript healthcheck validator
│   │   ├── verify-imports.ts      # TypeScript linter enforcing 100% @/* imports
│   │   └── run-example.ts         # TypeScript test runner validating workflow parsing & code gen
│   └── examples/
│       └── workflows/
│           ├── dynamic-search-workflow.json
│           ├── auth-endpoint-scan-workflow.json
│           ├── multimodal-ai-workflow.json
│           └── test-stuck-process.json
└── src/
    ├── index.ts                   # Application bootstrap & CLI command center
    ├── constants/
    │   └── index.ts               # Single source of truth for all centralized static values
    ├── core/
    │   ├── config.ts              # Configuration with Docker network fallbacks
    │   ├── constants.ts           # Core constants re-export
    │   └── logger.ts              # Structured timestamped colored logger
    ├── types/
    │   ├── workflow.ts            # Dynamic JSON workflow schema & response types
    │   ├── network.ts             # Interception, endpoint catalog, & auth types
    │   ├── concurrency.ts         # Worker slots, pool config, & metrics types
    │   └── resilience.ts          # Circuit breaker, retry options, & attempt types
    ├── engine/
    │   ├── dynamic-resolver.ts    # Template {{var}} & fallback selector resolver
    │   ├── workflow-parser.ts     # Zod schema validator for JSON workflows
    │   ├── step-executor.ts       # Action dispatcher (navigate, click, extract, AI)
    │   └── workflow-orchestrator.ts # Master coordinator linking pool, watchdog, & CB
    ├── xray/
    │   ├── types.ts               # X-Ray platforms, query parameters, & profile metadata
    │   ├── query-builder.ts       # Boolean operator synthesis with no string concatenation
    │   ├── platform-strategies.ts # Strategy Pattern for LinkedIn, GitHub, StackOverflow, PDF
    │   ├── xray-service.ts        # Distributed OOP service with slot leasing & circuit breakers
    │   └── xray-route-handler.ts  # HTTP REST endpoints (/api/xray/search, templates, preview)
    ├── network/
    │   ├── sniffer.ts             # Playwright page request/response interceptor
    │   ├── auth-detector.ts       # Heuristic auth & authz classification engine
    │   └── endpoint-catalog.ts    # Aggregator indexing all discovered endpoints
    ├── concurrency/
    │   ├── browser-pool.ts        # Concurrency worker pool & auto-respawn
    │   ├── watchdog.ts            # Step watchdog & hung task detector
    │   └── process-killer.ts      # Forceful PID & process tree killer
    ├── resilience/
    │   ├── circuit-breaker.ts     # Domain-level failure tracker & circuit breaker
    │   ├── retry-handler.ts       # Exponential backoff with jitter
    │   └── concurrency-tracker.ts # Response marker & metrics snapshot recorder
    ├── connectors/
    │   ├── ollama-connector.ts    # Visual analysis & selector synthesis via Ollama
    │   └── comfyui-connector.ts   # Asset generation graph trigger via ComfyUI
    ├── generator/
    │   └── code-generator.ts      # Synthesizes Playwright TypeScript code & MCP calls
    └── mcp/
        ├── server.ts              # MCP Server (HTTP/SSE & stdio transports)
        └── tools.ts               # Tool definitions (execute_workflow, google_xray_search, etc.)
```

---

## 🛠 Model Context Protocol (MCP) Tools

When running with `--mcp`, the engine registers the following tools:

| Tool Name | Description |
|---|---|
| `execute_workflow` | Parses and executes dynamic JSON workflow with concurrency tracking, stuck kill, and auth sniffing. |
| `google_xray_search` | Executes enterprise Google X-Ray search automation across LinkedIn, GitHub, StackOverflow, and custom domains. |
| `catalog_endpoints` | Scans a website, indexes all API endpoints, and flags required authentication/authorization. |
| `generate_playwright_code` | Converts a JSON workflow into generalized Playwright TypeScript code using `@/...` imports. |
| `ollama_assist` | Queries Ollama for visual analysis, selector synthesis, or workflow generation. |
| `comfyui_generate` | Triggers ComfyUI image/video pipelines directly from browser automation context. |
| `get_engine_metrics` | Returns real-time concurrency snapshots, active worker slots, and circuit breaker states. |

---

## 🌐 Google X-Ray REST API Endpoints

The HTTP server exposes REST endpoints for microservice integration:

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/xray/search` | Execute Google X-Ray search automation in browser pool |
| `GET` | `/api/xray/templates` | Retrieve pre-configured enterprise templates (LinkedIn, GitHub, Resumes) |
| `POST` | `/api/xray/preview` | Preview compiled Google search query string and URL without launching browser |

### Sample REST Request:
```bash
curl -X POST http://localhost:8000/api/xray/search \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "linkedin",
    "role": "Staff Distributed Systems Engineer",
    "skills": ["TypeScript", "Kubernetes", "Playwright"],
    "location": "San Francisco Bay Area",
    "limit": 10
  }'
```

### CLI Command Options:
```bash
# Preview compiled query string without browser
node dist/index.js --xray-platform linkedin --xray-role "Staff Engineer" --xray-skills "TypeScript,Kubernetes" --xray-preview

# Execute live X-Ray search
node dist/index.js --xray-platform github --xray-skills "vLLM,PyTorch" --xray-location "Remote"
```

---

## 📋 Sample Workflow Execution Output

```json
{
  "workflowId": "wf-dynamic-search-and-extract",
  "workflowName": "Dynamic Search & Data Extraction Workflow",
  "status": "SUCCESS",
  "startedAt": "2026-10-03T07:35:00.120Z",
  "completedAt": "2026-10-03T07:35:03.450Z",
  "durationMs": 3330,
  "concurrencyMetrics": {
    "activeWorkersAtStart": 1,
    "activeWorkersAtEnd": 0,
    "peakObservedConcurrency": 4,
    "queuedWaitDurationMs": 12,
    "slotAssigned": 1
  },
  "resilienceMetrics": {
    "retriesAttempted": 0,
    "circuitBreakerState": "CLOSED",
    "stuckProcessKilled": false
  },
  "networkAuthSummary": {
    "endpointsScanned": 8,
    "authDetected": true,
    "authRequiredCount": 2,
    "authTypesDiscovered": ["cookie_session", "bearer_token"],
    "topProtectedEndpoints": [
      {
        "method": "POST",
        "url": "https://target.com/api/v1/auth/session",
        "authType": "bearer_token",
        "reason": "Attach Authorization header with valid Bearer token."
      }
    ]
  },
  "extractedOutputs": {
    "topStoryTitle": "ModelBox: Next-Gen AI Automation Engine"
  }
}
```

---

## 🚀 High-Performance & High-Concurrency Architecture

The `modelbox-playwright-mcp` service is engineered for enterprise-grade throughput and massive concurrent browser workloads:

- **Large Shared Memory (`shm_size: 2gb` & `ipc: host`)**: Eliminates `/dev/shm` buffer exhaustion during multi-tab, heavy JavaScript execution and high-resolution screenshot captures.
- **Dynamic Slot Pool (`PLAYWRIGHT_MAX_CONCURRENCY=25`)**: Manages isolated worker slots with sub-millisecond polling and non-blocking slot queues.
- **Node & OS Optimization (`UV_THREADPOOL_SIZE=64`, `--max-old-space-size=4096`)**: Expands asynchronous I/O thread limits and increases heap space for parallel AST transformations and network streams.
- **Optimized Chromium Flags**: Completely bypasses GPU virtualization overhead, disables background networking/throttling, enables clean multi-process execution, and enforces strict memory-efficient rendering.

---

## 💾 Bidirectional Mount Points & Permanent Browser Caching

Three bidirectional volume mounts link the host environment with the container:

| Host Directory | Container Mount Target | Purpose |
| :--- | :--- | :--- |
| `playwright-mcp-engine/workflows/` | `/app/workflows` | Live, bidirectional persistence of recorded and generated workflow JSON files. Files created in the container appear immediately on the host and vice versa. |
| `playwright-mcp-engine/browsers/` | `/ms-playwright` | Permanent caching of Playwright browser binaries (Chromium, Headless Shell, FFmpeg). **Prevents browser downloads repeatedly across container recreations**. |
| `playwright-mcp-engine/downloads/` | `/app/downloads` | Live bidirectional file downloads extracted during browser automation tasks. |

---

## 🎥 Interactive Workflow Recording & Codegen Streaming

The engine provides dual recording capabilities: visual manual recording via web-streamed Playwright Codegen, and autonomous natural language workflow synthesis with Ollama revalidation.

### 1. Interactive Visual Recording via Playwright Codegen & noVNC (Port 6080)

To record a manual user workflow on any web target (e.g. LinkedIn, internal portals) without needing local Node or Playwright installed on your host machine:

#### Start Interactive Recording Server:
```bash
docker exec -d modelbox-playwright-mcp bash /app/config/scripts/run-interactive-recorder.sh https://www.linkedin.com
```

#### Access Live Browser & Recorder:
1. Open your host browser to:
   ```
   http://localhost:6080/vnc.html?autoconnect=true&resize=remote
   ```
2. Interact visually with the live Chromium browser window (click, fill, search, navigate).
3. The Playwright Inspector window runs side-by-side inside the virtual display, capturing your actions in real time.
4. When finished, simply close the browser window inside the noVNC session.

#### Automated JSON Schema Compilation:
The session automatically runs `/app/config/scripts/codegen-to-workflow.js` upon exit, converting recorded Playwright actions into the standardized Workflow JSON Schema with fallback selector cascades and enterprise timeouts, saved directly to:
```
playwright-mcp-engine/workflows/linkedin_manual_flow.json
```

You can also manually re-trigger the converter at any time:
```bash
docker exec modelbox-playwright-mcp node /app/config/scripts/codegen-to-workflow.js \
  /app/workflows/linkedin_codegen_raw.js \
  /app/workflows/linkedin_manual_flow.json \
  https://www.linkedin.com
```

---

### 2. Autonomous Workflow Synthesis & Ollama Revalidation

Synthesize full dynamic JSON workflows from natural language descriptions with 2-pass AI cross-validation and automatic schema action normalization:

#### Describe & Generate Endpoint:
```bash
curl -X POST http://localhost:8940/api/workflow/describe-and-generate \
  -H "Content-Type: application/json" \
  -d '{
    "userDescription": "Navigate to LinkedIn, search for AI and Machine Learning Engineers, apply location filter for Remote, wait for search results to render, and extract profile links and titles.",
    "baseUrl": "https://www.linkedin.com",
    "customName": "linkedin_ai_talent_search"
  }'
```
- **Step 1**: Synthesizes the workflow structure with `llama3.2:latest`.
- **Step 2**: Injects generic schema defaults and normalizes action types (`navigate`, `click`, `fill`, etc.).
- **Step 3**: Revalidates against user intent and persists to `/app/workflows/<customName>.json`.

---

### 3. Programmatic Headless Recording REST API

#### Start Headless DOM Recording Session:
```bash
curl -X POST http://localhost:8940/api/workflow/record/start \
  -H "Content-Type: application/json" \
  -d '{"targetUrl": "https://www.linkedin.com"}'
```

#### Stop Recording & Persist Workflow:
```bash
curl -X POST http://localhost:8940/api/workflow/record/stop \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "rec-5df4e600", "actionName": "linkedin_flow"}'
```

#### List Workflows:
```bash
curl http://localhost:8940/api/workflows
```

Workflows follow the professional naming pattern: `wf_{domain}_{action}_{timestamp}.json` (e.g. `wf_linkedin_navigate_20261003_102944.json`).

---

## 💼 LinkedIn Job Requirements Extraction Pipeline (Ollama + Markdown + PostgreSQL)

During automated navigation or recorded manual workflows over job postings (e.g., Software Engineer, Solutions Architect), the engine automatically captures full job requirement details, structures them via Ollama (`llama3.2`), generates readable `.md` files with direct LinkedIn links, and persists all attributes into PostgreSQL.

### 🌟 Key Pipeline Features
1. **Ollama Semantic Structuring**: Extracts technical competencies, tech stack arrays, core responsibilities, qualifications, workplace type (Remote/Hybrid/On-site), and experience level.
2. **Direct Markdown Artifacts**: Writes formatted `.md` documents with frontmatter and direct LinkedIn URLs into `workflows/job_requirements/`, immediately accessible on the host via bidirectional volume mount.
3. **PostgreSQL Relational & JSON Storage**: Inserts or updates the `MB_JOB_REQUIREMENTS` table in PostgreSQL (`model-connectors-postgres`) with indexed job IDs, raw text, and parsed JSON columns.
4. **Direct LinkedIn Link Preservation**: Every extracted record and markdown file retains the exact clickable LinkedIn posting URL (`https://www.linkedin.com/jobs/view/<jobId>`).

### 🛠️ Execution Methods

#### Method A: Inside JSON Workflows (`extract_job_requirement` action)
```json
{
  "id": "step-25-extract",
  "action": "extract_job_requirement",
  "description": "Extract requirements for clicked job role using Ollama",
  "timeoutMs": 60000,
  "optional": true,
  "continueOnError": true
}
```

#### Method B: REST API Endpoint (`POST /api/workflow/job-requirement`)
```bash
docker exec modelbox-playwright-mcp node -e "
fetch('http://127.0.0.1:8940/api/workflow/job-requirement', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jobId: '4438692931',
    jobTitle: 'Lead Software Engineer',
    companyName: 'NetApp',
    location: 'Mumbai, India',
    linkedinUrl: 'https://www.linkedin.com/jobs/view/4438692931/',
    rawDescription: 'Seeking Lead Software Engineer with 8+ years experience in C++, Go, Python, Kubernetes, and Cloud Architecture.',
    workplaceType: 'Hybrid',
    experienceLevel: 'Mid-Senior level'
  })
}).then(r => r.json()).then(console.log);
"
```

#### Method C: List All Saved Job Requirements (`GET /api/workflow/job-requirements` & `GET /api/v1/jobs`)
All job queries across MCP, Python, and the UI are **strictly sorted by time when first listed on the portal** (`first_listed_at DESC NULLS LAST, extracted_at DESC`).
```bash
# Via MCP Engine
docker exec modelbox-playwright-mcp node -e "
fetch('http://127.0.0.1:8940/api/workflow/job-requirements')
  .then(r => r.json())
  .then(d => console.log('Jobs count:', d.count, 'Sorted by:', d.sorted_by, 'First job:', d.jobs[0].title, 'at', d.jobs[0].company, 'Listed:', d.jobs[0].first_listed_at, 'Official URL:', d.jobs[0].official_apply_url));
"

# Via Python Service Gateway
docker exec modelbox-playwright-mcp node -e "
fetch('http://model-connectors-service:8000/api/v1/jobs')
  .then(r => r.json())
  .then(d => console.log('Python Service returned', d.count, 'jobs sorted by', d.sorted_by));
"
```

#### Method D: Query Directly from PostgreSQL
```bash
docker exec model-connectors-postgres psql -U postgres -d model_connectors -c \
  "SELECT job_id, job_title, company_name, first_listed_at, official_apply_url, linkedin_url FROM mb_job_requirements ORDER BY first_listed_at DESC NULLS LAST;"
```

---

## 🍪 Bidirectional Chrome MCP Cookie & Session Persistence

The Playwright MCP Engine retains browser authentication across container restarts and recording workflows bidirectionally:

1. **Volume Mount & File Locations**:
   - **Host Path**: `applications/ai-ml-applications/playwright-mcp-engine/workflows/auth/`
   - **Container Path**: `/app/workflows/auth/`
   - **Native Playwright State**: `storage_state.json` (cookies + local storage origins)
   - **Human-Readable Export**: `cookies.json`

2. **Automatic Lifecycle**:
   - `workflow-orchestrator.ts`: Pre-loads `storage_state.json` into `browser.newContext({ storageState })` before starting any navigation or recording.
   - Upon session completion or recorder stop, updated cookies and storage states are automatically synchronized back to disk.

3. **REST & MCP Endpoints**:
   - `GET /api/workflow/auth/cookies` (MCP) & `GET /api/v1/jobs/cookies` (Python): Returns cookie count, domains (e.g. `.linkedin.com`), and file modification timestamp.
   - `POST /api/workflow/auth/cookies` (MCP) & `POST /api/v1/jobs/cookies` (Python): Imports cookies into storage state.
   - `GET /api/workflow/auth/cookies/export` (MCP) & `GET /api/v1/jobs/cookies/export` (Python): Downloads JSON storage state.
   - `DELETE /api/workflow/auth/cookies` (MCP) & `DELETE /api/v1/jobs/cookies` (Python): Clears session state.

4. **Official Apply URL Probe (Apply Button)**:
   - When reviewing or extracting a job posting, the engine inspects the "Apply" / "Apply on company website" button.
   - Probes target popup/redirect destinations without submitting the form to resolve the official careers portal URL (`official_apply_url`, e.g. Workday, Greenhouse, Lever).
   - Persisted alongside `first_listed_at` timestamp in PostgreSQL `mb_job_requirements`.

## 🛠️ Docker Container Operations Guide

Use these commands to manage, clean, build, and recreate the ModelBox Docker infrastructure:

### 1. Clean Unwanted Docker Artifacts (Images, Volumes, Builder Cache)
```bash
# Prune dangling/unused images
docker image prune -f

# Prune Buildx and build cache
docker builder prune -f

# Prune unused anonymous volumes (WARNING: does not affect named/mounted volumes)
docker volume prune -f
```

### 2. Build Specific Container (`modelbox-playwright-mcp`)
```bash
# Build from model-connectors deploy directory
cd model-box/applications/ai-ml-applications/model-connectors/deploy/docker
docker compose build modelbox-playwright-mcp

# Or direct build from engine root
cd model-box/applications/ai-ml-applications/playwright-mcp-engine
docker build -f config/deploy/Dockerfile -t modelbox-playwright-mcp:latest .
```

### 3. Recreate Specific Container (`modelbox-playwright-mcp`)
```bash
cd model-box/applications/ai-ml-applications/model-connectors/deploy/docker
docker compose up -d --force-recreate modelbox-playwright-mcp
```

### 4. Build & Recreate Specific Container in One Step
```bash
cd model-box/applications/ai-ml-applications/model-connectors/deploy/docker
docker compose up -d --build --force-recreate modelbox-playwright-mcp
```

### 5. Recreate All Containers in Compose
```bash
cd model-box/applications/ai-ml-applications/model-connectors/deploy/docker
docker compose up -d --force-recreate
```

### 6. Monitor Container Health & Logs
```bash
# Inspect container status and healthcheck
docker ps --filter "name=modelbox-playwright-mcp"

# Stream live container logs
docker logs -f modelbox-playwright-mcp
```
