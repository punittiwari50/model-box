# Gemini Model Connector (Node.js Server Side)

An enterprise Node.js server-side model connector providing context-aware conversational threads, an intelligent **Job Search & Resume Alignment Agent**, and immutable **SQLite audit logging**, communicating with the official [Google Gemini CLI](https://github.com/google-gemini/gemini-cli.git) on every API request.

Built in strict compliance with the enterprise engineering standards defined in:  
`C:\DEV\SOURCES\skill-matrix\skills\standards\`

---

## 🏛️ Standards Compliance Matrix (`skill-matrix`)

| Standard ID | Domain | Implementation in `gemini-model-connector` |
| :--- | :--- | :--- |
| **`STD-BLD-001`** | **Hermetic Container Builds & Host Integration** | Zero language runtime execution on the host machine. Both Node.js and Python toolchains execute strictly inside isolated Docker containers. |
| **`STD-BLD-002`** | **Stack-Isolated Builder Images** | Node.js container (`gemini-model-connector`) contains only Node 22 LTS and `@google/gemini-cli`. Python container (`gemini-python-verifier`) contains only Python 3.12 and verification packages. No cross-runtime bloat. |
| **`STD-BLD-006`** | **Workspace Directory Grid & Scripts** | Standardized `scripts/` suite (`build.ps1`/`build.sh`, `verify.ps1`/`verify.sh`, `deploy.ps1`/`deploy.sh`). Standardized directory layout (`data/`, `artifacts/`, `src/`). |
| **`STD-BLD-008`** | **Bidirectional Persistence** | Container outputs (SQLite `.db`, generated `.md` resume artifacts) are mounted bidirectionally to host `./data` and `./artifacts` volumes. |
| **`STD-COD-001`** | **Module Imports & Boundary Integrity** | Unidirectional module hierarchy. No traversal beyond root package boundary. |
| **`STD-COD-002`** | **Centralized Configuration** | Single immutable configuration object in `src/config/index.ts`. No scattered `process.env` calls across business services. |
| **`STD-COD-004`** | **Cyclic Dependencies Prevention** | Clean layered architecture (`domain` -> `infrastructure` -> `application` -> `presentation`). Zero circular imports. |
| **`STD-COD-006`** | **Cyclomatic & Cognitive Complexity** | Functions bounded to $CC \le 10$, cognitive complexity $\le 15$, and nesting depth $\le 3$. |
| **`STD-COD-007.1`** | **Meaningful Naming & Intention** | Self-documenting domain identifiers, positive boolean flags, unit-bearing metrics (`latency_ms`, `cli_timeout_ms`). |
| **`STD-COD-007.2`** | **Function Cohesion & SLAP** | Methods broken down to $\le 20$ lines per function with $\le 3$ parameters at a single level of abstraction. |
| **`STD-COD-007.4`** | **Resilient Error Handling** | Zero swallowed errors, typed domain exceptions, and non-blocking failure boundaries. |
| **`STD-COD-007.5`** | **Immutability by Default** | `readonly` interfaces and frozen structures across domain models and DTOs. |

---

## 🌟 Key Features

1. **Google Gemini CLI Headless Orchestration**:
   - Communicates with `@google/gemini-cli` via headless, non-interactive execution (`-m`, `--non-interactive`, `--output-format json`, `-p`).
   - Captures stdout, stderr, execution latency in milliseconds, token counts (input/output/total), and CLI exit codes.
   - Built-in simulation fallback for environments without an active API key or offline testing.

2. **Zero-Host-Prerequisite Dual Containerization**:
   - **Node.js Service**: Production container based on `node:22-bookworm-slim` with `@google/gemini-cli` globally installed.
   - **Python Verifier**: Dedicated container based on `python:3.12-slim` for hermetic test execution and API verification.
   - `docker-compose.yml` preconfigured with an internal bridge network (`gemini-network`) and persistent volumes.

3. **Job Search & Resume Alignment Agent**:
   - Ingests job requirements from **HTML**, **Image screenshots / OCR descriptions**, **Public URLs**, or **Plain Text**.
   - Compares requirements against candidate inline resumes.
   - Computes match score percentage (0–100%), extracts matched technical competencies, detects skill gaps, and suggests tailored modifications.
   - Automatically generates structured Markdown files (`.md`) saved safely to the artifacts directory.

4. **Immutable SQLite Audit Logging**:
   - Persists all API communications, conversation turns, prompt payloads, model tokens, and request latencies to SQLite.
   - Searchable audit endpoint (`GET /api/v1/audit/logs`) for regulatory compliance, security verification, and administrative inspection.

5. **Integrated Web UI Dashboard**:
   - Single Page Application (SPA) dashboard served directly at `http://127.0.0.1:8090/`.
   - Live conversational thread explorer, interactive Gemini CLI chat interface, visual Job Search Agent runner, and real-time audit log monitor.

---

## 🏗️ Architecture

```
                                    +------------------------------+
                                    |       Client / Web UI        |
                                    |  (Single Page Application)   |
                                    +--------------+---------------+
                                                   | HTTP / REST (Port 8090)
                                                   v
+--------------------------------------------------------------------------------------------------+
| Docker Network: gemini-network                                                                   |
|                                                                                                  |
|   +------------------------------------------------------------------------------------------+   |
|   | gemini-model-connector (Docker Container: node:22-bookworm-slim)                         |   |
|   |                                                                                          |   |
|   |   +--------------------------+    +----------------------------+    +----------------+   |   |
|   |   |   Express REST API       |--->|    Application Layer       |<---|  Security      |   |   |
|   |   |  - /conversations        |    |   - ConversationService    |    |  - Path Guard  |   |   |
|   |   |  - /job-search/analyze   |    |   - JobSearchService       |    |  - Safe Write  |   |   |
|   |   |  - /audit/logs           |    +--------------+-------------+    +----------------+   |   |
|   |   +--------------------------+                   |                                       |   |
|   |                                                  v                                       |   |
|   |                                   +----------------------------+                         |   |
|   |                                   |     Gemini CLI Runner      |                         |   |
|   |                                   |   (spawn / headless mode)  |                         |   |
|   |                                   +--------------+-------------+                         |   |
|   |                                                  |                                       |   |
|   |                                                  v                                       |   |
|   |                       +----------------------------------------------------+             |   |
|   |                       |  @google/gemini-cli (https://github.com/google-gemini/gemini-cli) |   |
|   |                       +--------------------------+-------------------------+             |   |
|   |                                                  |                                       |   |
|   |   +----------------------------------------------------------------------------------+   |   |
|   |   |  Persistence Layer (SQLite Database: conversations, messages, context, audit)    |   |   |
|   |   +----------------------------------------------------------------------------------+   |   |
|   +------------------------------------------------------------------------------------------+   |
|                                                      ^                                           |
|                                                      | HTTP Calls                                |
|   +--------------------------------------------------+---------------------------------------+   |
|   | gemini-python-verifier (Docker Container: python:3.12-slim)                              |   |
|   | - Runs verify_server.py hermetically inside container                                    |   |
|   | - Validates all endpoints, Gemini CLI communication, and SQLite audit records           |   |
|   +------------------------------------------------------------------------------------------+   |
+--------------------------------------------------------------------------------------------------+
```

---

## 📁 Repository Directory Grid

```text
gemini-model-connector/
├── package.json              # Project dependencies & build orchestration scripts
├── README.md                 # Project architecture & standards runbook
├── .gitignore                # Source control ignore rules
├── .env                      # Global environment variable specification
├── config/                   # Centralized Configuration, Scripts, Data & Artifacts
│   ├── docker/               # Multi-runtime Dockerfiles & Compose manifests
│   ├── env/                  # Multi-tier environment profiles & YAML manifests
│   ├── scripts/              # Cross-platform lifecycle scripts & SQL schemas
│   ├── typescript/           # TypeScript configurations (tsconfig.json, tsconfig.test.json)
│   ├── data/                 # Bidirectionally mounted SQLite persistence
│   ├── artifacts/            # Generated job application Markdown documents
│   └── docs/                 # Architectural specifications & security runbooks
├── src/                      # Maven-style source tree (Code & Resources strictly isolated)
│   ├── main/
│   │   ├── typescript/       # Application TypeScript packages (@/* path aliases)
│   │   │   ├── core/         # Infrastructure, config, DI container, HTTP client, security
│   │   │   ├── domain/       # Domain entities, DTOs, specifications, constants
│   │   │   ├── repositories/ # Abstract & SQLite/Postgres repository implementations
│   │   │   ├── services/     # Transactional services (Conversation, Auth, JobSearch)
│   │   │   ├── controllers/  # REST API controllers & route handlers
│   │   │   └── index.ts      # Application entrypoint & Express server
│   │   └── resources/        # Static assets, SCSS styles, and dashboard HTML templates
│   └── test/
│       ├── typescript/       # Independent Automated Test Suites
│       │   ├── unit/         # Unit tests (Environment, Deduplication, Strategies, OAuth)
│       │   ├── integration/  # DI Container, Repository, Postgres Testcontainers
│       │   ├── concurrent/   # User isolation concurrent requests
│       │   └── performance/  # Database connection pool throughput
│       └── resources/        # Test fixtures, mock payloads, and test configuration
```

---

## 🚀 Execution & Verification in Docker

All Node.js and Python executions run hermetically inside Docker containers.

### 1. Build Containers (`config/scripts/build/build.ps1` or `config/scripts/build/build.sh`)
```powershell
powershell -ExecutionPolicy Bypass -File .\config\scripts\build\build.ps1
```
Or via npm:
```bash
npm run docker:build
```

### 2. Deploy Services (`config/scripts/deploy/deploy.ps1` or `config/scripts/deploy/deploy.sh`)
```powershell
powershell -ExecutionPolicy Bypass -File .\config\scripts\deploy\deploy.ps1
```
Or via Docker Compose directly:
```bash
docker compose -f config/docker/docker-compose.yml up -d gemini-model-connector
```
The server and web dashboard are accessible at `http://127.0.0.1:8090/`.

### 3. Run Hermetic Python Verification in Container (`config/scripts/verification/verify.ps1` or `config/scripts/verification/verify.sh`)
```powershell
powershell -ExecutionPolicy Bypass -File .\config\scripts\verification\verify.ps1
```
Or via npm:
```bash
npm run docker:verify
```

### 4. Stream Real-Time Docker Application Logs
```bash
npm run docker:logs
# or
docker logs -f gemini-model-connector
```

---

## 📡 API Reference

### 1. Health Check
`GET /api/v1/health`
- **Response**:
```json
{
  "status": "HEALTHY",
  "service": "gemini-model-connector",
  "cli_status": {
    "command": "gemini",
    "available_on_path": true,
    "mode": "HEADLESS_CLI",
    "default_model": "gemini-3.8-flash"
  },
  "uptime_seconds": 128.4
}
```

### 2. Create Conversation
`POST /api/v1/conversations`
- **Request Body**:
```json
{
  "title": "Full-Stack AI Project Discussion",
  "model": "gemini-3.8-flash",
  "system_instruction": "You are a senior AI systems architect.",
  "tags": ["ai", "architecture"],
  "initial_resume": "Jane Doe - Full Stack Developer..."
}
```

### 3. Send Message (Invokes Gemini CLI)
`POST /api/v1/conversations/:id/messages`
- **Request Body**:
```json
{
  "content": "Explain how to architect a token-budgeting system for model connectors."
}
```
- **Response**:
```json
{
  "userMessage": {
    "id": "uuid",
    "role": "user",
    "content": "Explain how to architect...",
    "created_at": "2026-10-14T16:45:00Z"
  },
  "assistantMessage": {
    "id": "uuid",
    "role": "assistant",
    "content": "To architect a resilient token-budgeting system...",
    "model": "gemini-3.8-flash",
    "latency_ms": 320.5,
    "total_tokens": 450,
    "cli_exit_code": 0
  }
}
```

### 4. Job Search & Resume Alignment Agent
`POST /api/v1/job-search/analyze`
- **Request Body**:
```json
{
  "target_role": "Senior AI Systems Engineer",
  "resume_content": "Jane Doe\n7+ years Node.js, TypeScript, Docker, SQLite, REST APIs...",
  "job_html": "<div class='job-posting'><h1>Senior AI Engineer</h1><p>Requirements: Node.js, Gemini CLI, Docker...</p></div>",
  "generate_markdown_files": true
}
```
- **Response**:
```json
{
  "conversation_id": "uuid",
  "analysis": {
    "job_title": "Senior AI Engineer",
    "company_name": "Google DeepMind",
    "required_skills": ["Node.js", "Docker", "Gemini CLI", "REST APIs"],
    "experience_level": "5+ years"
  },
  "resume_match": {
    "match_score_percentage": 93.5,
    "matched_skills": ["Node.js", "Docker", "REST APIs"],
    "missing_skills": ["Kubernetes"],
    "summary_evaluation": "High alignment with technical stack and architecture requirements.",
    "tailored_highlights": [
      "Engineered containerized Node.js service communicating with Google Gemini CLI.",
      "Architected audit-compliant SQLite persistence tracking full conversation contexts."
    ]
  },
  "markdown_filepath": "/app/artifacts/job_application_2026-10-14T16-45-00Z.md",
  "markdown_content": "# Tailored Resume: Senior AI Engineer...",
  "audit_id": "audit-uuid"
}
```

### 5. Download Generated Markdown Artifact
`GET /api/v1/job-search/artifacts/:filename`
- Safely downloads the generated `.md` file with strict directory traversal prevention.

### 6. Query SQLite Audit Logs
`GET /api/v1/audit/logs?limit=50`
- Returns chronological audit log items recording every Gemini CLI interaction, tokens consumed, and latencies.
