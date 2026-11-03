# Model Connector UI — Screens, Onboarding & Role-Based Workflows

> **Canonical Document**: Unified UI specification, screen architecture, onboarding flows (UI & API), and RBAC management for `model-connector-ui`.  
> **Master Blueprint**: [blueprint.md](blueprint.md)  
> **Macro System Architecture**: [hld.md](hld.md)  
> **Detailed Component Specifications**: [lld.md](lld.md)  
> **UI High-Level Design**: [UI HLD (Security & Best Practices)](ui-hld.md)  
> **UI Low-Level Design & Figma Flows**: [UI LLD & Figma Flows](ui-lld.md)  
> **Gap Analysis & Implementation Roadmap**: [Gap Analysis & Implementation Roadmap](gap-analysis-and-implementation-roadmap.md)  
> **Use Case Specifications & Architecture**: [Use Case Catalog & Architecture](usecase/README.md)

---

## 📑 Table of Contents

- [1. Executive UI Architecture & Principles](#1-executive-ui-architecture--principles)
- [2. Screen 1: Multi-Mode Onboarding & Authentication](#2-screen-1-multi-mode-onboarding--authentication)
  - [2.1 Visual Interface Mockup](#21-visual-interface-mockup)
  - [2.2 Detailed UI Component State Flow Diagram](#22-detailed-ui-component-state-flow-diagram)
  - [2.3 Step-by-Step API Onboarding Flow](#23-step-by-step-api-onboarding-flow)
  - [2.4 Universal 4-Step Onboarding Flow: Turning Any User Idea into Execution](#24-universal-4-step-onboarding-flow-turning-any-user-idea-into-execution)
- [3. Screen 2: Network Analytics Dashboard & Metrics](#3-screen-2-network-analytics-dashboard--metrics)
  - [3.1 Visual Interface Mockup](#31-visual-interface-mockup)
  - [3.2 Detailed Dashboard Telemetry UI Flow Diagram](#32-detailed-dashboard-telemetry-ui-flow-diagram)
  - [3.3 Operational Metrics & 6-Model Family Diagnostics](#33-operational-metrics--6-model-family-diagnostics)
- [4. Screen 3: User Workspace & Model Interaction Studio](#4-screen-3-user-workspace--model-interaction-studio)
  - [4.1 Visual Interface Mockup](#41-visual-interface-mockup)
  - [4.2 Detailed Workspace Chat & Verification UI Flow Diagram](#42-detailed-workspace-chat--verification-ui-flow-diagram)
  - [4.3 User Interaction Mechanics (Chat, Lineage, Prompt Verification)](#43-user-interaction-mechanics-chat-lineage-prompt-verification)
- [5. Screen 4: Admin Operations & Governance Console](#5-screen-4-admin-operations--governance-console)
  - [5.1 Visual Interface Mockup](#51-visual-interface-mockup)
  - [5.2 Detailed Admin Key Vault & Circuit Breaker UI Flow Diagram](#52-detailed-admin-key-vault--circuit-breaker-ui-flow-diagram)
  - [5.3 Provider Credentials Vault & Circuit Breaker Routing](#53-provider-credentials-vault--circuit-breaker-routing)
- [6. Screen 5: Employee / Operator RBAC Access Control](#6-screen-5-employee--operator-rbac-access-control)
  - [6.1 Visual Interface Mockup](#61-visual-interface-mockup)
  - [6.2 Detailed Operator RBAC Assignment UI Flow Diagram](#62-detailed-operator-rbac-assignment-ui-flow-diagram)
  - [6.3 Operator Hierarchy & Cryptographic Salt Binding](#63-operator-hierarchy--cryptographic-salt-binding)
- [7. Screen 6: Visual Workflow DAG Builder & MCP Studio](#7-screen-6-visual-workflow-dag-builder--mcp-studio)
  - [7.1 Visual Interface Mockup](#71-visual-interface-mockup)
  - [7.2 Detailed Visual DAG Builder UI Flow Diagram](#72-detailed-visual-dag-builder-ui-flow-diagram)
  - [7.3 Bisect Part A Step Orchestration & Watchdog Configuration](#73-bisect-part-a-step-orchestration--watchdog-configuration)
- [8. Screen 7: Token Exhaustion & Context Window Recovery UI Flow](#8-screen-7-token-exhaustion--context-window-recovery-ui-flow)
  - [8.1 Detailed Token Exhaustion & Compaction UI Flow Diagram](#81-detailed-token-exhaustion--compaction-ui-flow-diagram)
  - [8.2 Smart Compaction Modal & Fallback Model Cascade Interface](#82-smart-compaction-modal--fallback-model-cascade-interface)
- [9. Screen 8: Access Revocation & Re-Authentication Recovery UI Flow](#9-screen-8-access-revocation--re-authentication-recovery-ui-flow)
  - [9.1 Detailed Re-Authentication Recovery UI Flow Diagram](#91-detailed-re-authentication-recovery-ui-flow-diagram)
  - [9.2 Amber Alert Banner & Step-Preserved Resumption](#92-amber-alert-banner--step-preserved-resumption)
- [10. Screen 9: Dynamic Onboarding Workflow Step Skip Controls UI Flow](#10-screen-9-dynamic-onboarding-workflow-step-skip-controls-ui-flow)
  - [10.1 Detailed Step Skip Governance UI Flow Diagram](#101-detailed-step-skip-governance-ui-flow-diagram)
  - [10.2 Single Record Skip vs. Flow-Wide Skip Dialog](#102-single-record-skip-vs-flow-wide-skip-dialog)
- [11. Screen 10: Free-Tier Cookie Management & Health Inspector UI Flow](#11-screen-10-free-tier-cookie-management--health-inspector-ui-flow)
  - [11.1 Detailed Cookie Management UI Flow Diagram](#111-detailed-cookie-management-ui-flow-diagram)
  - [11.2 Cookie Ingestion Dialog & Playwright MCP Health Testing](#112-cookie-ingestion-dialog--playwright-mcp-health-testing)
- [12. UI-to-Service Connection Security Invariants](#12-ui-to-service-connection-security-invariants)
- [13. Screen 11: LinkedIn X-Ray Discovery, Playwright Dynamic Placeholder Workflows & AI Assistance UI Flow](#13-screen-11-linkedin-x-ray-discovery-playwright-dynamic-placeholder-workflows--ai-assistance-ui-flow)
  - [13.1 Detailed LinkedIn X-Ray & Dynamic Template Execution UI Flow Diagram](#131-detailed-linkedin-x-ray--dynamic-template-execution-ui-flow-diagram)
  - [13.2 Interactive Placeholder Resolution & Real-Time AI Assistance Indicator](#132-interactive-placeholder-resolution--real-time-ai-assistance-indicator)

---

## 1. Executive UI Architecture & Principles

The **`model-connector-ui`** is a standalone, decoupled React 18 + Vite frontend built strictly according to enterprise glassmorphism tokens, modular SCSS, and desktop/mobile isolation invariants.

### Key Architectural Boundaries:
1. **Direct Service Binding**: `model-connector-ui` connects exclusively to `model-connector-service` (Port 8095) via HTTPS, WSS, and Server-Sent Events (SSE). It **never** invokes external model APIs or `playwright-mcp-engine` directly.
2. **Zero Plain CSS**: All styling is driven by tokens in `src/main/resources/assests/styles/` (`_variables.scss`, `_mixins.scss`, `_desktop.scss`, `_mobile.scss`).
3. **Role-Based Views**: Separate, hardened views for standard **Users**, **Employees / Operators**, and **Administrators**, strictly enforcing tenant and feature boundaries.

---

## 2. Screen 1: Multi-Mode Onboarding & Authentication

### 2.1 Visual Interface Mockup

![Onboarding Screen Mockup](images/model-connector-ui/01_onboarding_screen.jpg)

### 2.2 Detailed UI Component State Flow Diagram

```mermaid
sequenceDiagram
    autonumber
    actor User as End User / Developer
    participant View as OnboardingView (React)
    participant Store as AuthOnboardingStore (Zustand)
    participant Gateway as model-connector-service (Port 8095)
    participant OAuth as Google OAuth Provider

    User->>View: Access http://localhost:3005/onboard
    View->>Store: Initialize Stepper State (Step: 1, AuthMode: null)
    View-->>User: Render Step 1: Mode Selection Cards (OAuth, SSO, API Key, Dev)
    
    User->>View: Click "Continue with Google"
    View->>OAuth: Trigger Google Identity Services (GIS) PKCE Popup
    OAuth-->>User: Display Google Consent Prompt
    User->>OAuth: Authorize Application
    OAuth-->>View: Return ID Token (JWT)
    
    View->>Store: Set idToken, transition to Validating
    View->>Gateway: POST /api/v1/auth/register { idToken, provider: "GOOGLE" }
    Gateway-->>View: 201 Created { userId: "USR-9921", jwtToken: "...", assignedSalt: "..." }
    View->>Store: Persist Session JWT in Memory, set Step: 2
    View-->>User: Animate Transition to Step 2: Tenant Scoping
    
    User->>View: Select "Job Portal" + Toggle "RESUME_AST", "FORM_FILL"
    User->>View: Click "Next: Model Preferences"
    View->>Gateway: POST /api/v1/tenants/bind-scope { app: "JOB_PORTAL", scopes: [...] }
    Gateway-->>View: 200 OK { tenantId: "TNT-01", status: "BOUND" }
    View->>Store: Update Tenant Profile, set Step: 3
    View-->>User: Animate Transition to Step 3: Model Selection
    
    User->>View: Select Default Active Model ("gemini-3.8-flash")
    User->>View: Click "Finish Setup"
    View->>Gateway: POST /api/v1/users/preferences { defaultModel: "gemini-3.8-flash" }
    Gateway-->>View: 200 OK { onboardingComplete: true }
    View-->>User: Confetti Animation & Redirect to /workspace
```

1. **Step 1: Identity & Authentication**:
   - The user selects an authentication strategy (Google OAuth2, Enterprise SSO, API Key, or Local Dev).
   - In Google OAuth2 mode, standard PKCE code exchange obtains an authenticated ID token.
2. **Step 2: Tenant & Application Scoping**:
   - The user registers their workspace and selects authorized applications (`JOB_PORTAL`, `COMFYUI_STORY`, `APPS_BUILDER`).
   - A unique tenant namespace and cryptographic salt are assigned to the user.
3. **Step 3: Model Provider Preferences**:
   - User chooses default models from the active model catalog (e.g. `gemini-3.8-flash`, `claude-3-7-sonnet`, `llama3.2`).
   - Private API keys can be saved into the salted credentials vault.

### 2.3 Step-by-Step API Onboarding Flow

For programmatic clients, automated pipelines, or headless microservices, onboarding is executed entirely via REST API endpoints:

#### Phase A: Register User Identity
```http
POST /api/v1/auth/register HTTP/1.1
Host: api.model-connector.internal:8095
Content-Type: application/json
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01

{
  "userEmail": "engineer@company.com",
  "fullName": "Jane Doe",
  "authProvider": "GOOGLE_OAUTH",
  "idToken": "eyJhbGciOiJSUzI1NiIs..."
}
```

**Response (`201 Created`)**:
```json
{
  "userId": "USR-9921-X9",
  "jwtToken": "eyJhbGciOiJSUzI1NiIs...",
  "refreshToken": "rf_98327429384729384",
  "expiresInSeconds": 3600
}
```

#### Phase B: Bind Application Scopes
```http
POST /api/v1/tenants/bind-scope HTTP/1.1
Host: api.model-connector.internal:8095
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
Content-Type: application/json

{
  "applicationCode": "JOB_PORTAL",
  "featureScopes": ["RESUME_AST", "JOB_MATCH", "FORM_FILL"]
}
```

**Response (`200 OK`)**:
```json
{
  "status": "BOUND",
  "tenantId": "TNT-JOBPORTAL-01",
  "assignedPermissions": ["RESUME_AST", "JOB_MATCH", "FORM_FILL"],
  "cryptographicSaltHash": "sha256:8f4b1...e9"
}
```

### 2.4 Universal 4-Step Onboarding Flow: Turning Any User Idea into Execution

`model-connector-platform` is a horizontal multi-model execution mesh. Workflows such as job autofill, app generation, video storytelling, or market research are **user-defined business ideas and custom manifests**, NOT hardcoded monolithic application endpoints.

The platform makes onboarding easy for **any** user or business idea through an intuitive 4-step guided wizard:

#### Step 1: Multi-Mode Identity & Workspace Authentication
Users authenticate via Google OAuth2 (GIS PKCE), Enterprise SSO, API Key, or Developer Mock mode (shown in Screen 1 mockup above: `01_onboarding_screen.jpg`).

#### Step 2: Connect Models & Local Inference Providers
Users connect their frontier cloud API keys (Gemini, Claude, OpenAI) into the salted credentials vault, or leverage auto-detected local inference engines (`Local Ollama: llama3.2` on port 11434). A 1-click **"Test All Connections"** ping validates provider latencies in real-time:

![Model Provider & Local Inference Connection](images/model-connector-ui/07_onboarding_providers.jpg)

#### Step 3: Register Workflow Idea & Plug-in Capabilities
Users register their custom application idea (e.g. dynamic career assistant, custom document auditor, code generator, or creative agent) without writing boilerplate infrastructure. They enter their idea's prompt template with dynamic variables (`{{user_input}}`, `{{target_data}}`) and toggle required plug-and-play capabilities: **Browser Automation MCP (Playwright)** for web scraping/autofill, **Hermetic Code Sandbox (Docker)** for code synthesis/tests, or **Local GPU Diffusion** for creative media. The engine immediately compiles and validates the unified workflow manifest:

![Workflow Idea & Capability Setup](images/model-connector-ui/08_onboarding_workflow_setup.jpg)

#### Step 4: Instant Verification & External System Integration Snippet
Users test their workflow with a 1-click execution targeting the unified API endpoint `POST /api/v1/executions`. A live Server-Sent Events (SSE) telemetry console streams real-time tokens, execution latency, and output. 

Upon completion, the platform issues an opaque `MANIFEST_ID` and ready-to-use client SDK / cURL integration code. The user embeds this snippet into their **own external application or business system**, enabling their end-users to trigger the AI assistance workflow directly from their native environment while Model Connector Platform handles the underlying multi-model routing, browser automation, and execution mesh:

![Unified Execution Ingress & Live Stream](images/model-connector-ui/09_onboarding_execution_stream.jpg)

---

## 3. Screen 2: Network Analytics Dashboard & Metrics

### 3.1 Visual Interface Mockup

![Network Analytics Dashboard Mockup](images/model-connector-ui/02_dashboard_metrics.jpg)

### 3.2 Detailed Dashboard Telemetry UI Flow Diagram

```mermaid
flowchart TD
    MOUNT["DashboardView Mounted (/dashboard)"] --> SUB_SSE["Establish SSE: GET /api/v1/telemetry/stream"]
    SUB_SSE --> CONNECTED{"SSE Connection Established?"}
    
    CONNECTED -->|No / Dropped| RETRY["Backoff Reconnect (1s, 2s, 4s) & Show Offline Toast"]
    RETRY --> SUB_SSE
    
    CONNECTED -->|Yes| STREAM["Stream Incoming NDJSON Metric Frames (1000ms cadence)"]
    
    STREAM --> DISPATCH["Zustand Telemetry Store Update"]
    DISPATCH --> RENDER_CARDS["Update 6-Model Latency Cards (Gemini: 98ms, Claude: 185ms, etc.)"]
    DISPATCH --> RENDER_GAUGES["Update Concurrency RPS Gauge & Circuit Breaker Health"]
    DISPATCH --> RENDER_CHART["Re-render W3C Trace Waterfall (Traceparent Timers)"]
    
    USER_ACTION{"User Interacts with Dashboard"}
    USER_ACTION -->|Filter by Model Family| FILTER["Toggle Family Pills (e.g. Gemini Only)"]
    FILTER --> SLICE["Client-side TimeSeries Slicing (Zero Server Roundtrip)"]
    
    USER_ACTION -->|Click Latency Spike| DRILLDOWN["Open Span Inspector Modal"]
    DRILLDOWN --> FETCH_SPAN["Fetch Detailed Span Trace: GET /api/v1/traces/{traceId}"]
    FETCH_SPAN --> DISPLAY_SPAN["Display Non-PII Span Waterfall & HTTP Status Details"]
```

### 3.3 Operational Metrics & 6-Model Family Diagnostics

The dashboard provides real-time distributed telemetry across the 6 supported model families:
1. **Active Concurrency (RPS)**: Aggregates active request throughput across all connected pods.
2. **Average Global Latency**: End-to-end response time tracking (average ~142ms).
3. **Circuit Breaker Health**: Real-time state machine status across all providers (99.98% Stable).
4. **Token Ingestion & Generation Volume**: Live tracking of token consumption across providers.
5. **Family Latency Cards**:
   - `gemini-3.8-flash`: 98ms (Ultra-Low Latency, High Throughput)
   - `gpt-4o`: 210ms (Reasoning Benchmark)
   - `claude-3-7-sonnet`: 185ms (Nuanced Coding & Architecture)
   - `grok-3`: 195ms (Deep Logic & Code Synthesis)
   - `copilot`: 220ms (Developer Context)
   - `ollama`: 45ms (Local On-Device Offline Inference)
6. **W3C Distributed Tracing Mesh**: Real-time timeseries chart graphing `durationMs` correlated against `traceparent` and `span.id`.

---

## 4. Screen 3: User Workspace & Model Interaction Studio

### 4.1 Visual Interface Mockup

![User Workspace Mockup](images/model-connector-ui/03_user_workspace.jpg)

### 4.2 Detailed Workspace Chat & Verification UI Flow Diagram

```mermaid
sequenceDiagram
    autonumber
    actor User as Candidate / Creator
    participant UI as ChatWorkspaceView (React)
    participant Store as SessionChatStore (Zustand)
    participant Gateway as model-connector-service (Port 8095)
    participant SSE as Server-Sent Events Stream

    User->>UI: Select Session ("Senior Cloud Architect ATS Eval")
    UI->>Gateway: GET /api/v1/sessions/SESS-78921/messages
    Gateway-->>UI: 200 OK (History: 14 turns + AST metadata)
    UI->>Store: Populate active message list
    UI-->>User: Render Multi-Turn Chat Canvas with Syntax Highlighting

    User->>UI: Type prompt: "Mutate AWS references to Google Cloud Spanner & BigQuery"
    User->>UI: Click "Send Prompt" (or Ctrl+Enter)
    UI->>Store: Append optimistic User Message
    UI->>Gateway: POST /api/v1/models/stream-inference { sessionId, prompt, model: "gemini-3.8-flash" }
    
    Gateway-->>UI: 200 OK (Content-Type: text/event-stream)
    loop Token Streaming (Every 20ms)
        Gateway->>SSE: data: { "delta": "Transposed AWS DynamoDB to GCP Cloud Spanner..." }
        SSE->>UI: Chunk received
        UI->>Store: Append token delta to streaming message
        UI-->>User: Smooth typing micro-animation + live latency timer
    end
    Gateway->>SSE: data: { "[DONE]": true, "tokens": 412, "latencyMs": 98 }
    
    User->>UI: Click "Verify Prompt" in Right Inspector
    UI->>Gateway: POST /api/v1/prompts/verify { sessionId, promptHash: "sha256:...", score: 98 }
    Gateway-->>UI: 200 OK { isVerified: true, verifiedBadgeId: "VBDG-01" }
    UI-->>User: Stamp Green Glassmorphism "Verified Prompt" Badge on Message
```

### 4.3 User Interaction Mechanics (Chat, Lineage, Prompt Verification)

1. **Left Navigation — Multi-Turn Session Lineage**:
   - Lists active conversations categorized by calling application (`Job Portal`, `ComfyUI`, `Apps Builder`).
   - Displays turn counts, last updated timestamp, and current active model selector.
2. **Center Stage — Streaming Conversation Stream**:
   - Renders live markdown completions with syntax highlighting, token count badges, and millisecond latency timers.
   - Shows the prominent **Verified Prompt** badge when an inference response meets quality benchmarks.
3. **Right Inspector — Prompt Customization Inspector**:
   - **System Tab**: Displays read-only base system prompt from `SYSTEM_PROMPTS`.
   - **Custom Tab**: Candidate or creator enters personalized stylistic constraints (e.g., "Maintain professional tone, highlight metrics").
   - **Verify Prompt Button**: Stretches across the inspector. Clicking this button sends a signature to the platform, stamping the prompt and seed in `USER_PROMPTS` as `IS_VERIFIED_BY_USER = TRUE`.

---

## 5. Screen 4: Admin Operations & Governance Console

### 5.1 Visual Interface Mockup

![Admin Operations & Governance Mockup](images/model-connector-ui/04_admin_governance.jpg)

### 5.2 Detailed Admin Key Vault & Circuit Breaker UI Flow Diagram

```mermaid
flowchart TD
    MOUNT["AdminConsole Mounted (/admin/governance)"] --> FETCH_INIT["Parallel Fetch: Credentials + Circuit Breakers + Audit Stream"]
    FETCH_INIT --> LOAD_CRED["GET /api/v1/admin/credentials (Salted Hashes Only)"]
    FETCH_INIT --> LOAD_CB["GET /api/v1/admin/circuit-breakers/status"]
    FETCH_INIT --> LOAD_LOGS["GET /api/v1/admin/audit-logs?limit=50"]

    LOAD_CRED --> RENDER_VAULT["Render Salted Key Table (sha256:7f3...de1)"]
    LOAD_CB --> RENDER_SLIDERS["Render Threshold Sliders (Failure %: 50, Timeout: 8000ms)"]
    LOAD_LOGS --> RENDER_NDJSON["Render Real-Time NDJSON Log Stream (Zero PII Certified)"]

    ADMIN_ACTION{"Administrator Action"}
    
    ADMIN_ACTION -->|Update Key| KEY_MODAL["Open Key Registration Dialog"]
    KEY_MODAL --> ENTER_KEY["Admin Enters Fresh Key (e.g. Anthropic Secret)"]
    ENTER_KEY --> HASH_CLIENT["Client Computes Salted Hash & Zero-Plaintext Transmission"]
    HASH_CLIENT --> POST_KEY["POST /api/v1/admin/credentials/rotate"]
    POST_KEY --> TOAST_SUCCESS["Show 'Credentials Rotated Successfully' Toast"]

    ADMIN_ACTION -->|Adjust Circuit Breaker| SLIDER_MOVE["Admin Drags Failure Sensitivity Slider to 40%"]
    SLIDER_MOVE --> PATCH_CB["PATCH /api/v1/admin/circuit-breakers/gemini-3.8-flash { failureRate: 40 }"]
    PATCH_CB --> UPDATE_STATE["Update Global Gateway Threshold Dynamically (Zero Restart)"]
```

### 5.3 Provider Credentials Vault & Circuit Breaker Routing

1. **Provider Credentials Vault**:
   - Displays all registered model family keys (OpenAI, Anthropic, Cohere, Google, LLaMA).
   - **Salted Key Hashes**: Strictly reveals only cryptographic hashes (`sha256:7f3....de1`). Zero plaintext secrets are rendered in the DOM or returned over the wire.
   - **Strategy Mode Badges**: Displays whether each provider connects via `API`, `CLI`, or `Cookie Jar`.
2. **Model Routing Configuration**:
   - **Circuit Breaker Sensitivity**: Real-time slider adjusting trip thresholds (Low, Medium, High).
   - **Fallback Cascades**: Configurable failover chains (e.g. Primary: GPT-4o $\to$ Secondary: Claude 3.7 Sonnet $\to$ Tertiary: LLaMA 3 70B).
   - **Max Concurrency Bulkheads**: Per-family concurrency ceilings protecting local CPU/GPU memory.
3. **Real-Time Distributed Audit Logs**:
   - Live stream of sanitized NDJSON logs detailing W3C `traceparent` IDs, user IDs, and duration.
   - Explicit **"Zero PII Data Found"** badges certifying compliance with `NFR-SEC-001`.

### 5.4 Model Accounts & Polymorphic OAuth 2.0 Web Consent Flow (`STD-COD-005`)

Referencing the upstream [Gemini CLI authentication setup | Gemini CLI](https://geminicli.com/docs/get-started/authentication/) and the official [`google-gemini/gemini-cli`](https://github.com/google-gemini/gemini-cli.git) architecture (`packages/core/src/code_assist/oauth2.ts`), the platform employs the **Strategy Pattern** via `OAuthProviderRegistry` and `ModelOAuthProviderService`. Instead of hardcoded conditional branching (`if (provider === "google")`), each provider (Google Gemini, xAI Grok, Anthropic Claude, OpenAI, GitHub Copilot, Microsoft Azure) encapsulates its own endpoints, scopes, client parameters, individual account setup guides, and URL generator.

#### 1. End-to-End OAuth 2.0 Handshake, Verification & Upsert Sequence

```mermaid
sequenceDiagram
    autonumber
    actor User as Developer / End User
    participant Browser as Host Web Browser (OS Default)
    participant UI as ModelAccountsModal (React UI)
    participant Loopback as OAuthCallbackServer (Port 8085)
    participant Google as Google Identity OAuth 2.0 (accounts.google.com)
    participant DB as SQLite (MODEL_ACCOUNTS Table)

    User->>UI: Click "Sign in with Google" / "Configure Account"
    UI->>UI: ModelOAuthProviderService.generateAuthorizationUrl()
    Note over UI: client_id: <GOOGLE_OAUTH_CLIENT_ID><br/>redirect_uri: http://localhost:8085/oauth2callback<br/>scopes: cloud-platform, userinfo.email, userinfo.profile<br/>prompt: select_account consent
    UI->>Browser: Open consent URL in external host tab
    Browser->>Google: GET /o/oauth2/v2/auth?client_id=...&response_type=code
    Google-->>Browser: Render Account Selection & Safety Warning Dialog
    Note over Browser: Dialog: "Make sure that you downloaded this app from Google.<br/>Don't sign in to Google Antigravity unless you're sure..."
    User->>Browser: Click "Sign in" to grant consent
    Google->>Browser: Redirect 302 to http://localhost:8085/oauth2callback?code=AUTH_CODE&state=...
    Browser->>Loopback: GET /oauth2callback?code=AUTH_CODE
    Loopback->>Google: POST https://oauth2.googleapis.com/token<br/>(code, client_id, client_secret: <GOOGLE_OAUTH_CLIENT_SECRET>)
    Note over Loopback,Google: Exchange code for Access & Refresh Tokens<br/>(client_secret required per RFC 8252 §8.5)
    Google-->>Loopback: 200 OK { access_token, refresh_token, id_token }
    Loopback->>Google: GET https://www.googleapis.com/oauth2/v2/userinfo
    Google-->>Loopback: 200 OK { email: "punittiwari58@gmail.com", name: "Punit Tiwari" }
    Loopback-->>Browser: Render OAuth Callback Success HTML & postMessage(MODELBOX_OAUTH_SUCCESS)
    Browser->>UI: window.postMessage({ type: "MODELBOX_OAUTH_SUCCESS", email, credentialValue })
    UI-->>User: Auto-fill credentials: "Google Cloud / Gemini (punittiwari58@gmail.com)"

    User->>UI: Enter prompt: "Hi , whats date time now ?" & Click "Test Connection"
    UI->>Loopback: POST /api/v1/models/verify (model: "gemini-3.8-flash", strategy: "gemini_cli")
    Loopback-->>UI: 200 OK { status: "VERIFIED", latencyMs: 109, strategy: "OAUTH 2.0 PKCE" }
    UI-->>User: Render Status Pill: "VERIFIED OAUTH 2.0 PKCE 109ms"

    User->>UI: Click "Save & Activate Configuration"
    UI->>Loopback: POST /api/v1/accounts (Upsert payload)
    Loopback->>DB: Query existing account: SELECT id FROM MODEL_ACCOUNTS WHERE model_id = 'gemini-3.8-flash' AND user_email = 'punittiwari58@gmail.com'
    alt Record Exists in Table
        Loopback->>DB: UPDATE MODEL_ACCOUNTS SET credential_value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = existing.id
        Note over Loopback,DB: In-place update prevents duplicate rows!
    else New Account
        Loopback->>DB: INSERT INTO MODEL_ACCOUNTS (id, model_id, provider, user_email, credential_value, ...) VALUES (...)
    end
    Loopback-->>UI: 200 OK { status: "SAVED_AND_ACTIVATED", accountId: "acc-..." }
    UI-->>User: Show Toast: "Configuration saved and activated successfully"
```

#### 2. OAuth 2.0 State Machine & Error Resolution Flowchart

```mermaid
flowchart TD
    Start([User clicks 'Sign in with Google']):::step --> GenUrl[Generate Authorization URL<br/>client_id, loopback redirect, PKCE state]:::step
    GenUrl --> LaunchHost[Launch Host Browser Tab]:::step
    LaunchHost --> GoogleAuth{Google Auth Dialog}:::decision

    GoogleAuth -->|Unregistered Scopes| Err403["Error 403: restricted_client<br/>(cclog, aicode rejected)"]:::err
    Err403 --> Fix403["Fix: Restrict to approved registered scopes<br/>(cloud-platform, userinfo.email, userinfo.profile)"]:::fix
    Fix403 --> GenUrl

    GoogleAuth -->|First-Party Warning| PromptWarn["'Make sure that you downloaded this app from Google'<br/>Google Antigravity Identity Check"]:::warn
    PromptWarn -->|User clicks 'Sign in'| ConsentOK[Consent Granted & Redirect to Loopback]:::step
    PromptWarn -->|User clicks 'Cancel'| Abort([Flow Aborted]):::err

    ConsentOK --> LoopbackRecv["OAuthCallbackServer receives code at :8085/oauth2callback"]:::step
    LoopbackRecv --> TokenPost{POST /token Exchange}:::decision

    TokenPost -->|Missing client_secret| Err400["Error 400: invalid_request<br/>client_secret is missing"]:::err
    Err400 --> Fix400["Fix: Inject upstream native secret<br/>(<GOOGLE_OAUTH_CLIENT_SECRET>-[...REDACTED...]-...)"]:::fix
    Fix400 --> TokenPost

    TokenPost -->|Success 200 OK| FetchUser[Fetch User Profile from userinfo]:::step
    FetchUser --> PostMsg[postMessage to Parent UI Window]:::step
    PostMsg --> AutoFill[Auto-fill Model Account Modal]:::step

    AutoFill --> TestConn{Click 'Test Connection'}:::step
    TestConn --> ExecPrompt["Prompt: 'Hi , whats date time now ?'<br/>Dispatched to Gemini Execution Strategy"]:::step
    ExecPrompt --> VerifiedBadge["Render Pill: VERIFIED OAUTH 2.0 PKCE 109ms"]:::step

    VerifiedBadge --> SaveClick{Click 'Save & Activate Configuration'}:::step
    SaveClick --> DBCheck{Record Exists in MODEL_ACCOUNTS?}:::decision
    DBCheck -->|Yes: (model_id, user_email) match| DBUpdate["UPDATE in-place<br/>Zero Duplicate Rows"]:::step
    DBCheck -->|No: New identity| DBInsert["INSERT new row"]:::step
    DBUpdate --> Complete([Configuration Active & Ready]):::step
    DBInsert --> Complete

    classDef step fill:#1e293b,stroke:#3b82f6,stroke-width:2px,color:#f8fafc;
    classDef err fill:#450a0a,stroke:#ef4444,stroke-width:2px,color:#fecaca;
    classDef fix fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#d1fae5;
    classDef warn fill:#451a03,stroke:#f59e0b,stroke-width:2px,color:#fef3c7;
    classDef decision fill:#312e81,stroke:#6366f1,stroke-width:2px,color:#e0e7ff;
```

#### 3. OAuth Architecture, Error Prevention & Troubleshooting Matrix

The platform resolves three critical failure modes identified during native Gemini CLI OAuth integration:

| Observed State / Error | Visual Manifest | Root Cause | Architectural Resolution |
| :--- | :--- | :--- | :--- |
| **HTTP 400: `client_secret is missing`** | Browser callback displays:<br/>`OAuth code exchange rejected (400) for Google Cloud / Gemini: { "error": "invalid_request", "error_description": "client_secret is missing." }` | In Google OAuth Installed Application flows, exchanging an authorization code at `https://oauth2.googleapis.com/token` requires the client secret. Omitting it causes Google token endpoint to reject the request with HTTP 400. | `OAuthCallbackServer.ts` and `GoogleAuthConstants` supply both the official native `client_id` (`<GOOGLE_OAUTH_CLIENT_ID>-...`) and `client_secret` (`<GOOGLE_OAUTH_CLIENT_SECRET>-[...REDACTED...]`) matching upstream Gemini CLI (`google-gemini/gemini-cli.git`). |
| **HTTP 403: `restricted_client`** | Google consent page blocks:<br/>`Access blocked: Authorization Error`<br/>`Unregistered scope(s) in the request: https://www.googleapis.com/auth/cclog, https://www.googleapis.com/auth/aicode`<br/>`Error 403: restricted_client` | Requesting internal Google first-party scopes (`cclog`, `aicode`, `generative-language`) that are not whitelisted for third-party or native OAuth clients triggers strict Google OAuth 403 security blocks. | `GoogleOAuthStrategy.ts` restricts the requested scopes exclusively to the 3 registered, whitelisted scopes: `cloud-platform`, `userinfo.email`, and `userinfo.profile`. |
| **Google First-Party App Safety Warning** | Google consent dialog prompts:<br/>`Make sure that you downloaded this app from Google`<br/>`Don't sign in to Google Antigravity unless you're sure you downloaded this app from Google...`<br/>Buttons: `[Cancel]` and `[Sign in]` | Because the OAuth application identity identifies as Google Antigravity / Gemini CLI native client, Google warns the user to verify the binary before approving access. | The user verifies their account identity (`punittiwari58@gmail.com`) and clicks **Sign in**. The host browser handles this transparently outside the container. |
| **Duplicate Rows on Multi-Save** | Clicking "Save & Activate Configuration" repeatedly inserted duplicate account rows in `MODEL_ACCOUNTS`. | Lack of an upsert constraint matching existing `(model_id, user_email)`. | Enforced record upsert invariant in `ModelAccountRepository.ts`: queries for existing record by `model_id` + `user_email` and executes `UPDATE` in-place, keeping total count clean and stable. |

#### 4. Live Connection Verification & Status Feedback Flow
Following successful OAuth token acquisition, the user validates connectivity directly inside the UI:
1. **Verification Prompt Input**: Users can enter a custom test query (default: `"Hi , whats date time now ?"`).
2. **Execution Latency Measurement**: The test dispatches through `GeminiProviderVerificationStrategy` and benchmarks roundtrip latency.
3. **Structured Status Indicator**: Displays a real-time badge:
   $$\boxed{\text{VERIFIED OAUTH 2.0 PKCE 109ms}}$$
4. **Activation**: Clicking "Save & Activate Configuration" binds the credential to the active session and persists the record into SQLite without duplicating existing records.

#### 5. Individual Account Setup vs Enterprise Cloud
- **Google Gemini**: [Gemini CLI Authentication Setup (Individual Google Accounts)](https://geminicli.com/docs/get-started/authentication/) - For personal Google accounts (Free tier, Google AI Pro / Ultra), users choose **"Sign in with Google"** via `gemini auth login --browser`. **No Google Cloud Project required!**
- **xAI Grok**: [xAI Developer Authentication](https://docs.x.ai/) - Individual developer accounts authenticate via `xai auth login` using personal developer tokens.
- **Anthropic Claude**: [Claude Code / Anthropic Documentation](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) - Individual Claude Pro/Max accounts authenticate via `claude login` without AWS Bedrock or GCP Vertex IAM roles.
- **GitHub Copilot**: [Copilot Individual Subscriber Guide](https://docs.github.com/en/copilot/managing-copilot/managing-copilot-as-an-individual-subscriber) - Individual Copilot subscribers authenticate via `gh auth login --web` without Enterprise SAML SSO.
- **OpenAI Platform**: [OpenAI Developer Quickstart](https://platform.openai.com/docs/quickstart) - Individual developer accounts authenticate via `openai login`.

---


## 6. Screen 5: Employee / Operator RBAC Access Control

### 6.1 Visual Interface Mockup

![Employee Access Control Mockup](images/model-connector-ui/05_employee_management.jpg)

### 6.2 Detailed Operator RBAC Assignment UI Flow Diagram

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Tenant Administrator
    participant UI as OperatorRBACView (React)
    participant Store as RbacStore (Zustand)
    participant Gateway as model-connector-service (Port 8095)

    Admin->>UI: Type search: "support-lead@company.com"
    UI->>Gateway: GET /api/v1/operators/search?query=support-lead
    Gateway-->>UI: 200 OK [ { operatorId: "OP-104", name: "Sarah Connor", role: "SUPPORT_LEAD" } ]
    UI->>Store: Select operator OP-104
    UI-->>Admin: Populate Scopes Grid (Job Portal, ComfyUI, Apps Builder)

    Admin->>UI: Toggle "Job Portal: RESUME_AST" [CHECKED]
    Admin->>UI: Toggle "Job Portal: Raw PII Visibility" [DISABLED - System Invariant]
    Admin->>UI: Toggle "ComfyUI: Large Model Inference" [CHECKED]
    Admin->>UI: Click "Save Scopes & Bind User Salt"

    UI->>Gateway: PUT /api/v1/operators/OP-104/scopes { scopes: ["RESUME_AST", "COMFYUI_LARGE"] }
    Gateway->>Gateway: Generate Cryptographic User Salt via HKDF-SHA256
    Gateway-->>UI: 200 OK { status: "PERMISSIONS_UPDATED", saltHash: "sha256:e1a9...04" }
    UI-->>Admin: Show Success Banner: "Operator Salt Successfully Bound to Tenant Isolation Boundary"
```

### 6.3 Operator Hierarchy & Cryptographic Salt Binding

1. **Role Hierarchy**:
   - `Admin`: Unrestricted cluster governance, credential vault management, and model routing.
   - `Tier-3 Operator`: Technical troubleshooting, circuit breaker manual resets, and queue inspection.
   - `Support Lead`: Scoped view of user session turns without access to private credentials or prompt text.
   - `Junior Operator`: Read-only access to synthetic health checks and public catalog metrics.
2. **Feature Scope Assignment Editor**:
   - Fine-grained checkbox grid assigning scopes across tenants:
     - **Job Portal**: `RESUME_AST`, `Advanced Skill Extraction`, `External API Access`.
     - **ComfyUI**: `Text-to-Image`, `Image-to-Image`, `Large Model Inference`.
     - **Apps Builder**: `Basic Syntax Generation`, `Code Refactoring`, `Component Library Access`.
3. **Cryptographic User Salt Binding**:
   - Enforces cryptographic salt generation for each operator entity, ensuring operator diagnostic queries cannot cross tenant boundaries or decrypt applicant resumes.

---

## 7. Screen 6: Visual Workflow DAG Builder & MCP Studio

### 7.1 Visual Interface Mockup

![Visual Workflow Builder Mockup](images/model-connector-ui/06_workflow_builder.jpg)

### 7.2 Detailed Visual DAG Builder UI Flow Diagram

```mermaid
flowchart TD
    PALETTE["Component Toolbox (Left Drawer)"] -->|Drag 'Navigate' Node| CANVAS["Interactive Canvas (React Flow / Dagre)"]
    PALETTE -->|Drag 'DOM to Markdown' Node| CANVAS
    PALETTE -->|Drag 'Model Inference' Node| CANVAS
    PALETTE -->|Drag 'Form Autofill' Node| CANVAS

    CANVAS --> CONNECT["User Drags Edge: Navigate -> DOM to Markdown -> Model -> Autofill"]
    CONNECT --> VALIDATE_DAG{"Client-side Acyclic Verification"}
    
    VALIDATE_DAG -->|Cycle Detected| ERROR_TOAST["Show Error: 'Circular Dependencies Forbidden'"]
    VALIDATE_DAG -->|Valid DAG| SELECT_NODE["User Clicks 'Form Autofill' Node"]
    
    SELECT_NODE --> OPEN_DRAWER["Open Step Configuration Drawer (Right)"]
    OPEN_DRAWER --> CONFIGURE["1. Set Selector Cascade: CSS -> XPath -> ARIA<br/>2. Adjust Watchdog Timeout Slider: 15,000ms<br/>3. Bind Parameter Placeholders: {{vars.applicantEmail}}"]
    
    CONFIGURE --> EXPORT_CLICK["User Clicks 'Compile & Export Bisect JSON'"]
    EXPORT_CLICK --> GATEWAY_SAVE["POST /api/v1/workflows/templates { dagJson, isCanonical: true }"]
    GATEWAY_SAVE --> DEPLOY_READY["Workflow Stamped & Ready for Headless Playwright MCP Execution"]
```

### 7.3 Bisect Part A Step Orchestration & Watchdog Configuration

1. **Visual Node Graph Canvas**:
   - Drag-and-drop workflow step orchestration:
     - Step 1: `Navigate` (Target URL).
     - Step 2: `Sniff Auth` (Intercept tokens & cookies).
     - Step 3: `Convert DOM to Markdown` (Strip headers/scripts into clean markdown AST).
     - Step 4: `AI Model Inference` (Map candidate profile to form inputs).
     - Step 5: `Form Autofill` (Execute input fills and submit).
2. **Step Configuration Inspector**:
   - **Selector Fallback Cascade**: Prioritized array of selectors (`CSS: .form-submit`, `XPath: //button[@type='submit']`, `ARIA: [role="button"][name="Submit"]`).
   - **Timeout Slider**: Watchdog deadline slider (default: `15,000ms watchdog`).
   - **Dynamic Parameter Variables**: Defines placeholder bags (`applicantName`, `resumeText`) without hardcoded PII.
3. **Export Bisect JSON**: Exports the workflow structure into `WORKFLOW_TEMPLATES` for headless execution by `playwright-mcp-engine`.

---

## 8. Screen 7: Token Exhaustion & Context Window Recovery UI Flow

### 8.1 Detailed Token Exhaustion & Compaction UI Flow Diagram

```mermaid
sequenceDiagram
    autonumber
    actor User as User / Candidate
    participant UI as WorkspaceView (React)
    participant Gauge as TokenBurnMeter (UI Widget)
    participant Modal as TokenRecoveryModal (Glassmorphism)
    participant Gateway as model-connector-service (Port 8095)

    User->>UI: Submits Massive Document / Multi-Turn Prompt (160,000 tokens)
    UI->>Gauge: Evaluate Token Budget vs Model Ceiling (GPT-4o: 128k Max)
    Gauge-->>UI: Alert: Context Exceeded (125% of Capacity)
    UI-->>User: Open Glassmorphism Token Recovery Modal

    User->>Modal: Selects Action: "Apply Smart AST Compaction (-40%)"
    Modal->>Gateway: POST /api/v1/tokens/compact { promptText: "...", modelId: "gpt-4o" }
    Gateway->>Gateway: Strip Markdown Whitespace & Redundant AST Nodes
    Gateway-->>Modal: 200 OK { compactedTokens: 98000, reductionPercent: 38.75 }
    
    Modal-->>User: Display Side-by-Side Diff Preview (Before: 160k vs After: 98k)
    User->>Modal: Click "Confirm & Resume Pipeline"
    Modal->>Gateway: POST /api/v1/jobs/resume-with-compaction { compactedPayload }
    Gateway-->>UI: 200 OK: Pipeline Progressing Normally (Zero Step Loss)
    UI->>Gauge: Transition Gauge from Red to Green (76% Capacity)
```

### 8.2 Smart Compaction Modal & Fallback Model Cascade Interface

When context limits or provider quotas are reached:
1. **Context Gauge**: Changes dynamically from Cyan ($< 70\%$) to Amber ($70\% - 90\%$) to Red ($> 90\%$).
2. **Interactive Recovery Modal**:
   - **Option A: Smart AST Compaction**: Strips boilerplate, HTML comments, and unneeded whitespace to reduce prompt size by up to 45%.
   - **Option B: Switch to Long-Context Model**: One-click switch to Google Gemini (1M/2M tokens) or Claude 3.7 Sonnet (200k tokens).
   - **Option C: Switch to Local Ollama**: Route to local on-device inference with zero cloud quota limits.

---

## 9. Screen 8: Access Revocation & Re-Authentication Recovery UI Flow

### 9.1 Detailed Re-Authentication Recovery UI Flow Diagram

```mermaid
flowchart TD
    WS_ALERT["WebSocket Inbound: EVENT_CREDENTIAL_REVOKED"] --> SHOW_BANNER["Display Glassmorphism Amber Banner at Top of Screen"]
    SHOW_BANNER --> PAUSE_STEP["Update Active Step Indicator: 'PAUSED_AWAITING_REAUTH'"]
    
    USER_CLICK["User Clicks 'Reconnect Provider' Button"] --> OPEN_MODAL["Render Re-Authentication Modal"]
    OPEN_MODAL --> EXPLAIN["Show: 'Google OAuth token revoked. Step 3 (Resume AST) is preserved.'"]
    
    EXPLAIN --> TRIGGER_OAUTH["User Clicks 'Authorize with Google'"]
    TRIGGER_OAUTH --> POPUP["GIS OAuth Consent Popup"]
    POPUP --> GET_CODE["User Grants Permissions & Obtains Auth Code"]
    
    GET_CODE --> POST_REAUTH["POST /api/v1/auth/google/reconnect { code, targetJobId }"]
    POST_REAUTH --> TEST_PING["Gateway Performs 0-Token Health Ping"]
    
    TEST_PING -->|Success| RESUME["Gateway Automatically Unfreezes Step 3"]
    RESUME --> UPDATE_UI["Update Step Indicator from Amber to Green RUNNING"]
    UPDATE_UI --> STREAM_OUTPUT["Live Token Stream Resumes on Screen"]
```

### 9.2 Amber Alert Banner & Step-Preserved Resumption

1. **Persistent Amber Banner**: Displays target provider, affected job ID, and preserved step index.
2. **Zero Loss of Progress**: The user does not need to restart from Step 1 or re-upload their resume. All intermediate AST evaluation data is preserved.

---

## 10. Screen 9: Dynamic Onboarding Workflow Step Skip Controls UI Flow

### 10.1 Detailed Step Skip Governance UI Flow Diagram

```mermaid
sequenceDiagram
    autonumber
    actor User as User / Recruiter
    participant UI as WorkflowStepCard (React)
    participant Dialog as SkipGovernanceDialog (Modal)
    participant Gateway as model-connector-service (Port 8095)

    User->>UI: Hover over Step 3 ("Resume AST Mutation AWS to GCP")
    UI-->>User: Reveal "Skip Step" Action Link
    User->>UI: Click "Skip Step"
    UI->>Dialog: Open Skip Governance Dialog
    
    Dialog-->>User: Prompt Scope: [ ] Single Record (REC-90812) vs [ ] Flow-Wide
    User->>Dialog: Select "Single Record Only"
    User->>Dialog: Type Reason: "Candidate already certified in GCP Professional Architect"
    User->>Dialog: Click "Authorize Skip"

    Dialog->>Gateway: POST /api/v1/workflows/jobs/JOB-01/steps/3/skip { recordId: "REC-90812", reason: "...", scope: "RECORD" }
    Gateway->>Gateway: Validate Reason Length (>= 10 chars) & Log to SYSTEM_AUDIT_LOGS
    Gateway-->>UI: 200 OK { stepSkipped: true, syntheticOutput: {...} }
    
    UI-->>User: Transition Step 3 to Grey Badge: 'SKIPPED (Audited)'
    UI-->>User: Automatically Trigger Step 4 ("HITL Verification Gate")
```

### 10.2 Single Record Skip vs. Flow-Wide Skip Dialog

- **Single Record**: Applies strictly to the designated record ID with mandatory audit trail.
- **Flow-Wide**: Restricted to `TENANT_ADMIN`. Prompts for DAG version bump confirmation before excluding the step from the canonical pipeline for all inbound records.

---

## 11. Screen 10: Free-Tier Cookie Management & Health Inspector UI Flow

### 11.1 Detailed Cookie Management UI Flow Diagram

```mermaid
flowchart TD
    NAV["Navigate: Settings -> Model Providers -> Free-Tier Sessions"] --> RENDER_SESSIONS["Render Active Free-Tier Cards (Google AI Studio, Claude, ChatGPT)"]
    
    USER_CHOOSE{"Choose Import Strategy"}
    
    USER_CHOOSE -->|Headless Browser Login| BROWSER_BTN["Click 'Log In via Headless Browser'"]
    BROWSER_BTN --> SPAWN_MCP["Gateway Launches Sandboxed Playwright Window in UI Iframe"]
    SPAWN_MCP --> SOLVE["User Completes Web Login & CAPTCHA in Sandboxed Window"]
    SOLVE --> SNIFF_COOKIES["Playwright MCP Extracts Session Cookies (__Secure-1PSID, cf_clearance)"]
    SNIFF_COOKIES --> ENCRYPT_SAVE["AES-256-GCM Encrypted & Stored in COOKIE_VAULT_CREDENTIALS"]

    USER_CHOOSE -->|Manual Paste| PASTE_BTN["Click 'Paste Cookie JSON'"]
    PASTE_BTN --> PASTE_INPUT["User Pastes Cookie Jar JSON Array"]
    PASTE_INPUT --> VALIDATE_JSON["Client-side Format Validation & Salt Encryption"]
    VALIDATE_JSON --> POST_COOKIE["POST /api/v1/cookies/import"]

    ENCRYPT_SAVE & POST_COOKIE --> PROBE_TEST["Click 'Test Probe' (0-token Health Ping)"]
    PROBE_TEST --> RENDER_HEALTH["Update Status Badge: 🟢 HEALTHY (HTTP 200)"]
```

### 11.2 Cookie Ingestion Dialog & Playwright MCP Health Testing

- Real-time probe results show latency in milliseconds and session TTL expiry warnings.
- The UI provides one-click re-authentication via Playwright MCP when cookies enter the `EXPIRING_SOON` state.

---

## 12. UI-to-Service Connection Security Invariants

All interactions between `model-connector-ui` and `model-connector-service` strictly enforce:
1. **Strict Transport Layer Security**: TLS 1.3 encryption across all REST and WebSocket connections.
2. **W3C Tracing Headers**: Every frontend fetch call synthesizes a W3C `traceparent` header to maintain complete distributed tracing lineage.
3. **Zero Secret Storage in Browser**: Browser `localStorage` holds only ephemeral JWT access tokens (TTL: 15 minutes). No API keys, model passwords, or raw session cookies are ever stored on the client.
4. **Content Security Policy (CSP)**: Strict CSP headers blocking unauthorized inline scripts and external cross-origin connections.

---

## 13. Screen 11: LinkedIn X-Ray Discovery, Playwright Dynamic Placeholder Workflows & AI Assistance UI Flow

### 13.1 Detailed LinkedIn X-Ray & Dynamic Template Execution UI Flow Diagram

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1E293B', 'primaryTextColor': '#F8FAFC', 'primaryBorderColor': '#38BDF8', 'lineColor': '#94A3B8', 'secondaryColor': '#0F172A', 'tertiaryColor': '#1E293B', 'noteBkgColor': '#334155', 'noteTextColor': '#F8FAFC'}}}%%
flowchart TD
    classDef action fill:#0F172A,stroke:#38BDF8,stroke-width:2px,color:#F8FAFC;
    classDef decision fill:#1E293B,stroke:#F59E0B,stroke-width:2px,color:#F8FAFC;
    classDef success fill:#0F172A,stroke:#34D399,stroke-width:2px,color:#F8FAFC;
    classDef ai fill:#1E293B,stroke:#818CF8,stroke-width:2px,color:#F8FAFC;

    START["Operator Navigates to LinkedIn X-Ray & Application Studio"]:::action --> QUERY_INPUT["Input Role Title, Location, and Core Skills"]:::action
    QUERY_INPUT --> GEN_QUERY["UI Generates Boolean X-Ray String (site:linkedin.com/in/ ...)"]:::action
    GEN_QUERY --> RUN_CRAWL["Click 'Execute Discovery Crawl'"]:::action
    
    RUN_CRAWL --> MCP_CRAWL["Playwright MCP Navigates with Human-Emulated Mouse Bezier Curves"]:::action
    MCP_CRAWL --> DOM_STRIP["DomAstSanitizer Prunes Scripts, Ads, SVGs (4MB -> 50KB Clean AST)"]:::action
    DOM_STRIP --> AST_PARSE["Extract Experience, Education, Skills, and Tenure"]:::action
    AST_PARSE --> SCORE_CARD["Evaluate ATS Compatibility Scorecard (0-100)"]:::action
    
    SCORE_CARD --> CANDIDATE_GRID["Render Candidate Scorecard Cards with Match Gauges (85%, 92%, 97%)"]:::success
    CANDIDATE_GRID --> SELECT_CANDIDATE["Operator Selects Candidate & Target Career Portal (Workday/Greenhouse)"]:::action
    
    SELECT_CANDIDATE --> LOAD_TEMPLATE["Load Declarative Workflow Template with {{placeholders}}"]:::action
    LOAD_TEMPLATE --> REHYDRATE_SESSION["Fetch AES-256-GCM Session from BROWSER_SESSION_VAULT"]:::action
    
    REHYDRATE_SESSION --> CHECK_SESSION{"Is Rehydrated Session Active?"}:::decision
    CHECK_SESSION -- "EXPIRED" --> REAUTH_ALERT["Display Amber Re-Authentication Modal (Solve CAPTCHA / Re-login)"]:::decision
    CHECK_SESSION -- "ACTIVE (Valid StorageState)" --> EXECUTE_DAG["Playwright MCP Starts Step Execution"]:::action
    
    EXECUTE_DAG --> CHECK_STEP_TYPE{"Is Step Placeholder Static or AI-Driven?"}:::decision
    CHECK_STEP_TYPE -- "Static: {{candidate.name}}" --> STATIC_RESOLVE["Resolve Deterministic Value from Candidate Profile AST"]:::action
    CHECK_STEP_TYPE -- "AI: AI_RESOLVE_AND_FILL" --> CALL_AI_ASSIST["Trigger ModelAssistanceClient Loop-back (/api/v1/ai/assist/dom-action)"]:::ai
    
    CALL_AI_ASSIST --> AI_BADGE["UI Displays Floating Cyan Pulse: 'AI Reasoning in Progress...'"]:::ai
    AI_BADGE --> INJECT_VAL["Inject Synthesized Response into Career Form Textarea"]:::action
    STATIC_RESOLVE & INJECT_VAL --> SUBMIT_FORM["Submit Application Form & Capture Confirmation Number"]:::success
    SUBMIT_FORM --> SYNC_VAULT["Update BROWSER_SESSION_VAULT with Fresh StorageState Cookies"]:::action
    SYNC_VAULT --> NOTIFY_SUCCESS["Render Green Success Card: 'Application Successfully Submitted!'"]:::success
```

### 13.2 Interactive Placeholder Resolution & Real-Time AI Assistance Indicator

- **Visual Placeholder Chips**: When designing workflow templates in the UI, dynamic placeholders are rendered as color-coded interactive tokens:
  - 🔵 **Cyan Chips (`{{candidate.*}}`)**: Deterministic resume fields (e.g., `{{candidate.firstName}}`, `{{candidate.email}}`).
  - 🟢 **Emerald Chips (`{{job.*}}`)**: Job posting metadata (e.g., `{{job.reqId}}`, `{{job.companyName}}`).
  - 🟣 **Violet Chips (`{{ai.*}}`)**: Autonomous AI-synthesized fields that trigger in-flight model reasoning.
- **In-Flight AI Assistance Pulse**: While Playwright is performing form interactions and invokes the AI loop-back, the UI header displays a live micro-telemetry badge:
  - `⚡ AI Assist Active: Disambiguating Workday Experience Textarea (Confidence: 94%, Model: Gemini 1.5 Flash, Latency: 420ms)`.
- **Session Vault Health Dashboard**: Displays the real-time status of authenticated browser sessions:
  - Domain, encrypted state size, last used timestamp, and expiration countdown badge (e.g., `🟢 Active (Expires in 6d 14h)` vs. `🔴 Expired (Click to Re-Authenticate)`).
