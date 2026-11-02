# Model Connector Platform — Low-Level Design (LLD)

> **Document Status**: Production Engineering Specification  
> **Document Scope**: Micro Component Design, Class Structures, DDL Schemas, and Algorithmic Workflows  
> **Parent Blueprint**: [blueprint.md](blueprint.md)  
> **Macro System Architecture**: [hld.md](hld.md)  
> **UI High-Level Design**: [UI HLD (Security & Best Practices)](ui-hld.md)  
> **UI Low-Level Design & Figma Flows**: [UI LLD & Figma Flows](ui-lld.md)  
> **UI Screen Workflows**: [ui-flows.md](ui-flows.md)  
> **Gap Analysis & Implementation Roadmap**: [Gap Analysis & Implementation Roadmap](gap-analysis-and-implementation-roadmap.md)  
> **Use Case Specifications & Architecture**: [Use Case Catalog & Architecture](usecase/README.md)

---

## 📑 Table of Contents

- [1. Executive Low-Level Design Overview](#1-executive-low-level-design-overview)
- [2. Detailed Module Responsibilities & Class Architectures](#2-detailed-module-responsibilities--class-architectures)
  - [2.1 `model-connector-core` Foundation Primitives](#21-model-connector-core-foundation-primitives)
    - [2.1.1 Spring-Style Configuration Loader (`SpringEnvironmentConfig.ts`)](#211-spring-style-configuration-loader-springenvironmentconfigts)
    - [2.1.2 Resilience4j Fault Tolerance Engine (`resilience/`)](#212-resilience4j-fault-tolerance-engine-resilience)
    - [2.1.3 Generic Object Connection Pool (`ObjectConnectionPool.ts`)](#213-generic-object-connection-pool-objectconnectionpoolts)
    - [2.1.4 Centralized Constants & Zero Magic Literals (`constants/`)](#214-centralized-constants--zero-magic-literals-constants)
    - [2.1.5 Universal SQL Pagination Engine (`pagination/`)](#215-universal-sql-pagination-engine-pagination)
  - [2.2 `model-connector-client` Execution Engine](#22-model-connector-client-execution-engine)
    - [2.2.1 Polymorphic Strategy Pattern Class Diagram](#221-polymorphic-strategy-pattern-class-diagram)
    - [2.2.2 Test Hermetic Mocking vs. Production Real Model Execution](#222-test-hermetic-mocking-vs-production-real-model-execution)
    - [2.2.3 Timeout Management & Protocol Client Implementations](#223-timeout-management--protocol-client-implementations)
  - [2.3 `model-connector-service` Gateway & Vault Layer](#23-model-connector-service-gateway--vault-layer)
    - [2.3.1 Ingress Middleware Pipeline & Execution Chain](#231-ingress-middleware-pipeline--execution-chain)
    - [2.3.2 Prompt, Instruction, and Skill Markdown Vault Service](#232-prompt-instruction-and-skill-markdown-vault-service)
    - [2.3.3 Multi-Tenant Isolated Repository Queries](#233-multi-tenant-isolated-repository-queries)
  - [2.4 `playwright-mcp-engine` Execution Mechanics](#24-playwright-mcp-engine-execution-mechanics)
    - [2.4.1 Concurrency Browser Context Pool](#241-concurrency-browser-context-pool)
    - [2.4.2 Dynamic Template Resolver & Fallback Cascades](#242-dynamic-template-resolver--fallback-cascades)
    - [2.4.3 Watchdog Stuck-Process Tree Killer Algorithm](#243-watchdog-stuck-process-tree-killer-algorithm)
    - [2.4.4 Deep Network Sniffer & Auth Classifier](#244-deep-network-sniffer--auth-classifier)
- [3. Complete Enterprise Database Architecture (Polyglot Persistence)](#3-complete-enterprise-database-architecture-polyglot-persistence)
  - [3.1 Relational Schema Invariants & Design Principles](#31-relational-schema-invariants--design-principles)
  - [3.2 Production RDBMS DDL Specification (All 15 Tables)](#32-production-rdbms-ddl-specification-all-15-tables)
  - [3.3 High-Performance Relational Indexing Strategy](#33-high-performance-relational-indexing-strategy)
  - [3.4 Enterprise NoSQL Document Architecture (MongoDB Collections & BSON Schemas)](#34-enterprise-nosql-document-architecture-mongodb-collections--bson-schemas)
  - [3.5 Redis In-Memory Key Structures & TTL Governance](#35-redis-in-memory-key-structures--ttl-governance)
- [4. Endpoint User Flows & Detailed Sequence Diagrams](#4-endpoint-user-flows--detailed-sequence-diagrams)
  - [4.1 Flow 1: Resume AST Verification & Scorecard Evaluation](#41-flow-1-resume-ast-verification--scorecard-evaluation)
  - [4.2 Flow 2: Controlled Resume Content Mutation (e.g. AWS to GCP)](#42-flow-2-controlled-resume-content-mutation-eg-aws-to-gcp)
  - [4.3 Flow 3: Web-to-Markdown & Career Portal Autofill via Playwright MCP](#43-flow-3-web-to-markdown--career-portal-autofill-via-playwright-mcp)
  - [4.4 Flow 4: ComfyUI Storyteller Prompt & Workflow Generation](#44-flow-4-comfyui-storyteller-prompt--workflow-generation)
  - [4.5 Flow 5: Apps Builder Skill MD Ingestion & Code Generation](#45-flow-5-apps-builder-skill-md-ingestion--code-generation)
- [5. Authentication, Authorization & Security Configuration Matrix](#5-authentication-authorization--security-configuration-matrix)
  - [5.1 Security Perimeters & Ingress Configuration](#51-security-perimeters--ingress-configuration)
  - [5.2 Zero-PII Regex Redaction Implementation](#52-zero-pii-regex-redaction-implementation)
- [6. Protocol & Concurrency Comparative Benchmarking](#6-protocol--concurrency-comparative-benchmarking)
- [7. Distributed Logging & Audit Telemetry Schema](#7-distributed-logging--audit-telemetry-schema)
- [8. Enterprise Queue System Architecture & Zero-Leakage Multi-Tenant Isolation](#8-enterprise-queue-system-architecture--zero-leakage-multi-tenant-isolation)
  - [8.1 Queue Architecture & Broker Selection](#81-queue-architecture--broker-selection)
  - [8.2 The Zero-Leakage Multi-Tenant Isolation Invariant](#82-the-zero-leakage-multi-tenant-isolation-invariant)
  - [8.3 HMAC Cryptographically Signed Message Envelopes](#83-hmac-cryptographically-signed-message-envelopes)
  - [8.4 User Inbound Queue & Ephemeral Exclusive Reply-To Routing](#84-user-inbound-queue--ephemeral-exclusive-reply-to-routing)
  - [8.5 Dead-Letter-Exchange (DLX) & Failure Boundary Isolation](#85-dead-letter-exchange-dlx--failure-boundary-isolation)
- [9. Silent Access Revocation & Dynamic Recovery Design](#9-silent-access-revocation--dynamic-recovery-design)
  - [9.1 Auth Revocation Circuit Breaker & Trap Implementation](#91-auth-revocation-circuit-breaker--trap-implementation)
  - [9.2 State Transition Machine & Problem Details Envelope](#92-state-transition-machine--problem-details-envelope)
  - [9.3 Sequence Flow: Silent Revocation & State-Preserved Resumption](#93-sequence-flow-silent-revocation--state-preserved-resumption)
- [10. Enhanced DDL Specification (Tables 16-19)](#10-enhanced-ddl-specification-tables-16-19)
  - [10.1 Table 16: COOKIE_VAULT_CREDENTIALS](#101-table-16-cookie_vault_credentials)
  - [10.2 Table 17: ONBOARDING_WORKFLOW_TEMPLATES](#102-table-17-onboarding_workflow_templates)
  - [10.3 Table 18: RECORD_STEP_EXECUTIONS](#103-table-18-record_step_executions)
  - [10.4 Table 19: ACCESS_REVOCATION_LOGS](#104-table-19-access_revocation_logs)
- [11. Dynamic Workflow Execution Engine & Skip Governance](#11-dynamic-workflow-execution-engine--skip-governance)
  - [11.1 Dynamic DAG Synthesis & Zero-Skip Verification Gate](#111-dynamic-dag-synthesis--zero-skip-verification-gate)
  - [11.2 Record-Level Skip vs. Flow-Wide Skip Implementation](#112-record-level-skip-vs-flow-wide-skip-implementation)
- [12. Free-Tier Cookie-Based Model Connector Client & Playwright Sync](#12-free-tier-cookie-based-model-connector-client--playwright-sync)
  - [12.1 AES-256-GCM Vault & Header Emulation Adapter](#121-aes-256-gcm-vault--header-emulation-adapter)
  - [12.2 Playwright MCP Headless Cookie Synchronization Interface](#122-playwright-mcp-headless-cookie-synchronization-interface)
- [13. Token Exhaustion & Context Window Recovery Engine](#13-token-exhaustion--context-window-recovery-engine)
  - [13.1 `ITokenRecoveryStrategy` & Polymorphic Strategy Hierarchy](#131-itokenrecoverystrategy--polymorphic-strategy-hierarchy)
  - [13.2 AST Pruning & Chunked Map-Reduce Summarization Algorithm](#132-ast-pruning--chunked-map-reduce-summarization-algorithm)
  - [13.3 Dynamic Model Failover Router with Token Quota Check](#133-dynamic-model-failover-router-with-token-quota-check)
  - [13.4 Table 20 DDL: `TOKEN_BUDGET_LEDGERS`](#134-table-20-ddl-token_budget_ledgers)
- [14. Monorepo Code Generation Rules & Anti-Pattern Eliminator](#14-monorepo-code-generation-rules--anti-pattern-eliminator)
  - [14.1 The 7 Golden Rules of Code Synthesis](#141-the-7-golden-rules-of-code-synthesis)
  - [14.2 Concrete Code Refactoring: Procedural Branching to Strategy & Chain of Responsibility](#142-concrete-code-refactoring-procedural-branching-to-strategy--chain-of-responsibility)
- [15. Master HTTP Status & Condition-Based Navigation Matrix](#15-master-http-status--condition-based-navigation-matrix)
  - [15.1 Comprehensive Flow Navigation & Status Mapping Table](#151-comprehensive-flow-navigation--status-mapping-table)
- [16. Comprehensive Flow Restriction Audit Logging & Investigation Architecture](#16-comprehensive-flow-restriction-audit-logging--investigation-architecture)
  - [16.1 Problem Statement & Architectural Scope](#161-problem-statement--architectural-scope)
  - [16.2 Three Hierarchical Restriction Scopes](#162-three-hierarchical-restriction-scopes)
  - [16.3 Structured Audit Event JSON Schema (`AUDIT_EVENT_RESTRICTION_LOG`)](#163-structured-audit-event-json-schema-audit_event_restriction_log)
  - [16.4 Relational DDL for Restriction Audit Logs](#164-relational-ddl-for-restriction-audit-logs)
  - [16.5 Forensic Investigation Query Recipes (SecOps & Compliance)](#165-forensic-investigation-query-recipes-secops--compliance)
- [17. Distributed De-duplication Database Schema & Redis Lock Engine](#17-distributed-de-duplication-database-schema--redis-lock-engine)
  - [17.1 Production DDL Schema: `ACTION_DEDUPLICATION_REGISTRY`](#171-production-ddl-schema-action_deduplication_registry)
  - [17.2 Redis Distributed Lock Pattern (Atomic Implementation)](#172-redis-distributed-lock-pattern-atomic-implementation)
- [18. Apache APISIX Ingress Gateway Configuration & Routing Engine](#18-apache-apisix-ingress-gateway-configuration--routing-engine)
  - [18.1 Standalone Declarative Gateway Configuration (`apisix.yaml`)](#181-standalone-declarative-gateway-configuration-apisixyaml)
- [19. Low-Level Design: Workflow Resumption & Cryptographic State Ledger](#19-low-level-design-workflow-resumption--cryptographic-state-ledger)
  - [19.1 Relational Schema: `WORKFLOW_STEP_LEDGER`](#191-relational-schema-workflow_step_ledger)
  - [19.2 Cryptographic Integrity Guard Implementation (`WorkflowIntegrityGuard.ts`)](#192-cryptographic-integrity-guard-implementation-workflowintegrityguardts)
  - [19.3 Workflow Resumption Controller & Dispatcher](#193-workflow-resumption-controller--dispatcher)
- [20. Multi-MCP Protocol Client & Gateway Adapter Implementation](#20-multi-mcp-protocol-client--gateway-adapter-implementation)
  - [20.1 Core TypeScript Interfaces & Adapter Hierarchy](#201-core-typescript-interfaces--adapter-hierarchy)
  - [20.2 `StdioMcpAdapter.ts` Implementation with Child Process Sandboxing](#202-stdiomcpadapterts-implementation-with-child-process-sandboxing)
  - [20.3 `SseMcpAdapter.ts` Implementation with Resilient Event Stream](#203-ssemcpadapterts-implementation-with-resilient-event-stream)
  - [20.4 `McpClientManager.ts` Connection Pool & Dynamic Tool Normalizer](#204-mcpclientmanagerts-connection-pool--dynamic-tool-normalizer)
- [21. Playwright-MCP to Model-Connector AI Assistance Client Implementation](#21-playwright-mcp-to-model-connector-ai-assistance-client-implementation)
  - [21.1 `ModelAssistanceClient.ts` Loop-back Implementation](#211-modelassistanceclientts-loop-back-implementation)
  - [21.2 Ingress DOM Pruning & Token Compactor Algorithm](#212-ingress-dom-pruning--token-compactor-algorithm)
  - [21.3 Circuit Breaker & Recursion Depth Limiter Guard](#213-circuit-breaker--recursion-depth-limiter-guard)
- [22. LinkedIn X-Ray DOM Engine & Semantic Profile AST Parser](#22-linkedin-x-ray-dom-engine--semantic-profile-ast-parser)
  - [22.1 `LinkedInXRayEngine.ts` Query Synthesis & Discovery Crawler](#221-linkedinxrayenginets-query-synthesis--discovery-crawler)
  - [22.2 `DomAstSanitizer.ts` Noise Pruner & Structural Extractor](#222-domastsanitizerts-noise-pruner--structural-extractor)
  - [22.3 `ProfileAstParser.ts` Semantic Entity & Tenure Normalizer](#223-profileastparserts-semantic-entity--tenure-normalizer)
  - [22.4 ATS Compatibility Scoring Engine (`ScorecardEvaluator.ts`)](#224-ats-compatibility-scoring-engine-scorecardevaluatorts)
- [23. Playwright Workflow Template Executor, Dynamic Placeholder Engine & Session Vault](#23-playwright-workflow-template-executor-dynamic-placeholder-engine--session-vault)
  - [23.1 Template Schema & Step Runner (`WorkflowTemplateExecutor.ts`)](#231-template-schema--step-runner-workflowtemplateexecutorts)
  - [23.2 `PlaceholderResolver.ts` with JIT AI Escalation Binding](#232-placeholderresolverts-with-jit-ai-escalation-binding)
  - [23.3 `BrowserSessionVault.ts`: AES-256-GCM StorageState Encryption & Rehydration](#233-browsersessionvaultts-aes-256-gcm-storagestate-encryption--rehydration)
  - [23.4 DDL Schema: `BROWSER_SESSION_VAULT` Production Table](#234-ddl-schema-browser_session_vault-production-table)
- [24. Platform-Wide Timezone Engine & Recipient-Centric Scheduler Implementation](#24-platform-wide-timezone-engine--recipient-centric-scheduler-implementation)
  - [24.1 Universal UTC Storage Invariant & Ingress/Egress Interceptor](#241-universal-utc-storage-invariant--ingressegress-interceptor)
  - [24.2 Recipient Timezone Resolution Hierarchy & Fallback Mesh (`TimezoneResolutionRegistry.ts`)](#242-recipient-timezone-resolution-hierarchy--fallback-mesh-timezoneresolutionregistryts)
  - [24.3 Business Window Calculation & Anti-Spam Micro-Jitter (`BusinessWindowCalculator.ts`)](#243-business-window-calculation--anti-spam-micro-jitter-businesswindowcalculatorts)
  - [24.4 Timezone Storage & Cache DDL (`RECIPIENT_TIMEZONE_CACHE`)](#244-timezone-storage--cache-ddl-recipient_timezone_cache)
- [25. Containerized Workflow Agent Registry & Dynamic APISIX Upstream Dispatcher](#25-containerized-workflow-agent-registry--dynamic-apisix-upstream-dispatcher)
  - [25.1 Workflow Agent Interface Contract (`IWorkflowAgent.ts`)](#251-workflow-agent-interface-contract-iworkflowagentts)
  - [25.2 Dynamic Gateway Upstream Health Registry (`AgentUpstreamRegistry.ts`)](#252-dynamic-gateway-upstream-health-registry-agentupstreamregistryts)
  - [25.3 Docker Compose Multi-Agent Topology Specification](#253-docker-compose-multi-agent-topology-specification)

---

## 1. Executive Low-Level Design Overview

This **Low-Level Design (LLD)** document defines the concrete algorithmic, object-oriented, and relational schema specifications for the **Model Connector Platform** and **Playwright MCP Engine**.

Every component adheres to the **8 Non-Negotiable Engineering Invariants**:
1. **Zero Relative Package Imports**: Strictly `@/*` path mapping across all TypeScript modules.
2. **Runtime Isolation**: Execution inside isolated environments (`.venv`, isolated containerized runners).
3. **OOP Design Patterns**: Polymorphic dispatch, Strategy, Builder, and Factory patterns with zero nested `if/else` ladders ($>2$ levels).
4. **Centralized Constants**: Zero magic literals; strict UPPER_CASE enum mappings.
5. **Ecosystem Standards**: Utilization of vetted libraries (`zod`, `helmet`, `winston`, `resilience4j`-equivalent algorithms).
6. **Clean Code & Resilient Errors**: Single-responsibility methods ($\le 20$ lines), RFC-7807 problem details, zero swallowed exceptions.
7. **Security SAST/SCA**: Parameterized SQL exclusively, zero plaintext secrets, zero PII in query/URLs.
8. **Complexity Limits**: Cyclomatic complexity $\le 10$, cognitive complexity $\le 15$.

---

## 2. Detailed Module Responsibilities & Class Architectures

### 2.1 `model-connector-core` Foundation Primitives

#### 2.1.1 Spring-Style Configuration Loader (`SpringEnvironmentConfig.ts`)

Implements Spring Boot-style layered property resolution with environment variable binding, typed casting, and hierarchical overrides:

```mermaid
classDiagram
    class SpringEnvironmentConfig {
        -properties: Map~string, any~
        -profiles: string[]
        +initialize(profile?: string): void
        +getString(key: string, defaultValue?: string): string
        +getNumber(key: string, defaultValue?: number): number
        +getBoolean(key: string, defaultValue?: boolean): boolean
        +getObject~T~(keyPrefix: string): T
        -resolvePlaceholders(value: string): string
    }

    class EnvironmentPropertyPrecedence {
        <<enumeration>>
        SYSTEM_PROPERTIES
        ENVIRONMENT_VARIABLES
        APPLICATION_PROFILE_YML
        APPLICATION_YML
        DEFAULT_FALLBACKS
    }

    SpringEnvironmentConfig --> EnvironmentPropertyPrecedence
```

- **Precedence Order**:
  1. Operating System Environment Variables (`process.env`).
  2. Profile-specific files (`application-production.json` / `.env.production`).
  3. Base configuration file (`application.json` / `.env`).
  4. Code-defined default constants (`CoreConstants.ts`).
- **Placeholder Interpolation**: Resolves nested properties like `${DB_HOST:localhost}:${DB_PORT:5432}` automatically.

#### 2.1.2 Resilience4j Fault Tolerance Engine (`resilience/`)

Modeled after Netflix Hystrix and Resilience4j, providing non-blocking fault protection:

```mermaid
stateDiagram-v2
    [*] --> CLOSED
    CLOSED --> OPEN: Failure Rate > 50% OR N Consecutive Failures
    OPEN --> HALF_OPEN: Wait Duration Elapsed (e.g. 10,000ms)
    HALF_OPEN --> CLOSED: M Consecutive Successes
    HALF_OPEN --> OPEN: Single Upstream Failure
```

##### 1. `CircuitBreaker.ts`:
- **States**: `CLOSED` (Normal operation), `OPEN` (Fast-fail without calling upstream), `HALF_OPEN` (Probe trial traffic).
- **Configuration**:
  - `failureRateThreshold`: 50%
  - `slidingWindowSize`: 20 requests
  - `waitDurationInOpenStateMs`: 10,000ms
  - `permittedNumberOfCallsInHalfOpenState`: 3 requests

##### 2. `RetryPolicy.ts`:
- **Exponential Backoff Formula with Full Jitter**:
  $$t_{\text{wait}} = \text{random}(0, \min(t_{\text{max}}, t_{\text{initial}} \times 2^{\text{attempt}}))$$
- Prevents thundering-herd synchronicity against model API endpoints during recovery.

##### 3. `Bulkhead.ts`:
- Limits concurrent requests per model family (e.g., maximum 50 concurrent requests for `gemini`, 10 for local `ollama`).
- Queues excess requests in a bounded non-blocking buffer or throws `BulkheadFullException`.

##### 4. `RateLimiter.ts`:
- Token Bucket algorithm enforcing requests-per-second (RPS) thresholds per API key.

#### 2.1.3 Generic Object Connection Pool (`ObjectConnectionPool.ts`)

Provides enterprise resource governance modeled after HikariCP:

```mermaid
classDiagram
    class IPooledResource {
        <<interface>>
        +getResourceId(): string
        +isValid(): Promise~boolean~
        +destroy(): Promise~void~
    }

    class IResourceFactory~T~ {
        <<interface>>
        +create(): Promise~T~
        +validate(resource: T): Promise~boolean~
        +destroy(resource: T): Promise~void~
    }

    class ObjectConnectionPool~T~ {
        -factory: IResourceFactory~T~
        -availableList: T[]
        -borrowedSet: Set~T~
        -waitingQueue: Array~QueueWaiter~
        -config: PoolConfiguration
        +acquire(): Promise~T~
        +release(resource: T): void
        +drain(): Promise~void~
        +getStats(): PoolStatistics
    }

    ObjectConnectionPool --> IPooledResource
    ObjectConnectionPool --> IResourceFactory
```

- **Invariant Configuration**:
  - `minIdle`: 5 resources pre-warmed at startup.
  - `maxPoolSize`: 50 resources.
  - `acquireTimeoutMs`: 3,000ms (throws `ConnectionPoolTimeoutException` on timeout).
  - `idleTimeoutMs`: 60,000ms (evicts stale idle resources).
  - `maxLifetimeMs`: 1,800,000ms (30 minutes force-refresh to combat connection leaks).

#### 2.1.4 Centralized Constants & Zero Magic Literals (`constants/`)

Strictly isolated static values conforming to `STD-COD-002` and `STD-COD-004`:

```typescript
export const CoreConstants = {
  MODELS: {
    GEMINI_3_8_FLASH: 'gemini-3.8-flash',
    GEMINI_3_5_FLASH: 'gemini-3.5-flash',
    CLAUDE_3_7_SONNET: 'claude-3-7-sonnet',
    GPT_4O: 'gpt-4o',
    GROK_3: 'grok-3',
    LLAMA_3_2: 'llama3.2',
  },
  FAMILIES: {
    GEMINI: 'gemini',
    OPENAI: 'chatgpt',
    ANTHROPIC: 'claude',
    XAI: 'grok',
    MICROSOFT: 'copilot',
    OLLAMA: 'ollama',
  },
  STRATEGY_MODES: {
    API: 'api',
    CLI: 'cli',
    COOKIE: 'cookie',
  },
  HEADERS: {
    CORRELATION_ID: 'x-correlation-id',
    TRACEPARENT: 'traceparent',
    TRACE_ID: 'x-trace-id',
    SPAN_ID: 'x-span-id',
    RESPONSE_TIME: 'x-response-time-ms',
    API_KEY: 'x-api-key',
  },
  TIMEOUTS: {
    DEFAULT_API_MS: 30000,
    LONG_RUNNING_INFERENCE_MS: 180000,
    POOL_ACQUIRE_MS: 3000,
    STUCK_PROCESS_KILLER_MS: 15000,
  },
} as const;
```

#### 2.1.5 Universal SQL Pagination Engine (`pagination/`)

Supports zero-string-interpolation pagination across all 5 major SQL dialects:

```typescript
export enum PaginationDialect {
  POSTGRESQL = 'POSTGRESQL',
  MYSQL = 'MYSQL',
  ORACLE = 'ORACLE',
  SQL_SERVER = 'SQL_SERVER',
  SQLITE = 'SQLITE',
}

export class PaginationQueryBuilder {
  public static build(
    baseSql: string,
    pageable: Pageable,
    dialect: PaginationDialect
  ): ParameterizedQuery {
    const offset = pageable.getPageNumber() * pageable.getPageSize();
    const limit = pageable.getPageSize();

    switch (dialect) {
      case PaginationDialect.POSTGRESQL:
      case PaginationDialect.SQLITE:
        return {
          sql: `${baseSql} LIMIT :limit OFFSET :offset`,
          parameters: { limit, offset },
        };
      case PaginationDialect.MYSQL:
        return {
          sql: `${baseSql} LIMIT :offset, :limit`,
          parameters: { offset, limit },
        };
      case PaginationDialect.ORACLE:
        return {
          sql: `${baseSql} OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
          parameters: { offset, limit },
        };
      case PaginationDialect.SQL_SERVER:
        return {
          sql: `${baseSql} OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
          parameters: { offset, limit },
        };
    }
  }
}
```

---

### 2.2 `model-connector-client` Execution Engine

#### 2.2.1 Polymorphic Strategy Pattern Class Diagram

```mermaid
classDiagram
    class IModelConnectorStrategy {
        <<interface>>
        +executePrompt(request: ExecutionRequest): Promise~ExecutionResponse~
        +streamPrompt(request: ExecutionRequest): AsyncIterable~StreamChunk~
        +isAvailable(): Promise~boolean~
        +getStrategyMode(): StrategyMode
    }

    class CliConnectorStrategy {
        -processManager: CliProcessManager
        -commandBuilder: CliCommandBuilder
        +executePrompt(request): Promise~ExecutionResponse~
        +streamPrompt(request): AsyncIterable~StreamChunk~
    }

    class ApiConnectorStrategy {
        -httpClient: IResilientHttpClient
        -circuitBreaker: CircuitBreaker
        +executePrompt(request): Promise~ExecutionResponse~
        +streamPrompt(request): AsyncIterable~StreamChunk~
    }

    class CookieConnectorStrategy {
        -cookieVault: ICookieVaultRepository
        -sessionRotator: SessionCookieRotator
        +executePrompt(request): Promise~ExecutionResponse~
        +streamPrompt(request): AsyncIterable~StreamChunk~
    }

    class MockModelConnectorStrategy {
        -hermeticGenerator: HermeticSimulationEngine
        +executePrompt(request): Promise~ExecutionResponse~
        +streamPrompt(request): AsyncIterable~StreamChunk~
    }

    class UnifiedModelExecutionAdapter {
        -strategies: Map~StrategyMode, IModelConnectorStrategy~
        -fallbackModelCatalog: ModelCatalogDiscoveryAdapter
        +execute(request: ExecutionRequest): Promise~ExecutionResponse~
        +stream(request: ExecutionRequest): AsyncIterable~StreamChunk~
    }

    IModelConnectorStrategy <|.. CliConnectorStrategy
    IModelConnectorStrategy <|.. ApiConnectorStrategy
    IModelConnectorStrategy <|.. CookieConnectorStrategy
    IModelConnectorStrategy <|.. MockModelConnectorStrategy
    UnifiedModelExecutionAdapter --> IModelConnectorStrategy
```

#### 2.2.2 Test Hermetic Mocking vs. Production Real Model Execution

To satisfy the invariant: **"Only during test cases it must mock while rest it will execute actual model via CLI and REST-API"**:

```typescript
export class StrategyFactory {
  public static create(
    mode: StrategyMode,
    isTestEnvironment: boolean
  ): IModelConnectorStrategy {
    // Hermetic Invariant: Never invoke live models or external network during automated tests
    if (isTestEnvironment || process.env.NODE_ENV === 'test') {
      return new MockModelConnectorStrategy();
    }

    switch (mode) {
      case 'cli':
        return new CliConnectorStrategy(new CliProcessManager());
      case 'api':
        return new ApiConnectorStrategy(new ResilientHttpClient());
      case 'cookie':
        return new CookieConnectorStrategy(new DatabaseCookieVault());
      default:
        throw new UnsupportedStrategyException(`Strategy ${mode} unsupported`);
    }
  }
}
```

- **Mock Strategy Behavior**: Deterministically computes token counts, mimics realistic synthetic latency ($50\text{ms} - 150\text{ms}$), produces reproducible markdown AST structures, and requires zero network access or active API keys.
- **Production Strategy Behavior**: Spawns authentic CLI processes (e.g. `@google/gemini-cli`, `ollama run llama3.2`) or dispatches TLS 1.3 HTTP/2 requests with authentic bearer authentication.

#### 2.2.3 Timeout Management & Protocol Client Implementations

To handle models that take significant time without hitting gateway connection dropouts:
1. **Interactive Client**: Uses standard HTTP/2 client with configurable socket timeouts (default 30,000ms).
2. **Streaming Client**: Uses SSE (`text/event-stream`) keeping the transport active by transmitting chunked frames or periodic heartbeat comments (`: ping\n\n`) every 5,000ms.
3. **Asynchronous Task Client**: Dispatches tasks to RabbitMQ / Kafka, returning an immediate acknowledgment with a tracking `JOB_ID`.

---

### 2.3 `model-connector-service` Gateway & Vault Layer

#### 2.3.1 Ingress Middleware Pipeline & Execution Chain

All HTTP requests pass sequentially through 7 hardened middleware layers:

```mermaid
flowchart LR
    REQ["Incoming Request"] --> M1["1. Helmet<br/>Security Headers"]
    M1 --> M2["2. PII Guard<br/>URL & Param Redaction"]
    M2 --> M3["3. Sanitizer<br/>XSS & Injection Filter"]
    M3 --> M4["4. W3C Tracing<br/>traceparent & spanId"]
    M4 --> M5["5. Auth Guard<br/>OAuth2/JWT/Key/None"]
    M5 --> M6["6. Rate Limiter<br/>Token Bucket Quota"]
    M6 --> CTRL["Route Controller<br/>Domain Execution"]
    CTRL --> M7["7. Error Boundary<br/>RFC-7807 Sanitizer"]
```

#### 2.3.2 Prompt, Instruction, and Skill Markdown Vault Service

The platform strictly manages markdown documents as text content in relational and document stores, avoiding filesystem binary dependencies:

```typescript
export interface IPromptVaultService {
  getSystemPrompt(appId: string, featureId: string): Promise<SystemPromptEntity>;
  getUserSpecificPrompt(userId: string, appId: string, featureId: string): Promise<UserPromptEntity>;
  getInstructionMarkdown(appId: string, instructionKey: string): Promise<string>;
  saveVerifiedPrompt(record: VerifiedPromptRecord): Promise<void>;
}
```

- **Markdown Storage**: Prompts and skills are stored with UTF-8 character encoding in `SYSTEM_PROMPTS.PROMPT_CONTENT_TEXT` and `INSTRUCTION_FILES.FILE_CONTENT_MD`.
- **Version Control**: Includes optimistic lock versioning (`VERSION_NUMBER`) to prevent concurrent overwrite anomalies.

#### 2.3.3 Multi-Tenant Isolated Repository Queries

Queries enforce tenant filtering at the SQL layer. Under no circumstances may a query omit `USER_ID` or `APPLICATION_ID`:

```sql
-- Pattern for fetching feature-specific prompts:
SELECT SP.PROMPT_ID, SP.PROMPT_NAME, SP.PROMPT_CONTENT_TEXT, UP.USER_CUSTOM_PROMPT_TEXT
FROM SYSTEM_PROMPTS SP
LEFT JOIN USER_PROMPTS UP 
  ON SP.PROMPT_ID = UP.PROMPT_ID 
  AND UP.USER_ID = :userId
WHERE SP.APPLICATION_ID = :appId
  AND SP.FEATURE_ID = :featureId
  AND SP.IS_ACTIVE = TRUE;
```

---

### 2.4 `playwright-mcp-engine` Execution Mechanics

#### 2.4.1 Concurrency Browser Context Pool

`BrowserPool.ts` maintains a regulated pool of Chromium/WebKit worker slots:
- **Warm Slots**: Pre-launches headless browser instances.
- **Context Isolation**: Each incoming automation task obtains an ephemeral `BrowserContext` with a clean cookie jar and empty cache.
- **Context Destruction**: Upon completion, the context is closed and garbage collected. If a worker slot exceeds 100 executions, the underlying browser process is recycled to reclaim V8 memory.

#### 2.4.2 Dynamic Template Resolver & Fallback Cascades

The resolver parses workflow JSON templates and resolves dynamic placeholders without hardcoded values:

```typescript
export class DynamicResolver {
  public static resolve(template: string, context: WorkflowExecutionContext): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, expr) => {
      const trimmed = expr.trim();
      if (trimmed.startsWith('vars.')) return context.variables[trimmed.slice(5)] ?? '';
      if (trimmed.startsWith('env.')) return process.env[trimmed.slice(4)] ?? '';
      if (trimmed === 'now()') return new Date().toISOString();
      if (trimmed === 'randomId()') return crypto.randomUUID();
      return match;
    });
  }

  public static async findElementWithCascade(page: Page, selectors: string[]): Promise<ElementHandle> {
    for (const selector of selectors) {
      try {
        const el = await page.waitForSelector(selector, { timeout: 2000 });
        if (el) return el;
      } catch {
        // Fallback to next selector in prioritized cascade
      }
    }
    throw new SelectorNotFoundException(`All fallback selectors exhausted: ${selectors.join(', ')}`);
  }
}
```

#### 2.4.3 Watchdog Stuck-Process Tree Killer Algorithm

```mermaid
flowchart TD
    START["Step Execution Begins"] --> TIMER["Start Watchdog Timer (Deadline: 15,000ms)"]
    TIMER --> CHECK{"Step Completed within Deadline?"}
    CHECK -->|"Yes"| CANCEL["Cancel Watchdog & Return Step Result"]
    CHECK -->|"No"| HUNG["Step HUNG Detected"]
    HUNG --> PID["Extract Child Process PID (Browser / Node)"]
    PID --> OS_CHECK{"Host Operating System?"}
    OS_CHECK -->|"Windows"| WIN_KILL["Execute: taskkill /F /T /PID {pid}"]
    OS_CHECK -->|"POSIX / Linux"| POSIX_KILL["Execute: kill -9 -{pgrp} (SIGKILL Process Tree)"]
    WIN_KILL & POSIX_KILL --> PURGE["Evict Damaged Worker Slot from Pool"]
    PURGE --> SPAWN["Spawn Fresh Browser Worker Instance"]
    SPAWN --> TELEM["Return Execution Result with status: 'STUCK_PROCESS_KILLED'"]
```

#### 2.4.4 Deep Network Sniffer & Auth Classifier

Hooks into Playwright `page.on('request')` and `page.on('response')`:
- Extracts request headers, query strings, and payloads.
- Analyzes auth tokens:
  - If header contains `Authorization: Bearer ey...`, classifies as `AUTH_TYPE: JWT_BEARER`.
  - If URL matches `/oauth/token` or `/authorize`, classifies as `OAUTH_ENDPOINT`.
  - If status is `401` or `403`, tags the endpoint as `REQUIRES_AUTHENTICATION`.
- Aggregates endpoints into `DiscoveredEndpointCatalog`.

---

## 3. Complete Enterprise Database Architecture (Polyglot Persistence)

### 3.1 Relational Schema Invariants & Design Principles

All schemas conform to the platform invariants:
1. **Strictly UPPER CASE Identifiers**: All table names, column names, constraints, and indexes must be strictly UPPER CASE.
2. **Meaningful Primary & Foreign Keys**: Zero generic `id` columns. Keys are named explicitly: `APPLICATION_ID`, `USER_ID`, `MODEL_ID`, `SESSION_ID`, `PROMPT_ID`, `INSTRUCTION_ID`, `WORKFLOW_ID`, `AST_SCORE_ID`, `AUDIT_LOG_ID`.
3. **Multi-Dialect Conformance**: Compatible with PostgreSQL, MySQL 8, Oracle Database, SQL Server, and SQLite.
4. **Referential Integrity**: Cascading foreign keys on tenant and session deletion.

### 3.2 Production RDBMS DDL Specification (All 15 Tables)

```sql
-- ==============================================================================
-- MODEL CONNECTOR PLATFORM ENTERPRISE DDL SCHEMA (PRODUCTION RELEASE)
-- Invariant: Strictly UPPER CASE Table and Column Identifiers
-- Invariant: Meaningful Column Keys (Zero Generic ID columns)
-- ==============================================================================

-- 1. Registered Client Applications Table
CREATE TABLE IF NOT EXISTS APPLICATIONS (
    APPLICATION_ID VARCHAR(64) PRIMARY KEY,
    APPLICATION_CODE VARCHAR(32) NOT NULL UNIQUE,
    APPLICATION_NAME VARCHAR(128) NOT NULL,
    DEPLOYMENT_TYPE VARCHAR(32) NOT NULL DEFAULT 'REMOTE', -- 'LOCAL', 'REMOTE', 'AIR_GAPPED'
    HOST_DOMAIN_URL VARCHAR(255),
    IS_ACTIVE BOOLEAN NOT NULL DEFAULT TRUE,
    CREATED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UPDATED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Enterprise Users Table
CREATE TABLE IF NOT EXISTS USERS (
    USER_ID VARCHAR(64) PRIMARY KEY,
    USER_EMAIL VARCHAR(255) NOT NULL UNIQUE,
    PASSWORD_HASH VARCHAR(255),
    FULL_NAME VARCHAR(128) NOT NULL,
    USER_ROLE VARCHAR(32) NOT NULL DEFAULT 'USER', -- 'USER', 'ADMIN', 'SERVICE_ACCOUNT'
    DEFAULT_AUTH_PROVIDER VARCHAR(32) NOT NULL DEFAULT 'LOCAL', -- 'GOOGLE_OAUTH', 'LOCAL', 'API_KEY'
    IS_ACTIVE BOOLEAN NOT NULL DEFAULT TRUE,
    CREATED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UPDATED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. User to Application Authorization & Feature Scopes
CREATE TABLE IF NOT EXISTS USER_APP_PERMISSIONS (
    PERMISSION_ID VARCHAR(64) PRIMARY KEY,
    USER_ID VARCHAR(64) NOT NULL,
    APPLICATION_ID VARCHAR(64) NOT NULL,
    FEATURE_SCOPE VARCHAR(64) NOT NULL, -- e.g. 'RESUME_AST', 'COMFYUI_STORY', 'APPS_BUILDER'
    IS_GRANTED BOOLEAN NOT NULL DEFAULT TRUE,
    GRANTED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT FK_PERM_USER FOREIGN KEY (USER_ID) REFERENCES USERS(USER_ID) ON DELETE CASCADE,
    CONSTRAINT FK_PERM_APP FOREIGN KEY (APPLICATION_ID) REFERENCES APPLICATIONS(APPLICATION_ID) ON DELETE CASCADE
);

-- 4. AI Models Catalog Table
CREATE TABLE IF NOT EXISTS MODELS (
    MODEL_ID VARCHAR(64) PRIMARY KEY,
    MODEL_NAME VARCHAR(128) NOT NULL,
    MODEL_FAMILY VARCHAR(32) NOT NULL, -- 'gemini', 'chatgpt', 'claude', 'grok', 'copilot', 'ollama'
    PROVIDER_NAME VARCHAR(64) NOT NULL, -- 'google', 'openai', 'anthropic', 'xai', 'microsoft', 'ollama'
    CONTEXT_WINDOW_SIZE INTEGER NOT NULL DEFAULT 128000,
    SUPPORTED_STRATEGIES VARCHAR(128) NOT NULL, -- 'api,cli,cookie'
    LIFECYCLE_STATUS VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'DEPRECATED', 'OFFLINE'
    DESCRIPTION_TEXT TEXT,
    CREATED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UPDATED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. System Base Prompts Catalog
CREATE TABLE IF NOT EXISTS SYSTEM_PROMPTS (
    PROMPT_ID VARCHAR(64) PRIMARY KEY,
    APPLICATION_ID VARCHAR(64) NOT NULL,
    FEATURE_ID VARCHAR(64) NOT NULL,
    PROMPT_NAME VARCHAR(128) NOT NULL,
    PROMPT_CONTENT_TEXT TEXT NOT NULL,
    VERSION_NUMBER INTEGER NOT NULL DEFAULT 1,
    IS_ACTIVE BOOLEAN NOT NULL DEFAULT TRUE,
    CREATED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UPDATED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT FK_SYS_PROMPT_APP FOREIGN KEY (APPLICATION_ID) REFERENCES APPLICATIONS(APPLICATION_ID) ON DELETE CASCADE
);

-- 6. Instruction and Skill Markdown Files Store
CREATE TABLE IF NOT EXISTS INSTRUCTION_FILES (
    INSTRUCTION_ID VARCHAR(64) PRIMARY KEY,
    APPLICATION_ID VARCHAR(64) NOT NULL,
    INSTRUCTION_KEY VARCHAR(64) NOT NULL, -- e.g. 'JOB_PORTAL_AST_GUIDE', 'COMFYUI_STORY_RULES'
    FILE_NAME VARCHAR(128) NOT NULL,
    FILE_CONTENT_MD TEXT NOT NULL,
    CATEGORY_TAG VARCHAR(64) NOT NULL, -- 'SKILL', 'INSTRUCTION', 'BEST_PRACTICE'
    VERSION_NUMBER INTEGER NOT NULL DEFAULT 1,
    CREATED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UPDATED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT FK_INST_APP FOREIGN KEY (APPLICATION_ID) REFERENCES APPLICATIONS(APPLICATION_ID) ON DELETE CASCADE
);

-- 7. User-Specific Prompts & Custom Preferences
CREATE TABLE IF NOT EXISTS USER_PROMPTS (
    USER_PROMPT_ID VARCHAR(64) PRIMARY KEY,
    USER_ID VARCHAR(64) NOT NULL,
    APPLICATION_ID VARCHAR(64) NOT NULL,
    FEATURE_ID VARCHAR(64) NOT NULL,
    PROMPT_ID VARCHAR(64),
    USER_CUSTOM_PROMPT_TEXT TEXT NOT NULL,
    IS_VERIFIED_BY_USER BOOLEAN NOT NULL DEFAULT FALSE,
    LAST_USED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CREATED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT FK_UPROMPT_USER FOREIGN KEY (USER_ID) REFERENCES USERS(USER_ID) ON DELETE CASCADE,
    CONSTRAINT FK_UPROMPT_APP FOREIGN KEY (APPLICATION_ID) REFERENCES APPLICATIONS(APPLICATION_ID) ON DELETE CASCADE,
    CONSTRAINT FK_UPROMPT_SYS FOREIGN KEY (PROMPT_ID) REFERENCES SYSTEM_PROMPTS(PROMPT_ID) ON DELETE SET NULL
);

-- 8. Multi-Turn Conversation Sessions Table
CREATE TABLE IF NOT EXISTS SESSIONS (
    SESSION_ID VARCHAR(64) PRIMARY KEY,
    USER_ID VARCHAR(64) NOT NULL,
    APPLICATION_ID VARCHAR(64) NOT NULL,
    ACTIVE_MODEL_ID VARCHAR(64) NOT NULL,
    STRATEGY_MODE VARCHAR(32) NOT NULL DEFAULT 'api',
    SESSION_TITLE VARCHAR(255) NOT NULL,
    TURN_COUNT INTEGER NOT NULL DEFAULT 0,
    SESSION_METADATA_JSON TEXT,
    CREATED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UPDATED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT FK_SESS_USER FOREIGN KEY (USER_ID) REFERENCES USERS(USER_ID) ON DELETE CASCADE,
    CONSTRAINT FK_SESS_APP FOREIGN KEY (APPLICATION_ID) REFERENCES APPLICATIONS(APPLICATION_ID) ON DELETE CASCADE,
    CONSTRAINT FK_SESS_MODEL FOREIGN KEY (ACTIVE_MODEL_ID) REFERENCES MODELS(MODEL_ID) ON DELETE CASCADE
);

-- 9. Conversation Messages Table
CREATE TABLE IF NOT EXISTS MESSAGES (
    MESSAGE_ID VARCHAR(64) PRIMARY KEY,
    SESSION_ID VARCHAR(64) NOT NULL,
    MESSAGE_ROLE VARCHAR(32) NOT NULL, -- 'user', 'assistant', 'system', 'tool'
    MESSAGE_CONTENT TEXT NOT NULL,
    STRATEGY_MODE VARCHAR(32) NOT NULL,
    TOKEN_COUNT INTEGER NOT NULL DEFAULT 0,
    LATENCY_MS INTEGER NOT NULL DEFAULT 0,
    CREATED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT FK_MSG_SESSION FOREIGN KEY (SESSION_ID) REFERENCES SESSIONS(SESSION_ID) ON DELETE CASCADE
);

-- 10. Context Attachment Items Table
CREATE TABLE IF NOT EXISTS CONTEXT_ITEMS (
    CONTEXT_ID VARCHAR(64) PRIMARY KEY,
    SESSION_ID VARCHAR(64) NOT NULL,
    CONTEXT_TYPE VARCHAR(32) NOT NULL, -- 'FILE', 'MD', 'WEB_DOM', 'AST'
    CONTEXT_NAME VARCHAR(128) NOT NULL,
    CONTEXT_CONTENT TEXT NOT NULL,
    TOKEN_COUNT INTEGER NOT NULL DEFAULT 0,
    CREATED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT FK_CTX_SESSION FOREIGN KEY (SESSION_ID) REFERENCES SESSIONS(SESSION_ID) ON DELETE CASCADE
);

-- 11. Workflow Templates Table (Bisect Part A)
CREATE TABLE IF NOT EXISTS WORKFLOW_TEMPLATES (
    WORKFLOW_ID VARCHAR(64) PRIMARY KEY,
    APPLICATION_ID VARCHAR(64) NOT NULL,
    WORKFLOW_CODE VARCHAR(64) NOT NULL UNIQUE, -- e.g. 'WORKDAY_FORM_FILL', 'COMFYUI_STORY_DAG'
    WORKFLOW_NAME VARCHAR(128) NOT NULL,
    WORKFLOW_JSON_SPEC TEXT NOT NULL,
    TARGET_SYSTEM_NAME VARCHAR(64) NOT NULL,
    VERSION_NUMBER INTEGER NOT NULL DEFAULT 1,
    CREATED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT FK_WF_APP FOREIGN KEY (APPLICATION_ID) REFERENCES APPLICATIONS(APPLICATION_ID) ON DELETE CASCADE
);

-- 12. Resume AST Evaluation Records Table (Job Portal Specific)
CREATE TABLE IF NOT EXISTS RESUME_AST_RECORDS (
    AST_SCORE_ID VARCHAR(64) PRIMARY KEY,
    USER_ID VARCHAR(64) NOT NULL,
    ORIGINAL_RESUME_TEXT TEXT NOT NULL,
    PARSED_AST_JSON TEXT NOT NULL,
    TARGET_JOB_DESCRIPTION_TEXT TEXT,
    COMPATIBILITY_SCORE_PERCENT NUMERIC(5,2) NOT NULL,
    PERMITTED_MUTATIONS_JSON TEXT, -- e.g. {"allowCloudSwap": ["AWS", "GCP"]}
    MUTATED_RESUME_TEXT TEXT,
    EVALUATION_REPORT_MD TEXT NOT NULL,
    CREATED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT FK_AST_USER FOREIGN KEY (USER_ID) REFERENCES USERS(USER_ID) ON DELETE CASCADE
);

-- 13. Candidate Outreach Follow-Up Schedules Table (Job Portal Specific)
CREATE TABLE IF NOT EXISTS FOLLOW_UP_SCHEDULES (
    SCHEDULE_ID VARCHAR(64) PRIMARY KEY,
    USER_ID VARCHAR(64) NOT NULL,
    TARGET_PORTAL_NAME VARCHAR(64) NOT NULL, -- 'LINKEDIN', 'EMAIL', 'CAREER_PORTAL'
    RECIPIENT_CONTACT_REF VARCHAR(128) NOT NULL,
    OUTREACH_MESSAGE_TEXT TEXT NOT NULL,
    INTERVAL_DAYS INTEGER NOT NULL, -- e.g. 3, 5
    SCHEDULED_DISPATCH_TIME TIMESTAMP NOT NULL,
    EXECUTION_STATUS VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'SENT', 'CANCELLED', 'REPLIED'
    CREATED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT FK_SCHED_USER FOREIGN KEY (USER_ID) REFERENCES USERS(USER_ID) ON DELETE CASCADE
);

-- 14. Enterprise Audit Logs Table (Zero PII Governance & Distributed Tracing)
CREATE TABLE IF NOT EXISTS AUDIT_LOGS (
    AUDIT_LOG_ID VARCHAR(64) PRIMARY KEY,
    CORRELATION_ID VARCHAR(64) NOT NULL,
    TRACE_ID VARCHAR(64),
    SPAN_ID VARCHAR(32),
    USER_ID VARCHAR(64),
    APPLICATION_ID VARCHAR(64),
    MODEL_ID VARCHAR(64) NOT NULL,
    ACTION_NAME VARCHAR(64) NOT NULL,
    STRATEGY_MODE VARCHAR(32) NOT NULL,
    LATENCY_MS INTEGER NOT NULL,
    EXECUTION_STATUS VARCHAR(32) NOT NULL,
    CLIENT_IP VARCHAR(64),
    ERROR_MESSAGE TEXT,
    CREATED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 15. Model Provider Credentials Vault (Salted Hashes Only)
CREATE TABLE IF NOT EXISTS MODEL_CREDENTIALS (
    CREDENTIAL_ID VARCHAR(64) PRIMARY KEY,
    MODEL_FAMILY VARCHAR(32) NOT NULL,
    KEY_NAME VARCHAR(128) NOT NULL,
    KEY_HASH VARCHAR(128) NOT NULL,
    SALT VARCHAR(64) NOT NULL,
    IS_ACTIVE BOOLEAN NOT NULL DEFAULT TRUE,
    CREATED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

<a id="33-high-performance-relational-indexing-strategy"></a>
### 3.3 High-Performance Enterprise Relational & Polyglot Indexing Strategy

#### 3.3.1 Problem Statement & Architectural Constraints
- **Problem Statement**: At enterprise scale (tens of millions of conversational messages, multi-gigabyte AST syntax trees, and millions of audit records per day), unindexed or sub-optimally indexed queries degrade database throughput, lock table buffers, cause full sequential table scans, and violate the platform's $\le 20\text{ ms}$ P99 API response SLA.
- **Constraints**:
  - Multi-tenant data segregation must be strictly maintained in all query execution plans (`APPLICATION_ID` and `USER_ID` scoping).
  - Write amplification overhead on high-frequency write tables (`AUDIT_LOGS`, `MESSAGES`) must not exceed 15% CPU overhead.
  - JSONB query operations into deep AST structures (`PARSED_AST_JSON`, `PERMITTED_MUTATIONS_JSON`) must evaluate in sub-millisecond time.
  - Disk storage footprint of secondary indexes must remain $< 30\%$ of total table heap size.

#### 3.3.2 Indexing Technology Trade-offs & Selection Matrix
| Index Strategy | Primary Use Case | Read Latency | Write / Disk Penalty | Decision |
| :--- | :--- | :--- | :--- | :--- |
| **Standard Single-Column B-Tree** | Simple equality lookups on Primary / Unique Keys. | Moderate (Requires heap pointer chase for multi-column queries). | Low | **Baseline Only** |
| **Compound Multi-Tenant B-Tree (ESR Rule)** | Composite filtering: Equality (`TENANT_ID`, `USER_ID`) $\rightarrow$ Sort (`CREATED_TIMESTAMP DESC`). | Ultra-Fast ($< 2\text{ ms}$; zero in-memory sort). | Moderate | **SELECTED (MANDATORY)** |
| **Covering Index (`INCLUDE` Clause)** | Queries retrieving 2-4 columns alongside lookup keys. | Optimal (Zero heap fetch; Index-Only Scan). | Low | **SELECTED (HOT PATHS)** |
| **Filtered Partial Index (`WHERE` Clause)** | Skewed data sets (e.g. `IS_ACTIVE = TRUE`, `STATUS = 'PENDING'`). | Instantaneous (Index size reduced by 70-90%). | Negligible | **SELECTED (QUEUES / ACTIVE)** |
| **GIN (Generalized Inverted Index)** | Nested JSONB keys, tags array, and full-text search. | Sub-millisecond JSON path evaluation. | High write penalty (Mitigated via fastupdate). | **SELECTED (AST & JSONB)** |
| **BRIN (Block Range Index)** | High-volume append-only timeseries tables (`AUDIT_LOGS`). | Fast range scans ($< 5\text{ ms}$ across 50M rows). | Near-Zero ($< 1\%$ size of B-Tree; zero write penalty). | **SELECTED (AUDIT LOGS)** |

#### 3.3.3 Production DDL Indexing Suite (PostgreSQL / Relational)

```sql
-- ==============================================================================
-- MODEL CONNECTOR PLATFORM HIGH-PERFORMANCE INDEX SUITE
-- Rules: ESR (Equality, Sort, Range) | Covering (INCLUDE) | Partial (Filtered)
-- ==============================================================================

-- 1. APPLICATIONS Table
-- Optimizes active tenant validation and code resolution
CREATE UNIQUE INDEX IF NOT EXISTS IDX_APP_CODE_UPPER ON APPLICATIONS (UPPER(APPLICATION_CODE));
CREATE INDEX IF NOT EXISTS IDX_APP_ACTIVE_LOOKUP ON APPLICATIONS (APPLICATION_ID) WHERE IS_ACTIVE = TRUE;

-- 2. USERS Table
-- Covering index for authentication lookups: avoids heap read on password check
CREATE UNIQUE INDEX IF NOT EXISTS IDX_USERS_EMAIL_LOWER ON USERS (LOWER(USER_EMAIL));
CREATE INDEX IF NOT EXISTS IDX_USERS_AUTH_COVERING ON USERS (USER_EMAIL) 
    INCLUDE (USER_ID, PASSWORD_HASH, USER_ROLE, DEFAULT_AUTH_PROVIDER, IS_ACTIVE);

-- 3. USER_APP_PERMISSIONS Table
-- Covering compound index for sub-millisecond authorization middleware verification
CREATE INDEX IF NOT EXISTS IDX_USER_PERM_CHECK_COVERING ON USER_APP_PERMISSIONS (USER_ID, APPLICATION_ID, FEATURE_SCOPE) 
    INCLUDE (IS_GRANTED);

-- 4. MODELS Catalog Table
-- Partial index for active routable models by provider & family
CREATE INDEX IF NOT EXISTS IDX_MODELS_ROUTING ON MODELS (MODEL_FAMILY, PROVIDER_NAME) 
    WHERE LIFECYCLE_STATUS = 'ACTIVE';

-- 5. SYSTEM_PROMPTS Catalog
-- Scoped active prompt lookup by application and feature
CREATE INDEX IF NOT EXISTS IDX_SYS_PROMPT_RESOLVE ON SYSTEM_PROMPTS (APPLICATION_ID, FEATURE_ID, VERSION_NUMBER DESC) 
    WHERE IS_ACTIVE = TRUE;

-- 6. INSTRUCTION_FILES Store
CREATE UNIQUE INDEX IF NOT EXISTS IDX_INST_KEY_VERSION ON INSTRUCTION_FILES (APPLICATION_ID, INSTRUCTION_KEY, VERSION_NUMBER DESC);

-- 7. USER_PROMPTS Table
-- Scoped user custom prompt lookup with verified flag
CREATE INDEX IF NOT EXISTS IDX_USER_PROMPT_LOOKUP ON USER_PROMPTS (USER_ID, APPLICATION_ID, FEATURE_ID, LAST_USED_TIMESTAMP DESC);

-- 8. SESSIONS Table (Hot Transaction Path)
-- Compound multi-tenant sorting index: completely eliminates in-memory quicksort
CREATE INDEX IF NOT EXISTS IDX_SESSIONS_USER_APP_SORT ON SESSIONS (USER_ID, APPLICATION_ID, UPDATED_TIMESTAMP DESC) 
    INCLUDE (ACTIVE_MODEL_ID, STRATEGY_MODE, TURN_COUNT);

-- 9. MESSAGES Table (Very High Volume)
-- Sequential conversation fetch ordered chronologically
CREATE INDEX IF NOT EXISTS IDX_MESSAGES_SESSION_CHRONO ON MESSAGES (SESSION_ID, CREATED_TIMESTAMP ASC) 
    INCLUDE (MESSAGE_ROLE, TOKEN_COUNT, LATENCY_MS);

-- 10. CONTEXT_ITEMS Table
CREATE INDEX IF NOT EXISTS IDX_CTX_SESSION_LOOKUP ON CONTEXT_ITEMS (SESSION_ID, CONTEXT_TYPE);

-- 11. WORKFLOW_TEMPLATES Table
CREATE UNIQUE INDEX IF NOT EXISTS IDX_WF_CODE_ACTIVE ON WORKFLOW_TEMPLATES (APPLICATION_ID, WORKFLOW_CODE, VERSION_NUMBER DESC);

-- 12. RESUME_AST_RECORDS Table (Job Portal Hot Path)
-- Compound user chronological history
CREATE INDEX IF NOT EXISTS IDX_AST_USER_HISTORY ON RESUME_AST_RECORDS (USER_ID, CREATED_TIMESTAMP DESC) 
    INCLUDE (COMPATIBILITY_SCORE_PERCENT);

-- JSONB GIN Index on Parsed Resume AST: enables sub-millisecond jsonb path queries:
-- Example: WHERE PARSED_AST_JSON @> '{"skills": [{"name": "Kubernetes"}]}'
CREATE INDEX IF NOT EXISTS IDX_AST_JSONB_GIN ON RESUME_AST_RECORDS USING GIN (CAST(PARSED_AST_JSON AS JSONB));

-- 13. FOLLOW_UP_SCHEDULES Table (Queue Dispatcher Hot Path)
-- Partial filtered index: indexes ONLY pending records to accelerate cron poller by 99%
CREATE INDEX IF NOT EXISTS IDX_FOLLOWUP_DISPATCH_QUEUE ON FOLLOW_UP_SCHEDULES (SCHEDULED_DISPATCH_TIME ASC) 
    WHERE EXECUTION_STATUS = 'PENDING';

-- 14. AUDIT_LOGS Table (Massive Append-Only Timeseries)
-- Block Range Index (BRIN) on Timestamp: 98% smaller than B-Tree, sub-millisecond range scans
CREATE INDEX IF NOT EXISTS IDX_AUDIT_TIMESTAMP_BRIN ON AUDIT_LOGS USING BRIN (CREATED_TIMESTAMP);

-- B-Tree on correlation IDs for microservice distributed tracing lookup
CREATE INDEX IF NOT EXISTS IDX_AUDIT_CORRELATION ON AUDIT_LOGS (CORRELATION_ID);
CREATE INDEX IF NOT EXISTS IDX_AUDIT_TRACE_SPAN ON AUDIT_LOGS (TRACE_ID, SPAN_ID);
CREATE INDEX IF NOT EXISTS IDX_AUDIT_TENANT_ACTION ON AUDIT_LOGS (APPLICATION_ID, USER_ID, CREATED_TIMESTAMP DESC);

-- 15. MODEL_CREDENTIALS Vault
CREATE UNIQUE INDEX IF NOT EXISTS IDX_CREDENTIALS_LOOKUP ON MODEL_CREDENTIALS (MODEL_FAMILY, KEY_NAME) 
    WHERE IS_ACTIVE = TRUE;
```

#### 3.3.4 Query Profile & Performance Acceleration Benchmarks
| Query Pattern | Unindexed Query Scan | Optimized Index Type | Indexed Scan Type | Measured Speedup |
| :--- | :--- | :--- | :--- | :--- |
| **Auth Middleware Check** (`USER_APP_PERMISSIONS`) | Sequential Scan ($12.4\text{ ms}$) | Covering B-Tree (`INCLUDE`) | Index-Only Scan ($0.18\text{ ms}$) | **$68\times$ Faster** |
| **Recent Sessions Retrieval** (`SESSIONS`) | Seq Scan + Sort ($45.1\text{ ms}$) | Compound (`USER_ID, APP_ID, UPDATED DESC`) | Backward Index Scan ($0.42\text{ ms}$) | **$107\times$ Faster** |
| **Pending Follow-up Polling** (`FOLLOW_UP_SCHEDULES`) | Full Scan of 500k rows ($78.2\text{ ms}$) | Partial (`WHERE STATUS = 'PENDING'`) | Index Scan of 120 rows ($0.11\text{ ms}$) | **$710\times$ Faster** |
| **Resume Skill Discovery** (`RESUME_AST_RECORDS`) | Table Scan + JSON Deserialization ($180\text{ ms}$) | GIN Inverted Index (`@>`) | Bitmap Index Scan ($1.8\text{ ms}$) | **$100\times$ Faster** |
| **Audit Log Trace Lookup** (`AUDIT_LOGS`) | Scan of 10M rows ($4,200\text{ ms}$) | BRIN + Correlation B-Tree | Bitmap Heap Scan ($3.1\text{ ms}$) | **$1,350\times$ Faster** |

---

### 3.4 Enterprise NoSQL Document Architecture (MongoDB Collections & BSON Schemas)

While PostgreSQL/MySQL enforces strict transactional consistency for model registries, user permissions, and audit logs, **MongoDB (Port 27017)** provides horizontal scale for high-throughput, unbounded conversational documents, rich AST representations, and full-text markdown storage.

#### Collection 1: `CONVERSATION_SESSIONS`
Maintains document state for multi-turn sessions with embedded context attachments:

```json
{
  "_id": { "$oid": "664fa19b2c8e4a1b8c123456" },
  "sessionId": "SESS-78921-AF",
  "userId": "USR-9921-X9",
  "applicationId": "JOB_PORTAL",
  "featureScope": "RESUME_AST",
  "activeModelId": "gemini-3.8-flash",
  "strategyMode": "api",
  "turnCount": 14,
  "sessionMetadata": {
    "clientDevice": "DESKTOP",
    "targetJobTitle": "Staff Distributed Systems Engineer",
    "ipSubnetMasked": "192.0.2.0/24"
  },
  "contextAttachments": [
    {
      "contextId": "CTX-01",
      "contextType": "MD_RESUME",
      "contextName": "Current_Resume_v4.md",
      "tokenCount": 842,
      "uploadedAt": { "$date": "2026-10-20T19:00:00.000Z" }
    }
  ],
  "createdAt": { "$date": "2026-10-20T19:00:00.000Z" },
  "updatedAt": { "$date": "2026-10-20T20:15:30.000Z" }
}
```

- **Indexes**:
  - `db.CONVERSATION_SESSIONS.createIndex({ "userId": 1, "applicationId": 1, "updatedAt": -1 });`
  - `db.CONVERSATION_SESSIONS.createIndex({ "sessionId": 1 }, { unique: true });`

#### Collection 2: `CONVERSATION_MESSAGES`
High-speed write-heavy collection recording prompt and response turns with W3C tracing metadata:

```json
{
  "_id": { "$oid": "664fa23c2c8e4a1b8c123789" },
  "messageId": "MSG-99281-B1",
  "sessionId": "SESS-78921-AF",
  "userId": "USR-9921-X9",
  "applicationId": "JOB_PORTAL",
  "role": "assistant",
  "content": "## Resume Analysis & AST Verification Scorecard\n\n- **Overall Match**: 88%\n- **Strengths**: Distributed Consensus, High-Concurrency Go/TypeScript\n- **Identified Gaps**: GCP Cloud Spanner experience unlisted.",
  "strategyMode": "api",
  "tokenCount": 640,
  "latencyMs": 112,
  "w3cTrace": {
    "traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
    "spanId": "00f067aa0ba902b7"
  },
  "timestamp": { "$date": "2026-10-20T20:15:31.000Z" }
}
```

- **Indexes**:
  - `db.CONVERSATION_MESSAGES.createIndex({ "sessionId": 1, "timestamp": 1 });`
  - `db.CONVERSATION_MESSAGES.createIndex({ "w3cTrace.traceId": 1 });`

#### Collection 3: `PROMPT_MARKDOWN_VAULT`
Stores versioned system prompts, skill markdown files, and human-verified prompts:

```json
{
  "_id": { "$oid": "664fa30a2c8e4a1b8c123999" },
  "promptId": "PRM-JOB-AST-01",
  "applicationId": "JOB_PORTAL",
  "featureId": "RESUME_AST",
  "promptName": "Base AST ATS Scoring Guideline",
  "markdownContent": "You are a senior executive talent assessor and ATS parsing engine. Extract all candidate competencies into a deterministic Abstract Syntax Tree...",
  "version": 3,
  "category": "SYSTEM_INSTRUCTION",
  "tags": ["JOB_PORTAL", "AST", "ATS_SCORE", "REVISION_3"],
  "isVerified": true,
  "verificationMetadata": {
    "verifiedByUserId": "USR-ADMIN-01",
    "modelFamily": "gemini",
    "verifiedTimestamp": { "$date": "2026-10-19T10:00:00.000Z" }
  },
  "createdAt": { "$date": "2026-10-18T08:00:00.000Z" },
  "updatedAt": { "$date": "2026-10-19T10:00:00.000Z" }
}
```

- **Indexes**:
  - `db.PROMPT_MARKDOWN_VAULT.createIndex({ "applicationId": 1, "featureId": 1, "version": -1 });`
  - `db.PROMPT_MARKDOWN_VAULT.createIndex({ "tags": 1 });`

#### Collection 4: `WORKFLOW_DAG_DEFINITIONS`
Stores Bisect Part A automation workflows for `playwright-mcp-engine`:

```json
{
  "_id": { "$oid": "664fa4112c8e4a1b8c124111" },
  "workflowId": "WF-WORKDAY-APPLY-01",
  "workflowCode": "WORKDAY_CAREER_APPLY",
  "applicationId": "JOB_PORTAL",
  "targetSystem": "WORKDAY",
  "version": 2,
  "dagNodes": [
    {
      "stepId": "STEP_01",
      "action": "NAVIGATE",
      "targetUrl": "{{vars.jobApplicationUrl}}",
      "watchdogTimeoutMs": 10000
    },
    {
      "stepId": "STEP_02",
      "action": "SNIFF_AUTH",
      "extractTokens": ["Bearer", "connect.sid"]
    },
    {
      "stepId": "STEP_03",
      "action": "DOM_TO_MARKDOWN",
      "stripSelectors": ["nav", "footer", "script", "style"]
    },
    {
      "stepId": "STEP_04",
      "action": "FILL_FORM",
      "selectorCascade": [
        "input[data-automation-id='legalNameSection_firstName']",
        "#input-firstName",
        "input[aria-label='First Name']"
      ],
      "valueBinding": "{{vars.applicantFirstName}}",
      "watchdogTimeoutMs": 5000
    }
  ]
}
```

---

### 3.5 Redis In-Memory Key Structures & TTL Governance

Redis Sentinel (Port 6379) operates as the low-latency caching and concurrency guard tier:

| Redis Key Pattern | Data Structure | Purpose / Operations | TTL (Time-to-Live) |
| :--- | :--- | :--- | :--- |
| `mc:catalog:models` | **Hash** | Active models catalog, supported strategies, health status (`HSET`, `HGETALL`). | `300s` (5 minutes) |
| `mc:session:{tenantId}:{userId}:{sessionId}` | **Hash** | Active session turn count, leased model, and active cookie jar hash (`HSET`, `HINCRBY`). | `86400s` (24 hours) |
| `mc:ratelimit:{userId}:{appId}` | **Sorted Set** | Token bucket sliding-window rate limiting. Score = timestamp in ms (`ZADD`, `ZREMRANGEBYSCORE`). | `60s` (Sliding) |
| `mc:circuitbreaker:{modelFamily}` | **Hash** | Circuit breaker state (`state: CLOSED`, `failCount: 0`, `lastTripMs: 0`). | Persistent (Updated on state change) |
| `mc:stream:jobs:{tenantId}:{userId}` | **Redis Stream** | High-throughput asynchronous task event streaming (`XADD`, `XREADGROUP`). | `3600s` (1 hour capped ring buffer) |
| `mc:cache:prompt:{appId}:{featureId}` | **String** | Compiled base system prompt text (`GET`, `SETEX`). | `3600s` (1 hour) |

---

## 4. Endpoint User Flows & Detailed Sequence Diagrams

### 4.1 Flow 1: Resume AST Verification & Scorecard Evaluation

**Endpoint**: `POST /api/v1/jobportal/resume/ast-score`

```mermaid
sequenceDiagram
    autonumber
    actor Candidate as Job Candidate
    participant UI as Job Portal UI
    participant GW as model-connector-service Gateway
    participant P_VAULT as Prompt & Instruction Vault
    participant AST_SVC as Resume AST Verification Service
    participant ADAPT as UnifiedModelExecutionAdapter
    participant DB as Polyglot Persistence (RDBMS)

    Candidate->>UI: Upload Resume (PDF) + Paste Job Description
    UI->>UI: Extract text AST structure from PDF
    UI->>GW: POST /api/v1/jobportal/resume/ast-score (with W3C traceparent & JWT)
    GW->>GW: Validate JWT, Check PII guard, Inject spanId
    GW->>P_VAULT: Fetch Base AST System Prompt & Guidelines (APP: JOB_PORTAL, FEAT: RESUME_AST)
    P_VAULT-->>GW: Return Base Prompt & Scoring Weights Markdown
    GW->>AST_SVC: evaluate(resumeAstJson, jobDescriptionText, basePrompt)
    AST_SVC->>ADAPT: execute(modelId: 'gemini-3.8-flash', prompt: synthesizedEvaluationPrompt)
    ADAPT-->>AST_SVC: Model Evaluation (Score: 84%, Missing Skills: ["GCP", "Kubernetes"])
    AST_SVC->>DB: INSERT INTO RESUME_AST_RECORDS (AST_SCORE_ID, USER_ID, COMPATIBILITY_SCORE_PERCENT, ...)
    AST_SVC-->>GW: Return Scorecard DTO
    GW-->>UI: 200 OK + JSON Scorecard (Score, Breakdown, Recommendations)
    UI-->>Candidate: Render Visual AST Scorecard & Skill Match Analysis
```

### 4.2 Flow 2: Controlled Resume Content Mutation (e.g. AWS to GCP)

**Endpoint**: `POST /api/v1/jobportal/resume/mutate`

```mermaid
sequenceDiagram
    autonumber
    actor Candidate as Job Candidate
    participant UI as Job Portal UI
    participant GW as model-connector-service Gateway
    participant P_VAULT as Prompt & Instruction Vault
    participant ADAPT as UnifiedModelExecutionAdapter
    participant DB as Relational Store

    Candidate->>UI: Permit Cloud Skill Swap (Rule: "Allow AWS to GCP Cloud")
    UI->>GW: POST /api/v1/jobportal/resume/mutate { resumeId, mutations: [{ from: "AWS", to: "GCP" }] }
    GW->>P_VAULT: Fetch Mutation Guidelines (Guarantees no fabrication of unheld titles)
    P_VAULT-->>GW: Strict Transformation Prompt Specification
    GW->>ADAPT: executePrompt(modelId: 'gemini-3.8-flash', prompt: mutationInstruction)
    ADAPT-->>GW: Tailored Resume Content (AWS references transposed to GCP with valid architectural equivalents)
    GW->>DB: UPDATE RESUME_AST_RECORDS SET MUTATED_RESUME_TEXT = :text
    GW-->>UI: 200 OK + Diff Preview (Candidate audits before approving)
    UI-->>Candidate: Display Side-by-Side Diff for Informed Approval
```

### 4.3 Flow 3: Web-to-Markdown & Career Portal Autofill via Playwright MCP

**Endpoint**: `POST /api/v1/jobportal/career-portal/autofill`

```mermaid
sequenceDiagram
    autonumber
    actor Candidate as Job Candidate
    participant UI as Job Portal UI
    participant GW as model-connector-service Gateway
    participant MCP as Playwright MCP Engine
    participant POOL as Browser Context Worker
    participant TARGET as External Career Portal (Workday)

    Candidate->>UI: Submit Target Job URL ("https://jobs.company.com/apply/123")
    UI->>GW: POST /api/v1/jobportal/career-portal/autofill
    GW->>MCP: POST /execute_workflow (Bisect Mode: Workflow JSON + User Profile Param Bag)
    MCP->>POOL: Lease Worker Slot & Isolate Context
    POOL->>TARGET: Navigate to Target Application Form
    TARGET-->>POOL: Rendered Web Form HTML
    POOL->>POOL: Convert DOM to Semantic Markdown AST Structure
    POOL->>GW: POST /api/v1/chat (Prompt: Map Candidate Profile to Form Markdown Inputs)
    GW-->>POOL: Field Mapping Directive (JSON mapping selectors to values)
    POOL->>TARGET: Fill Inputs, Select Dropdowns, Upload Tailored Resume PDF
    TARGET-->>POOL: Form Fill Confirmation Page
    POOL-->>MCP: Execution Telemetry (Selectors hit, screenshot buffer)
    MCP-->>GW: Complete Telemetry Envelope
    GW-->>UI: 200 OK + Application Snapshot & Status Confirmation
    UI-->>Candidate: Display Success Screen with Form Audit Log
```

### 4.4 Flow 4: ComfyUI Storyteller Prompt & Workflow Generation

**Endpoint**: `POST /api/v1/comfyui/story/generate-scene`

```mermaid
sequenceDiagram
    autonumber
    actor Creator as Storyteller / Creator
    participant UI as ComfyUI Story UI
    participant GW as model-connector-service Gateway
    participant P_VAULT as Prompt Vault (DAG Store)
    participant COMFY as Local ComfyUI Runner (Port 8188)
    participant DB as Polyglot Persistence

    Creator->>UI: Narrate Story Beat ("Scene 3: Cyberpunk detective enters rain-slicked alley")
    UI->>GW: POST /api/v1/comfyui/story/generate-scene { storyId, sceneNarrative }
    GW->>P_VAULT: Fetch Base Creative Prompt & ComfyUI Workflow JSON DAG
    P_VAULT-->>GW: Return Workflow Spec + LoRA Checkpoints
    GW->>COMFY: POST /prompt (Inject Positive/Negative Prompt into Workflow DAG)
    COMFY-->>GW: Prompt Enqueued (Prompt ID: 'CF-9921')
    GW->>COMFY: Open WebSocket ws://localhost:8188/ws?clientId=...
    COMFY-->>GW: Stream Node Progress & Rendered Asset Bytes (PNG / MP4)
    GW-->>UI: Forward Asset Binary Stream via SSE / WebSocket
    UI-->>Creator: Render Generated Scene Image / Video for Creator Review
    Creator->>UI: Click "Mark as High Quality / Verify Prompt"
    UI->>GW: POST /api/v1/comfyui/prompts/verify { promptId, seed, workflowHash }
    GW->>DB: INSERT INTO USER_PROMPTS (IS_VERIFIED_BY_USER = TRUE, ...)
    GW-->>UI: 200 OK (Prompt stamped as Verified Production Standard)
```

### 4.5 Flow 5: Apps Builder Skill MD Ingestion & Code Generation

**Endpoint**: `POST /api/v1/appsbuilder/generate`

```mermaid
sequenceDiagram
    autonumber
    actor Engineer as Software Engineer
    participant UI as Apps Builder Studio
    participant GW as model-connector-service Gateway
    participant P_VAULT as Skill MD & Rule Store
    participant ADAPT as UnifiedModelExecutionAdapter
    participant SANDBOX as Isolated Docker Runner

    Engineer->>UI: Request Project Scaffolding ("Create TypeScript microservice with Resilience4j")
    UI->>GW: POST /api/v1/appsbuilder/generate { targetLanguage: 'typescript', framework: 'express' }
    GW->>P_VAULT: Ingest `SKILL.md`, Coding Standards, and Architecture Rules
    P_VAULT-->>GW: Raw Markdown Rules (Zero relative imports, SLAP <= 20 lines)
    GW->>ADAPT: execute(modelId: 'claude-3-7-sonnet', prompt: synthesizedCodePrompt)
    ADAPT-->>GW: Multi-File Codebase Map (src/, package.json, tsconfig.json)
    GW->>SANDBOX: Dispatch Codebase to Isolated Docker Runner
    SANDBOX->>SANDBOX: Execute `npm run build` and `npm test`
    SANDBOX-->>GW: Build Succeeded (0 Errors, 100% Tests Passed)
    GW-->>UI: 200 OK + Ready-to-Execute Codebase Zip / Git Commit
    UI-->>Engineer: Deliver Verified Codebase
```

---

## 5. Authentication, Authorization & Security Configuration Matrix

### 5.1 Security Perimeters & Ingress Configuration

| Authentication Mode | Permitted Deployment Perimeter | Token / Credential Type | Verification Mechanism | Default Ingress Policy |
| :--- | :--- | :--- | :--- | :--- |
| **`GOOGLE_OAUTH`** | Remote Production & Web UI | Google OAuth2 ID Token / Bearer JWT | Google TokenInfo / RS256 Public Keys with discovery caching | Mandatory for Web Portals & Google Cloud integrations. |
| **`ENTERPRISE_JWT`** | Remote Distributed Microservices | Signed RS256 / Ed25519 Bearer Token | Public Key verification; validates `tenantId`, `userId`, `exp`, `scopes` | Standard for service-to-service communication. |
| **`API_KEY`** | Local CLI & CI/CD Pipelines | High-entropy 64-char key (`mc_live_...`) | Constant-time `crypto.timingSafeEqual` against salted SHA-256 DB hash | Throttled by Token Bucket Rate Limiter (100 RPS). |
| **`NONE` (Anonymous)** | Strictly Local Development | None (Assigned mock context) | Permitted exclusively when `NODE_ENV === 'development'` or loopback IP | Hard-blocked in production (`500 MisconfiguredSecurity`). |

### 5.2 Zero-PII Regex Redaction Implementation

```typescript
export class PiiUrlGuardMiddleware {
  private static readonly PII_PATTERNS: RegExp[] = [
    /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/, // Email address
    /(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})/, // Credit Cards
    /(?:bearer\s+)?[a-zA-Z0-9_\-\.]{30,}/i, // Raw API / Bearer Tokens
    /\b\d{3}-\d{2}-\d{4}\b/, // US SSN
  ];

  public static handle(req: Request, res: Response, next: NextFunction): void {
    const rawUrl = req.originalUrl || req.url;
    for (const pattern of PiiUrlGuardMiddleware.PII_PATTERNS) {
      if (pattern.test(rawUrl)) {
        throw new PiiSecurityException(
          'Security Violation: Sensitive PII detected in URL or query parameters. Use POST request body instead.'
        );
      }
    }
    next();
  }
}
```

---

## 6. Protocol & Concurrency Comparative Benchmarking

| Interaction Channel | Ingress Protocol | Peak Concurrency per Node | Network Overhead | Disconnection Handling | Primary Use Case in Platform |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Interactive REST** | HTTP/2 Multiplexed | 5,000 req/sec | Low ($<1$ KB per envelope) | Immediate socket termination | Model catalog, session metadata, AST quick scores |
| **Streaming Inference** | SSE (`text/event-stream`) | 10,000 active streams | Minimal (Pure payload chunks) | Automatic `Last-Event-ID` reconnection | Real-time token streaming across all 6 model families |
| **Interactive Canvas** | WebSockets (WSS) | 8,000 persistent sockets | Low (Framed binary/text) | Heartbeat ping/pong ($30\text{s}$ interval) | ComfyUI live rendering, browser screencasts |
| **Long-Running Jobs** | AMQP / Kafka Queue | 50,000 queued messages/sec | Negligible (Batch consumed) | Broker-managed offset persistence | Playwright career portal form auto-fill, video generation |
| **Internal Microservices**| gRPC over HTTP/2 | 15,000 RPC/sec | Ultra-low (Protobuf binary) | Channel subchannel connection backoff | Service-to-client internal dispatch, telemetry sinking |

---

## 7. Distributed Logging & Audit Telemetry Schema

Conforming to **`NFR-OBS-001`** and **`NFR-OBS-002`**, every audit event generates a schema-compliant record:

```typescript
export interface DistributedAuditRecord {
  auditLogId: string;           // UUIDv4
  correlationId: string;        // W3C Root Trace ID
  traceId: string;              // W3C Trace ID
  spanId: string;               // W3C Span ID
  userId?: string;              // Tenant User Identifier (or 'ANONYMOUS')
  applicationId?: string;       // Calling Application Code (e.g. 'JOB_PORTAL')
  featureId?: string;           // Scoped Feature Code (e.g. 'RESUME_AST')
  modelId: string;              // Target Model Identifier
  actionName: string;           // Domain Action (e.g. 'EXECUTE_PROMPT', 'AUTOFILL_FORM')
  strategyMode: 'api' | 'cli' | 'cookie';
  latencyMs: number;            // Monotonic Duration in Milliseconds
  executionStatus: 'SUCCESS' | 'FAILURE' | 'CIRCUIT_OPEN' | 'STUCK_PROCESS_KILLED';
  clientIp?: string;            // Masked Client IP Address (e.g. 192.0.2.0/24)
  errorMessage?: string;        // Sanitized Domain Error (No stack traces)
  createdTimestamp: string;     // ISO-8601 UTC
}
```

---

## 8. Enterprise Queue System Architecture & Zero-Leakage Multi-Tenant Isolation

### 8.1 Queue Architecture & Broker Selection

For asynchronous, long-running AI tasks (form filling, ComfyUI video rendering, bulk resume parsing), the platform integrates an enterprise message queue fabric:
- **RabbitMQ (AMQP 0-9-1)**: Selected for complex routing, tenant virtual hosts, and ephemeral exclusive reply queues.
- **Apache Kafka / Redpanda**: Selected for high-volume audit event streaming and event-sourcing pipelines.
- **Redis Streams**: Selected for lightweight local dev and ultra-low-latency real-time task progress counters.

```mermaid
flowchart TD
    subgraph Ingress_Layer["API Gateway Layer (model-connector-service)"]
        REQ_A["User A Task Request (TNT-01, USR-A)"]
        REQ_B["User B Task Request (TNT-02, USR-B)"]
        AUTH_ROUTER["HMAC Envelope Signer & Route Mapper"]
        REQ_A & REQ_B --> AUTH_ROUTER
    end

    subgraph AMQP_Exchange["Topic Exchange: mc.jobs.exchange"]
        EX["Direct / Topic Exchange"]
        AUTH_ROUTER ==>|"Publish with Routing Key:<br/>jobs.TNT-01.USR-A.RESUME_AST"| EX
        AUTH_ROUTER ==>|"Publish with Routing Key:<br/>jobs.TNT-02.USR-B.RESUME_AST"| EX
    end

    subgraph Tenant_Queues["Tenant-Isolated Inbound Queues"]
        QA[("Queue: q.inbound.TNT-01.USR-A<br/>Binding: jobs.TNT-01.USR-A.*")]
        QB[("Queue: q.inbound.TNT-02.USR-B<br/>Binding: jobs.TNT-02.USR-B.*")]
        EX -->|"Routed via Exact Key"| QA
        EX -->|"Routed via Exact Key"| QB
    end

    subgraph Ephemeral_Replies["Ephemeral Exclusive Reply Queues"]
        REPLY_A[("Exclusive Queue:<br/>q.reply.USR-A.JOB-01.salt<br/>(Access: USR-A Only)")]
        REPLY_B[("Exclusive Queue:<br/>q.reply.USR-B.JOB-02.salt<br/>(Access: USR-B Only)")]
    end

    subgraph Workers["Stateless Worker Pool"]
        W1["Worker 1 (Leases Task)"]
        W2["Worker 2 (Leases Task)"]
        QA --> W1
        QB --> W2
        W1 ==>|"Validates HMAC -> Executes Model -> Publishes Output"| REPLY_A
        W2 ==>|"Validates HMAC -> Executes Model -> Publishes Output"| REPLY_B
    end

    QA -.->|"STRICTLY BLOCKED: Cannot Route Across Users"| QB
    REPLY_A -.->|"STRICTLY BLOCKED: User B Access Denied"| REPLY_B
```

### 8.2 The Zero-Leakage Multi-Tenant Isolation Invariant

In an enterprise deployment supporting 1,000,000 active concurrent users, preventing cross-tenant message leakage is non-negotiable:
1. **Cryptographically Salted Routing Keys**:
   $$\text{Routing Key} = \text{jobs}.\langle \text{TENANT\_ID} \rangle.\langle \text{USER\_ID} \rangle.\langle \text{FEATURE\_ID} \rangle$$
   The broker exchange routes exclusively to queues matching the complete compound key. User B cannot subscribe to User A's routing wildcards.
2. **Virtual Host (vhost) Boundaries**:
   For enterprise tier customers, dedicated AMQP vhosts (`/tenant_TNT-01`) physically segregate connections, exchanges, and queues at the broker process boundary.
3. **Queue Authorization Permissions (ACLs)**:
   AMQP credentials leased to client applications enforce strict read/write regex patterns:
   - Configure Permission: `^$` (No queue creation permitted by clients).
   - Write Permission: `^mc\.jobs\.exchange$` (Publishing only to authorized exchange).
   - Read Permission: `^q\.reply\.<USER_ID>\..*$` (Consuming strictly from self-owned reply queues).

### 8.3 HMAC Cryptographically Signed Message Envelopes

Every message dispatched to the broker is encapsulated within a tamper-proof envelope signed with a per-tenant cryptographic secret:

```json
{
  "envelopeVersion": "2.0",
  "w3cTrace": {
    "traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
    "spanId": "00f067aa0ba902b7"
  },
  "tenantId": "TNT-JOBPORTAL-01",
  "userId": "USR-9921-X9",
  "featureId": "CAREER_PORTAL_AUTOFILL",
  "jobId": "JOB-88312-B2",
  "replyToQueue": "q.reply.USR-9921-X9.JOB-88312-B2.7f3a8b",
  "dispatchedTimestamp": "2026-10-20T20:25:00.000Z",
  "signature": "hmac_sha256(payload, TENANT_HMAC_SECRET)",
  "payload": {
    "modelId": "gemini-3.8-flash",
    "workflowCode": "WORKDAY_CAREER_APPLY",
    "applicantDataEncrypted": "vault:v1:78fa9b201...",
    "targetJobUrl": "https://company.wd5.myworkdayjobs.com/apply/452"
  }
}
```

- **Worker Verification Invariant**: Before executing any step, the worker verifies `signature === hmac_sha256(payload, secret)`. If the signature is invalid or claims are mismatched, the message is routed to `dlx.tenant.security` and an alert is raised immediately.

### 8.4 User Inbound Queue & Ephemeral Exclusive Reply-To Routing

When a client initiates an asynchronous operation:
1. `model-connector-service` establishes an ephemeral reply-to queue with flags:
   `{ exclusive: true, autoDelete: true, expires: 180000 }`.
2. The queue name incorporates the user ID and a cryptographically secure random nonce:
   `q.reply.<USER_ID>.<JOB_ID>.<NONCE>`.
3. The server opens an SSE or WebSocket bridge channel exclusively mapped to that ephemeral queue.
4. When the worker finishes processing, it publishes the result directly to `replyToQueue`.
5. The gateway streams the result to the user's active WebSocket and immediately destroys the reply queue.

### 8.5 Dead-Letter-Exchange (DLX) & Failure Boundary Isolation

- **Isolated DLX per Tenant**: `dlx.tenant.<TENANT_ID>` captures expired or rejected messages.
- **Poison Message Protection**: Messages with $\text{retry\_count} \ge 3$ are automatically quarantined into the tenant's isolated DLQ without causing worker starvation or blocking other users' messages in the queue.

---

## 9. Silent Access Revocation & Dynamic Recovery Design

### 9.1 Auth Revocation Circuit Breaker & Trap Implementation

When a user revokes OAuth access (e.g., via Google Account Security settings) or revokes API keys without notifying the platform, the platform must trap the fatal authorization error without blindly retrying or crashing.

```typescript
// @/security/traps/AuthRevocationInterceptor.ts
import { DomainException } from '@/errors/DomainException';
import { CredentialStatus } from '@/constants/CredentialStatus';
import type { IModelCredentialRepository } from '@/repositories/IModelCredentialRepository';
import type { IEventPublisher } from '@/events/IEventPublisher';

export class AuthRevocationInterceptor {
  public constructor(
    private readonly credentialRepo: IModelCredentialRepository,
    private readonly eventPublisher: IEventPublisher,
  ) {}

  public async handleUpstreamError(
    userId: string,
    providerFamily: string,
    statusCode: number,
    errorBody: Record<string, unknown>,
  ): Promise<void> {
    const isRevoked = this.classifyRevocation(statusCode, errorBody);
    if (!isRevoked) {
      return;
    }

    // 1. Immediately deactivate credential and quarantine in DB
    await this.credentialRepo.updateStatus(
      userId,
      providerFamily,
      CredentialStatus.REVOKED_SILENTLY,
    );

    // 2. Publish high-priority event to UI & Workflow Engine
    await this.eventPublisher.publishUserEvent(userId, 'EVENT_CREDENTIAL_REVOKED', {
      providerFamily,
      reason: 'UPSTREAM_ACCESS_REVOKED_BY_USER',
      timestamp: new Date().toISOString(),
    });
  }

  private classifyRevocation(code: number, body: Record<string, unknown>): boolean {
    if (code !== 401 && code !== 403) return false;
    const err = String(body.error || body.message || '').toLowerCase();
    return (
      err.includes('invalid_grant') ||
      err.includes('token_revoked') ||
      err.includes('revoked') ||
      err.includes('account_deactivated')
    );
  }
}
```

### 9.2 State Transition Machine & Problem Details Envelope

```
[ ACTIVE_VALIDATED ]
        │
        ▼ (Upstream 401/403 with invalid_grant)
[ REVOKED_SILENTLY ] ───► Evict Redis Token Cache & Suspend Active Step
        │
        ▼ (Push Re-Auth Challenge via WebSocket)
[ AWAITING_USER_REAUTH ]
        │
        ▼ (User completes Google OAuth / Enters Fresh Key)
[ TOKEN_REVALIDATING ] ───► Ping 0-token probe
        │
        ▼ (Probe Success)
[ ACTIVE_VALIDATED ] ───► Resume Workflow at Suspended Step N
```

#### RFC 7807 Problem Details Error Envelope
```json
{
  "type": "https://api.model-connector.io/errors/credential-revoked",
  "title": "Upstream Provider Access Revoked",
  "status": 401,
  "detail": "The Google OAuth refresh token was revoked by the user or provider. Execution suspended at step 'RESUME_AST_MUTATION'.",
  "instance": "/api/v1/jobs/JOB-88312-B2/steps/3",
  "extensions": {
    "providerFamily": "GOOGLE_GEMINI",
    "suspendedJobId": "JOB-88312-B2",
    "savedStepIndex": 3,
    "recoveryAction": "REAUTH_REQUIRED",
    "reauthEndpoint": "/api/v1/auth/google/authorize"
  }
}
```

### 9.3 Sequence Flow: Silent Revocation & State-Preserved Resumption

```mermaid
sequenceDiagram
    autonumber
    participant UI as model-connector-ui
    participant SVC as model-connector-service
    participant EXT as Upstream Provider (Google)
    participant DB as Postgres & Mongo
    participant WS as WebSocket Bridge

    UI->>SVC: POST /api/v1/jobs/JOB-901/execute
    SVC->>EXT: Invoke Gemini API with Cached Token
    EXT-->>SVC: 400 Bad Request: "invalid_grant: Token has been expired or revoked."
    SVC->>SVC: AuthRevocationInterceptor: Classify as FATAL_REVOCATION
    SVC->>DB: UPDATE MODEL_CREDENTIALS SET IS_ACTIVE=false, STATUS='REVOKED_SILENTLY'
    SVC->>DB: UPDATE WORKFLOW_EXECUTION_JOBS SET STATUS='SUSPENDED_AWAITING_REAUTH', STEP_INDEX=3
    SVC->>WS: Push EVENT_CREDENTIAL_REVOKED to User Channel
    WS-->>UI: Display Non-Destructive Re-Auth Modal
    Note over UI: User clicks "Reconnect Google Account"
    UI->>EXT: Complete Google Consent Screen
    EXT-->>UI: Return Authorization Code
    UI->>SVC: POST /api/v1/auth/google/reconnect (Auth Code)
    SVC->>EXT: Exchange Code for Refresh Token
    EXT-->>SVC: 200 OK: New Refresh & Access Token
    SVC->>DB: UPDATE MODEL_CREDENTIALS SET IS_ACTIVE=true, STATUS='ACTIVE'
    SVC->>SVC: Load Step 3 Saved Artifacts & Resume Execution
    SVC->>EXT: Execute Step 3 with Fresh Credentials
    EXT-->>SVC: 200 OK: AST Mutation Succeeded
    SVC-->>UI: Stream Step 3 Output & Continue to Step 4
```

---

## 10. Enhanced DDL Specification (Tables 16-19)

### 10.1 Table 16: COOKIE_VAULT_CREDENTIALS
Stores AES-256-GCM encrypted cookies for free-tier web model interactions.

```sql
CREATE TABLE IF NOT EXISTS COOKIE_VAULT_CREDENTIALS (
    COOKIE_CREDENTIAL_ID VARCHAR(64) PRIMARY KEY,
    USER_ID VARCHAR(64) NOT NULL,
    ORGANIZATION_ID VARCHAR(64) NOT NULL,
    MODEL_PROVIDER VARCHAR(32) NOT NULL,
    COOKIE_DOMAIN VARCHAR(128) NOT NULL,
    ENCRYPTED_COOKIE_PAYLOAD TEXT NOT NULL,
    INITIALIZATION_VECTOR VARCHAR(32) NOT NULL,
    AUTH_TAG VARCHAR(32) NOT NULL,
    SESSION_EXPIRY_TIMESTAMP TIMESTAMP NOT NULL,
    LAST_HEALTH_PROBE_TIMESTAMP TIMESTAMP,
    PROBE_STATUS VARCHAR(32) NOT NULL DEFAULT 'HEALTHY',
    IS_ACTIVE BOOLEAN NOT NULL DEFAULT TRUE,
    CREATED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT FK_COOKIE_USER FOREIGN KEY (USER_ID) REFERENCES USER_IDENTITIES(USER_ID) ON DELETE CASCADE,
    CONSTRAINT FK_COOKIE_ORG FOREIGN KEY (ORGANIZATION_ID) REFERENCES ORGANIZATION_ACCOUNTS(ORGANIZATION_ID)
);
```

### 10.2 Table 17: ONBOARDING_WORKFLOW_TEMPLATES
Stores canonical DAG blueprints compiled during application onboarding.

```sql
CREATE TABLE IF NOT EXISTS ONBOARDING_WORKFLOW_TEMPLATES (
    TEMPLATE_ID VARCHAR(64) PRIMARY KEY,
    APPLICATION_ID VARCHAR(64) NOT NULL,
    ORGANIZATION_ID VARCHAR(64) NOT NULL,
    TEMPLATE_NAME VARCHAR(128) NOT NULL,
    VERSION INTEGER NOT NULL DEFAULT 1,
    DAG_JSON_SCHEMA TEXT NOT NULL,
    IS_CANONICAL BOOLEAN NOT NULL DEFAULT TRUE,
    CREATED_BY_USER_ID VARCHAR(64) NOT NULL,
    CREATED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UPDATED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UQ_APP_TEMPLATE_VERSION UNIQUE (APPLICATION_ID, VERSION),
    CONSTRAINT FK_TMPL_ORG FOREIGN KEY (ORGANIZATION_ID) REFERENCES ORGANIZATION_ACCOUNTS(ORGANIZATION_ID)
);
```

### 10.3 Table 18: RECORD_STEP_EXECUTIONS
Maintains strict step-level execution status, enforcing the Zero-Skip Invariant and tracking explicit record/flow skips.

```sql
CREATE TABLE IF NOT EXISTS RECORD_STEP_EXECUTIONS (
    EXECUTION_STEP_ID VARCHAR(64) PRIMARY KEY,
    JOB_ID VARCHAR(64) NOT NULL,
    RECORD_ID VARCHAR(64) NOT NULL,
    STEP_INDEX INTEGER NOT NULL,
    STEP_NAME VARCHAR(64) NOT NULL,
    EXECUTION_STATUS VARCHAR(32) NOT NULL,
    SKIP_TYPE VARCHAR(32) NOT NULL DEFAULT 'NONE',
    SKIP_REASON TEXT,
    SKIPPED_BY_USER_ID VARCHAR(64),
    INPUT_PAYLOAD_REF VARCHAR(128),
    OUTPUT_PAYLOAD_REF VARCHAR(128),
    LATENCY_MS INTEGER NOT NULL DEFAULT 0,
    CREATED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UPDATED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT CK_SKIP_TYPE CHECK (SKIP_TYPE IN ('NONE', 'SKIP_SINGLE_RECORD', 'SKIP_FLOW_WIDE')),
    CONSTRAINT CK_STEP_STATUS CHECK (EXECUTION_STATUS IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SUSPENDED_AWAITING_REAUTH', 'SKIPPED')),
    CONSTRAINT FK_EXEC_JOB FOREIGN KEY (JOB_ID) REFERENCES WORKFLOW_EXECUTION_JOBS(JOB_ID) ON DELETE CASCADE
);
```

### 10.4 Table 19: ACCESS_REVOCATION_LOGS
Forensic compliance log tracking upstream revocation traps, latency to recovery, and user remediation.

```sql
CREATE TABLE IF NOT EXISTS ACCESS_REVOCATION_LOGS (
    REVOCATION_LOG_ID VARCHAR(64) PRIMARY KEY,
    USER_ID VARCHAR(64) NOT NULL,
    ORGANIZATION_ID VARCHAR(64) NOT NULL,
    PROVIDER_FAMILY VARCHAR(32) NOT NULL,
    UPSTREAM_HTTP_CODE INTEGER NOT NULL,
    UPSTREAM_ERROR_SNIPPET VARCHAR(256),
    AFFECTED_JOB_ID VARCHAR(64),
    AFFECTED_STEP_INDEX INTEGER,
    DETECTED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    RESOLVED_TIMESTAMP TIMESTAMP,
    RESOLUTION_ACTION VARCHAR(32),
    CONSTRAINT FK_REV_USER FOREIGN KEY (USER_ID) REFERENCES USER_IDENTITIES(USER_ID)
);
```

```sql
-- Performance Indexes for Tables 16-19
CREATE INDEX IF NOT EXISTS IDX_COOKIE_USER_PROV ON COOKIE_VAULT_CREDENTIALS(USER_ID, MODEL_PROVIDER, IS_ACTIVE);
CREATE INDEX IF NOT EXISTS IDX_STEP_EXEC_JOB_REC ON RECORD_STEP_EXECUTIONS(JOB_ID, RECORD_ID, STEP_INDEX);
CREATE INDEX IF NOT EXISTS IDX_STEP_EXEC_STATUS ON RECORD_STEP_EXECUTIONS(EXECUTION_STATUS);
CREATE INDEX IF NOT EXISTS IDX_REV_USER_TIME ON ACCESS_REVOCATION_LOGS(USER_ID, DETECTED_TIMESTAMP DESC);
```

---

<a id="14-zero-skip-invariant--explicit-skip-manifest-engine"></a>
## 11. Dynamic Workflow Execution Engine & Skip Governance

### 11.1 Dynamic DAG Synthesis & Zero-Skip Verification Gate

The execution engine instantiates an `xstate` v5 state machine from `ONBOARDING_WORKFLOW_TEMPLATES`. Before each transition:
1. **Assertion Gate**: Checks if `stepOutput` matches the step's contract via `zod`.
2. **Missing Output Guard**: If output is null or step was bypassed without an authorized skip flag, the engine raises `ZeroSkipInvariantViolationException` and freezes execution.

### 11.2 Record-Level Skip vs. Flow-Wide Skip Implementation

```typescript
// @/workflow/engine/StepExecutionEngine.ts
import { DomainException } from '@/errors/DomainException';
import { SkipType } from '@/constants/SkipType';
import type { IStepExecutionRepository } from '@/repositories/IStepExecutionRepository';

export interface ISkipRequest {
  readonly skipType: SkipType;
  readonly reason: string;
  readonly userId: string;
  readonly recordId: string;
}

export class StepExecutionEngine {
  public constructor(private readonly stepRepo: IStepExecutionRepository) {}

  public async evaluateStepExecution(
    stepIndex: number,
    recordId: string,
    skipRequest?: ISkipRequest,
  ): Promise<boolean> {
    if (!skipRequest || skipRequest.skipType === SkipType.NONE) {
      return true; // Execute normally under Zero-Skip contract
    }

    // STD-COD-006: Max nesting <= 3, SLAP <= 20 lines
    if (skipRequest.reason.trim().length < 10) {
      throw new DomainException('Mandatory audit reason must contain at least 10 characters.');
    }

    if (skipRequest.skipType === SkipType.SKIP_SINGLE_RECORD) {
      await this.stepRepo.recordStepSkip(recordId, stepIndex, skipRequest);
      return false; // Skip this single record safely
    }

    if (skipRequest.skipType === SkipType.SKIP_FLOW_WIDE) {
      await this.stepRepo.recordFlowWideStepSkip(stepIndex, skipRequest);
      return false; // Skip and trigger template deprecation
    }

    throw new DomainException(`Unrecognized SkipType: ${skipRequest.skipType}`);
  }
}
```

---

<a id="12-free-tier-cookie-harvesting--silent-authentication-revocation-engine"></a>
## 12. Free-Tier Cookie-Based Model Connector Client & Playwright Sync

### 12.1 AES-256-GCM Vault & Header Emulation Adapter

```typescript
// @/security/vault/CookieCredentialVault.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { ICookiePayload } from '@/types/ICookiePayload';

export class CookieCredentialVault {
  private static readonly ALGORITHM = 'aes-256-gcm';

  public static encrypt(payload: ICookiePayload, derivedUserKey: Buffer): {
    cipherText: string;
    ivHex: string;
    authTagHex: string;
  } {
    const iv = randomBytes(12);
    const cipher = createCipheriv(this.ALGORITHM, derivedUserKey, iv);
    let encrypted = cipher.update(JSON.stringify(payload), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return {
      cipherText: encrypted,
      ivHex: iv.toString('hex'),
      authTagHex: authTag.toString('hex'),
    };
  }

  public static decrypt(cipherText: string, ivHex: string, authTagHex: string, derivedUserKey: Buffer): ICookiePayload {
    const decipher = createDecipheriv(this.ALGORITHM, derivedUserKey, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(cipherText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted) as ICookiePayload;
  }
}
```

### 12.2 Playwright MCP Headless Cookie Synchronization Interface

```typescript
// @/mcp/PlaywrightCookieSyncEngine.ts
import type { BrowserContext, Cookie } from 'playwright';
import type { ICookiePayload } from '@/types/ICookiePayload';

export class PlaywrightCookieSyncEngine {
  public static async injectCookies(
    context: BrowserContext,
    cookies: ICookiePayload[],
    targetDomain: string,
  ): Promise<void> {
    const playwrightCookies: Cookie[] = cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: targetDomain,
      path: c.path || '/',
      httpOnly: c.httpOnly ?? true,
      secure: c.secure ?? true,
      sameSite: (c.sameSite as 'Strict' | 'Lax' | 'None') || 'Lax',
    }));

    await context.addCookies(playwrightCookies);
  }
}
```

---

## 13. Token Exhaustion & Context Window Recovery Engine

### 13.1 `ITokenRecoveryStrategy` & Polymorphic Strategy Hierarchy

To prevent pipeline aborts when a model's physical context window is surpassed or upstream provider rate limits/quotas are exhausted, the platform defines a polymorphic recovery hierarchy:

```typescript
// @/token/recovery/ITokenRecoveryStrategy.ts
import type { IModelExecutionPayload } from '@/types/IModelExecutionPayload';
import type { ITokenRecoveryResult } from '@/types/ITokenRecoveryResult';

export interface ITokenRecoveryStrategy {
  canHandle(payload: IModelExecutionPayload, errorOrRatio: unknown): boolean;
  recover(payload: IModelExecutionPayload): Promise<ITokenRecoveryResult>;
}
```

```typescript
// @/token/recovery/AdaptiveAstCompactionStrategy.ts
import type { ITokenRecoveryStrategy } from '@/token/recovery/ITokenRecoveryStrategy';
import type { IModelExecutionPayload } from '@/types/IModelExecutionPayload';
import type { ITokenRecoveryResult } from '@/types/ITokenRecoveryResult';
import { RecoveryAction } from '@/constants/RecoveryAction';

export class AdaptiveAstCompactionStrategy implements ITokenRecoveryStrategy {
  public canHandle(payload: IModelExecutionPayload, ratio: unknown): boolean {
    return typeof ratio === 'number' && ratio > 0.8 && ratio <= 1.25;
  }

  public async recover(payload: IModelExecutionPayload): Promise<ITokenRecoveryResult> {
    const originalTokens = payload.estimatedTokens;
    // Strip redundant markdown formatting, AST comments, and structural whitespace
    const compactedText = payload.promptText
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim();

    const compactedTokens = Math.ceil(originalTokens * 0.65);
    return {
      actionTaken: RecoveryAction.COMPACTION,
      recoveredPayload: { ...payload, promptText: compactedText, estimatedTokens: compactedTokens },
      tokensSaved: originalTokens - compactedTokens,
      resumedDirectly: true,
    };
  }
}
```

### 13.2 AST Pruning & Chunked Map-Reduce Summarization Algorithm

For conversational sessions with extensive history (turn count $> 10$):
1. **Partition Turns**: Retain system instruction (Turn 0) and the two most recent interactions (Turns $N-1$, $N$).
2. **Chunk & Summarize**: Turns $1$ through $N-2$ are condensed into an immutable semantic digest using a local or fast inference model:
   ```
   [PREVIOUS_TURNS_DIGEST]: Candidate possesses Staff-level distributed systems experience
   in Go and TypeScript. Target role identified as Principal Infrastructure Architect.
   ```
3. **Re-assemble Pipeline**: The condensed digest is prepended to the user's active turn, liberating up to **80% of the active context window**.

### 13.3 Dynamic Model Failover Router with Token Quota Check

When provider quota is completely exhausted (HTTP 429) or context exceeds compaction capacity, the router dispatches to the next qualified model in the configured fallback chain:

```typescript
// @/token/router/DynamicModelFailoverRouter.ts
import type { IModelExecutionStrategy } from '@/strategies/IModelExecutionStrategy';
import type { IModelExecutionPayload } from '@/types/IModelExecutionPayload';
import type { IInferenceOutput } from '@/types/IInferenceOutput';
import { DomainException } from '@/errors/DomainException';

export class DynamicModelFailoverRouter {
  public constructor(
    private readonly strategyRegistry: Map<string, IModelExecutionStrategy>,
    private readonly fallbackChain: readonly string[],
  ) {}

  public async executeWithFailover(
    initialProvider: string,
    payload: IModelExecutionPayload,
  ): Promise<IInferenceOutput> {
    const providersToTry = [initialProvider, ...this.fallbackChain.filter(p => p !== initialProvider)];

    for (const provider of providersToTry) {
      const strategy = this.strategyRegistry.get(provider);
      if (!strategy) continue;

      try {
        return await strategy.execute(payload);
      } catch (err: unknown) {
        // Continue down the fallback chain on quota/rate-limit failure
        continue;
      }
    }

    throw new DomainException('All model provider quotas exhausted in failover cascade.');
  }
}
```

### 13.4 Table 20 DDL: `TOKEN_BUDGET_LEDGERS`
Audits token burn rates, compaction savings, and quota recovery across users and models.

```sql
CREATE TABLE IF NOT EXISTS TOKEN_BUDGET_LEDGERS (
    LEDGER_ID VARCHAR(64) PRIMARY KEY,
    USER_ID VARCHAR(64) NOT NULL,
    APPLICATION_ID VARCHAR(64) NOT NULL,
    MODEL_ID VARCHAR(64) NOT NULL,
    ALLOCATED_TOKENS INTEGER NOT NULL DEFAULT 1000000,
    CONSUMED_TOKENS INTEGER NOT NULL DEFAULT 0,
    COMPACTED_TOKENS_SAVED INTEGER NOT NULL DEFAULT 0,
    LAST_RECOVERY_ACTION VARCHAR(32) NOT NULL DEFAULT 'NONE',
    UPDATED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT CK_RECOVERY_ACTION CHECK (LAST_RECOVERY_ACTION IN ('NONE', 'COMPACTION', 'SUMMARIZATION', 'FAILOVER')),
    CONSTRAINT FK_LEDGER_USER FOREIGN KEY (USER_ID) REFERENCES USER_IDENTITIES(USER_ID) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS IDX_LEDGER_USER_APP ON TOKEN_BUDGET_LEDGERS(USER_ID, APPLICATION_ID, MODEL_ID);
```

---

## 14. Monorepo Code Generation Rules & Anti-Pattern Eliminator

### 14.1 The 7 Golden Rules of Code Synthesis

All contributors and AI code generation engines working on `model-connector-platform` must strictly enforce:
1. **`@/*` Absolute Imports**: Never use `./` or `../`. Import via mapped root packages.
2. **Object-Oriented Design Patterns & DI**: Replace procedural functions with stateful/stateless classes adhering to SOLID principles, injected via constructors.
3. **Zero `if`, `if..else`, or `switch` Branching for Domain Logic**:
   - Replace model selection switches with **Strategy Pattern** registries.
   - Replace complex conditional validations with **Specification Pattern** or **Chain of Responsibility**.
4. **Vendor-Neutral Naming**: Use generic abstractions (`modelExecutionPayload`, `rawInferenceResponse`, `tokenBudget`) rather than model-specific terms (`geminiPrompt`, `openAiResponse`).
5. **Centralized Constants (`@/constants/`)**: Zero magic strings or numbers.
6. **Zero Logic Duplication (DRY)**: Reusable utilities reside in `model-connector-core`.
7. **`application.yml` Master Configuration**: Default configurations and environment parameters are loaded declaratively from YAML.

### 14.2 Concrete Code Refactoring: Procedural Branching to Strategy & Chain of Responsibility

#### ❌ Prohibited Anti-Pattern (Procedural, Relative Navigation, Hardcoded Literals)
```typescript
// BAD: Violates STD-COD-001, STD-COD-002, STD-COD-005
import { executeGemini } from '../gemini/client';
import { executeClaude } from '../../claude/client';

export async function runPrompt(model: string, geminiPrompt: string) {
  if (model === 'gemini') {
    return await executeGemini(geminiPrompt, '<RUNTIME_ONLY>');
  } else if (model === 'claude') {
    return await executeClaude(geminiPrompt);
  } else {
    switch (model) {
      case 'ollama':
        return await fetch('http://localhost:11434/api/generate');
      default:
        throw new Error('Unsupported model');
    }
  }
}
```

#### ✅ Mandatory Compliant Pattern (Strategy Pattern, `@/*` Imports, DI, Zero Magic Literals)
```typescript
// GOOD: Compliant with STD-COD-001, STD-COD-002, STD-COD-005, STD-COD-006
import type { IModelExecutionStrategy } from '@/strategies/IModelExecutionStrategy';
import type { IModelExecutionPayload } from '@/types/IModelExecutionPayload';
import type { IInferenceOutput } from '@/types/IInferenceOutput';
import { DomainException } from '@/errors/DomainException';

export class ModelExecutionDispatcher {
  public constructor(
    private readonly strategyRegistry: ReadonlyMap<string, IModelExecutionStrategy>,
  ) {}

  public async dispatch(
    family: string,
    payload: IModelExecutionPayload,
  ): Promise<IInferenceOutput> {
    const strategy = this.strategyRegistry.get(family);
    if (!strategy) {
      throw new DomainException(`Unsupported model family: ${family}`);
    }
    return strategy.execute(payload);
  }
}
```

---

## 15. Master HTTP Status & Condition-Based Navigation Matrix

### 15.1 Comprehensive Flow Navigation & Status Mapping Table
The following master table maps every operational endpoint across the platform to its expected HTTP status codes, error conditions, user-facing UI state transitions, automated retry mechanics, and specific architectural documentation sections:

| Feature Flow & Endpoint | Method | Success Code | UI Visual State (Success) | Error / Condition Code | Trigger Condition / Failure Cause | Actionable Human-Centric UI Error Message | Automated Recovery Policy | Deep-Link Anchor |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **User Authentication**<br/>`/api/v1/auth/register` | `POST` | `201 Created` | Stepper advances to Scope Selection (Frame 2); green glow. | `401 Unauthorized` | Invalid or expired Google GIS ID Token. | *"Google authentication expired. Please click to sign in again."* | Re-trigger Google PKCE popup. | [ui-lld.md#42](ui-lld.md#42-frame-1-multi-mode-authentication--tenant-selection) |
| **Token Refresh**<br/>`/api/v1/auth/refresh` | `POST` | `200 OK` | Silent in-memory token rotation; uninterrupted SSE. | `403 Forbidden` | Refresh token revoked out-of-band by Admin. | *"Your enterprise session was revoked. Work has been preserved locally."* | Display amber modal; pause workflow. | [ui-hld.md#51](ui-hld.md#51-mid-flight-access-revocation--session-recovery-flow) |
| **Resume AST Ingestion**<br/>`/api/v1/tenants/job-portal/resumes/upload` | `POST` | `200 OK` | Renders dual-pane AST tree & score dial (0–94%). | `400 Bad Request`<br/>`422 Unprocessable` | Malformed PDF structure / Zip bomb / MIME mismatch. | *"The uploaded resume file could not be parsed. Please upload a clean PDF or DOCX."* | Shake dropzone; reset file input. | [ui-lld.md#43](ui-lld.md#43-frame-2-resume-ingestion--pre-flight-validation) |
| **Resume Skill Mutation**<br/>`/api/v1/tenants/job-portal/resumes/mutate` | `POST` | `200 OK` | Chip switches from Amber to Cyan; score updates via SSE. | `409 Conflict` | Mutation rule violates candidate factual bounds. | *"Cannot mutate this skill because no underlying project evidence exists in the AST."* | Revert chip; show AST gap alert. | [ui-lld.md#44](ui-lld.md#44-frame-3-real-time-ast-verification--missing-skill-mutation) |
| **Career Portal Autofill**<br/>`/api/v1/tenants/job-portal/apply` | `POST` | `202 Accepted` | Live Playwright stream viewport opens; task progress ticks. | `409 Conflict` | Candidate already applied to this specific job ID. | *"You have already submitted an application to this requisition on Oct 19."* | Render `[View Receipt]` button. | [lld.md#43](lld.md#43-flow-3-web-to-markdown--career-portal-autofill-via-playwright-mcp) |
| **Outreach Follow-Up**<br/>`/api/v1/tenants/job-portal/follow-ups/dispatch`| `POST` | `201 Created` | Follow-up schedule card added with countdown pill. | `409 Conflict` | Duplicate follow-up email triggered within 24 hours. | *"A follow-up email to this recruiter is already scheduled for Oct 24."* | Highlight existing schedule row. | [hld.md#213](hld.md#213-user-facing-meaningful-message-dictionary) |
| **Skill MD Compilation**<br/>`/api/v1/tenants/apps-builder/skills/compile` | `POST` | `200 OK` | Monaco editor displays syntax-highlighted tool AST tree. | `422 Unprocessable` | Missing YAML frontmatter or invalid tool schema. | *"Skill markdown is missing required frontmatter: 'name' or 'description'."* | Highlight line error in editor. | [ui-lld.md#53](ui-lld.md#53-frame-2-skill-md-ingestion--ast-parser-verification) |
| **Sandbox Execution**<br/>`/api/v1/tenants/apps-builder/sandbox/run` | `POST` | `200 OK` | xterm.js terminal outputs build logs; 14/14 tests green. | `500 Server Error`<br/>`504 Gateway Timeout`| Docker container test failure or execution timeout. | *"Sandbox tests failed (2/14 failing). Review terminal error output below."* | Render terminal diff; offer retry. | [ui-lld.md#55](ui-lld.md#55-frame-4-hermetic-docker-sandbox-execution--unit-test-telemetry) |
| **Story Narration Synthesis**<br/>`/api/v1/tenants/storyteller/narratives/generate`| `POST` | `200 OK` | Interactive audio waveform timeline & keyframe storyboard rendered. | `429 Too Many Requests` | Voice provider RPM limit reached. | *"Audio voice generation is experiencing high traffic. Position 2 in queue."* | Enqueue task in Redis backpressure. | [ui-hld.md#53](ui-hld.md#53-provider-429-rate-limiting--queue-backpressure-flow) |
| **ComfyUI Video DAG**<br/>`/api/v1/tenants/storyteller/workflows/execute` | `POST` | `202 Accepted` | Visual DAG nodes animate; GPU VRAM meter shows active rendering. | `503 Unavailable` | ComfyUI GPU worker unavailable or out of VRAM. | *"GPU rendering cluster is currently busy. Your video task has been queued (ETA: 3m)."* | Background queue with push notification. | [ui-lld.md#65](ui-lld.md#65-frame-4-comfyui-diffusion-dag-execution--real-time-sse-stream) |
| **Workflow Step Skip**<br/>`/api/v1/workflows/nodes/update-policy` | `PATCH` | `200 OK` | Node shows grayed-out "SKIPPED" badge with audit record. | `403 Forbidden` | User attempted to skip a mandatory compliance step. | *"Regulatory governance requires this step for all records. Skip prohibited."* | Shake node with crimson border. | [ui-hld.md#56](ui-hld.md#56-unauthorized-mandatory-step-skip-policy-rejection-flow) |
| **Model Inference Dispatch**<br/>`/api/v1/models/execute` | `POST` | `200 OK` | Streaming SSE tokens with live markdown formatting. | `422 Token Overflow` | Document exceeds model physical context window. | *"Document exceeds token limit. Lossless AST compaction is ready."* | Trigger Smart Compaction modal. | [ui-hld.md#52](ui-hld.md#52-model-token-exhaustion--compaction-fallback-flow) |

---

<a id="16-b2b--b2c-billing-monetization--metric-calculation-engine"></a>
<a id="17-gdpr-compliance-audit-log-retraction--right-to-be-forgotten"></a>
## 16. Comprehensive Flow Restriction Audit Logging & Investigation Architecture

### 16.1 Problem Statement & Architectural Scope
- **Problem Statement**: In multi-tenant enterprise environments, compliance regulations (GDPR, SOC2, HIPAA, ISO 27001) require comprehensive auditability whenever automated AI workflows are restricted, bypassed, or filtered. If an operator or user disables a workflow, skips an AST scoring step, or blocks outreach to a specific company, security investigators must be able to reconstruct:
  1. *Who performed the restriction* (User ID, IP, Tenant Salt).
  2. *What exact scope was affected* (A single candidate record, a target company domain, or the entire workflow).
  3. *Why the action was taken* (User justification, compliance rule ID, or automated safety trigger).
  4. *What was the exact blast radius* (Total records suppressed, timestamp window, and before/after policy state).

### 16.2 Three Hierarchical Restriction Scopes
1. **Scope 1: Record-Level Restriction (`RECORD_LEVEL`)**:
   - Applies strictly to a single entity (e.g., candidate resume `#REC-1098` marked as *"Skip AST Verification"* or *"Exclude from Automated Submission"*).
2. **Scope 2: Company / Domain-Level Restriction (`COMPANY_LEVEL`)**:
   - Applies to all interactions matching a specific corporate entity, recruiter email domain, or regulatory blacklist (e.g., *"Block all automated job submissions and follow-ups to company = 'CompetitorCorp' or domain = '@defense-contractor.gov'"*).
3. **Scope 3: Flow-Level / Global Restriction (`FLOW_LEVEL`)**:
   - Completely halts or alters an entire workflow pipeline across the tenant or platform (e.g., *"Emergency pause on all ComfyUI video rendering DAGs"* or *"Mandatory Human-in-the-Loop review enforced for all Job Portal applications"*).

### 16.3 Structured Audit Event JSON Schema (`AUDIT_EVENT_RESTRICTION_LOG`)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "AuditEventRestrictionLog",
  "type": "object",
  "required": [
    "auditLogId", "correlationId", "tenantId", "actorUserId", "actorRole",
    "restrictionScope", "restrictionAction", "reasonCode", "timestamp"
  ],
  "properties": {
    "auditLogId": { "type": "string", "pattern": "^AUD-[A-Z0-9]{12,}$" },
    "correlationId": { "type": "string", "format": "uuid" },
    "traceId": { "type": "string" },
    "tenantId": { "type": "string" },
    "actorUserId": { "type": "string" },
    "actorRole": { "type": "string", "enum": ["USER", "OPERATOR", "ADMIN", "SYSTEM_POLICY"] },
    "clientIpMasked": { "type": "string" },
    "restrictionScope": { "type": "string", "enum": ["RECORD_LEVEL", "COMPANY_LEVEL", "FLOW_LEVEL"] },
    "restrictionAction": { "type": "string", "enum": ["SKIP_STEP", "BLOCK_OUTREACH", "PAUSE_FLOW", "FORCE_HITL", "RESUME_FLOW"] },
    "targetEntity": {
      "type": "object",
      "properties": {
        "recordId": { "type": "string" },
        "companyName": { "type": "string" },
        "domainPattern": { "type": "string" },
        "workflowCode": { "type": "string" },
        "stepId": { "type": "string" }
      }
    },
    "reasonCode": { "type": "string", "enum": ["USER_EXPLICIT_OVERRIDE", "COMPLIANCE_RESTRICTION", "COMPETITOR_BLACKLIST", "SAFETY_GUARDRAIL", "BUDGET_QUOTA_EXCEEDED"] },
    "reasonDescription": { "type": "string", "maxLength": 500 },
    "compliancePolicyId": { "type": "string" },
    "beforeState": { "type": "object" },
    "afterState": { "type": "object" },
    "timestamp": { "type": "string", "format": "date-time" }
  }
}
```

### 16.4 Relational DDL for Restriction Audit Logs
```sql
CREATE TABLE IF NOT EXISTS RESTRICTION_AUDIT_LOGS (
    AUDIT_LOG_ID VARCHAR(64) PRIMARY KEY,
    CORRELATION_ID VARCHAR(64) NOT NULL,
    TENANT_ID VARCHAR(64) NOT NULL,
    ACTOR_USER_ID VARCHAR(64) NOT NULL,
    ACTOR_ROLE VARCHAR(32) NOT NULL,
    RESTRICTION_SCOPE VARCHAR(32) NOT NULL, -- 'RECORD_LEVEL', 'COMPANY_LEVEL', 'FLOW_LEVEL'
    RESTRICTION_ACTION VARCHAR(64) NOT NULL, -- 'SKIP_STEP', 'BLOCK_OUTREACH', 'PAUSE_FLOW', 'FORCE_HITL'
    TARGET_RECORD_ID VARCHAR(64),
    TARGET_COMPANY_NAME VARCHAR(128),
    TARGET_WORKFLOW_CODE VARCHAR(64),
    REASON_CODE VARCHAR(64) NOT NULL,
    REASON_DESCRIPTION TEXT NOT NULL,
    COMPLIANCE_POLICY_ID VARCHAR(64),
    CLIENT_IP VARCHAR(64),
    BEFORE_STATE_JSON TEXT,
    AFTER_STATE_JSON TEXT,
    CREATED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- High-Performance Composite & Partial Indexes for Forensic Investigation
CREATE INDEX IF NOT EXISTS IDX_RESTRICT_TENANT_TIME ON RESTRICTION_AUDIT_LOGS (TENANT_ID, CREATED_TIMESTAMP DESC);
CREATE INDEX IF NOT EXISTS IDX_RESTRICT_COMPANY ON RESTRICTION_AUDIT_LOGS (TARGET_COMPANY_NAME, CREATED_TIMESTAMP DESC) 
    WHERE TARGET_COMPANY_NAME IS NOT NULL;
CREATE INDEX IF NOT EXISTS IDX_RESTRICT_RECORD ON RESTRICTION_AUDIT_LOGS (TARGET_RECORD_ID) 
    WHERE TARGET_RECORD_ID IS NOT NULL;
CREATE INDEX IF NOT EXISTS IDX_RESTRICT_SCOPE ON RESTRICTION_AUDIT_LOGS (RESTRICTION_SCOPE, RESTRICTION_ACTION);
CREATE INDEX IF NOT EXISTS IDX_RESTRICT_CORRELATION ON RESTRICTION_AUDIT_LOGS (CORRELATION_ID);
```

### 16.5 Forensic Investigation Query Recipes (SecOps & Compliance)

#### Recipe 1: Find all restricted actions by a specific user across the last 30 days
```sql
-- Investigator Query: Audit trail for a specific operator/user
SELECT 
    AUDIT_LOG_ID,
    CREATED_TIMESTAMP,
    RESTRICTION_SCOPE,
    RESTRICTION_ACTION,
    COALESCE(TARGET_RECORD_ID, TARGET_COMPANY_NAME, TARGET_WORKFLOW_CODE) AS AFFECTED_TARGET,
    REASON_CODE,
    REASON_DESCRIPTION,
    CLIENT_IP
FROM RESTRICTION_AUDIT_LOGS
WHERE TENANT_ID = :tenantId
  AND ACTOR_USER_ID = :actorUserId
  AND CREATED_TIMESTAMP >= CURRENT_TIMESTAMP - INTERVAL '30 days'
ORDER BY CREATED_TIMESTAMP DESC;
```

#### Recipe 2: Find all suppressed candidate submissions for a specific company
```sql
-- Investigator Query: Why were candidates blocked from applying to 'CompetitorCorp'?
SELECT 
    AUDIT_LOG_ID,
    CREATED_TIMESTAMP,
    ACTOR_USER_ID,
    TARGET_RECORD_ID,
    REASON_CODE,
    REASON_DESCRIPTION
FROM RESTRICTION_AUDIT_LOGS
WHERE TARGET_COMPANY_NAME ILIKE '%CompetitorCorp%'
  AND RESTRICTION_ACTION = 'BLOCK_OUTREACH'
ORDER BY CREATED_TIMESTAMP DESC;
```

#### Recipe 3: Trace who modified flow-level kill switches and the exact blast radius
```sql
-- Investigator Query: Identify emergency pause/resume actions on entire pipelines
SELECT 
    AUDIT_LOG_ID,
    CREATED_TIMESTAMP,
    ACTOR_USER_ID,
    ACTOR_ROLE,
    TARGET_WORKFLOW_CODE,
    RESTRICTION_ACTION,
    BEFORE_STATE_JSON,
    AFTER_STATE_JSON,
    REASON_DESCRIPTION
FROM RESTRICTION_AUDIT_LOGS
WHERE RESTRICTION_SCOPE = 'FLOW_LEVEL'
ORDER BY CREATED_TIMESTAMP DESC;
```

---

<a id="15-tri-tier-distributed-idempotency--de-duplication-engine"></a>
## 17. Distributed De-duplication Database Schema & Redis Lock Engine

### 17.1 Production DDL Schema: `ACTION_DEDUPLICATION_REGISTRY`
```sql
CREATE TABLE IF NOT EXISTS ACTION_DEDUPLICATION_REGISTRY (
    DEDUPLICATION_ID VARCHAR(64) PRIMARY KEY,
    TENANT_ID VARCHAR(64) NOT NULL,
    ACTION_TYPE VARCHAR(64) NOT NULL, -- 'JOB_PORTAL_OUTREACH', 'STORYTELLER_RENDER', 'JOB_APPLICATION_SUBMIT'
    TARGET_ENTITY_ID VARCHAR(128) NOT NULL, -- Candidate ID, Recruiter Email, Job ID, or Story ID
    IDEMPOTENCY_KEY VARCHAR(64) NOT NULL,
    DEDUPLICATION_HASH VARCHAR(128) NOT NULL,
    EXECUTION_STATUS VARCHAR(32) NOT NULL DEFAULT 'IN_PROGRESS', -- 'IN_PROGRESS', 'COMPLETED', 'FAILED'
    RESULT_PAYLOAD_JSON TEXT,
    EXPIRES_TIMESTAMP TIMESTAMP NOT NULL,
    CREATED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UK_ACTION_DEDUP UNIQUE (TENANT_ID, ACTION_TYPE, TARGET_ENTITY_ID, DEDUPLICATION_HASH)
);

CREATE INDEX IF NOT EXISTS IDX_DEDUP_LOOKUP ON ACTION_DEDUPLICATION_REGISTRY (IDEMPOTENCY_KEY, TENANT_ID);
CREATE INDEX IF NOT EXISTS IDX_DEDUP_EXPIRY ON ACTION_DEDUPLICATION_REGISTRY (EXPIRES_TIMESTAMP) 
    WHERE EXECUTION_STATUS = 'IN_PROGRESS';
```

### 17.2 Redis Distributed Lock Pattern (Atomic Implementation)
```typescript
// @/resilience/DistributedIdempotencyGuard.ts
import type { Redis } from 'ioredis';
import { DomainException } from '@/errors/DomainException';

export class DistributedIdempotencyGuard {
  public constructor(private readonly redisClient: Redis) {}

  public async acquireOrThrow(
    tenantId: string,
    actionType: string,
    targetEntityId: string,
    ttlSeconds: number = 60,
  ): Promise<string> {
    const lockKey = `lock:idempotency:${tenantId}:${actionType}:${targetEntityId}`;
    const token = crypto.randomUUID();

    // Atomic SET NX EX (Set if Not Exists with Expiration)
    const result = await this.redisClient.set(lockKey, token, 'EX', ttlSeconds, 'NX');
    if (!result) {
      throw new DomainException(
        `DUPLICATE_ACTION_IN_PROGRESS: Action '${actionType}' on target '${targetEntityId}' is already running.`,
      );
    }
    return token;
  }

  public async release(
    tenantId: string,
    actionType: string,
    targetEntityId: string,
    token: string,
  ): Promise<void> {
    const lockKey = `lock:idempotency:${tenantId}:${actionType}:${targetEntityId}`;
    // Lua script: release lock only if value matches token (prevents releasing someone else's lock)
    const luaScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await this.redisClient.eval(luaScript, 1, lockKey, token);
  }
}
```

---

## 18. Apache APISIX Ingress Gateway Configuration & Routing Engine

### 18.1 Standalone Declarative Gateway Configuration (`apisix.yaml`)
```yaml
# config/apisix/apisix.yaml
routes:
  # Route 1: Core API Microservices Routing
  - id: core-service-api-route
    uri: /api/v1/*
    upstream:
      nodes:
        "model-connector-service:8095": 1
      type: roundrobin
      timeout:
        connect: 3s
        send: 60s
        read: 60s
    plugins:
      cors:
        allow_origins: "http://localhost:3005"
        allow_methods: "GET,POST,PUT,DELETE,PATCH,OPTIONS"
        allow_headers: "Authorization,Content-Type,Idempotency-Key,X-CSRF-Token,X-Tenant-Id"
        allow_credential: true
        max_age: 3600
      limit-count:
        count: 120
        time_window: 60
        rejected_code: 429
        rejected_msg: '{"error": "RATE_LIMIT_EXCEEDED", "message": "Too many requests. Please wait 60 seconds."}'
        key_type: var
        key: http_x_tenant_id
      response-rewrite:
        headers:
          set:
            X-Content-Type-Options: "nosniff"
            X-Frame-Options: "DENY"
            X-XSS-Protection: "1; mode=block"
            Strict-Transport-Security: "max-age=31536000; includeSubDomains"

  # Route 2: Real-time Server-Sent Events (SSE) Route (Infinite Timeout)
  - id: sse-telemetry-route
    uri: /api/v1/telemetry/stream
    upstream:
      nodes:
        "model-connector-service:8095": 1
      type: roundrobin
      timeout:
        connect: 5s
        send: 86400s
        read: 86400s
    plugins:
      cors:
        allow_origins: "http://localhost:3005"
        allow_credential: true
```

---

## 19. Low-Level Design: Workflow Resumption & Cryptographic State Ledger

### 19.1 Relational Schema: `WORKFLOW_STEP_LEDGER`
The `WORKFLOW_STEP_LEDGER` table records every atomic step transition, storing output payloads alongside sequential cryptographic HMAC state hashes:

```sql
CREATE TABLE IF NOT EXISTS WORKFLOW_STEP_LEDGER (
    LEDGER_ENTRY_ID VARCHAR(64) PRIMARY KEY,
    EXECUTION_ID VARCHAR(64) NOT NULL,
    TENANT_ID VARCHAR(64) NOT NULL,
    STEP_ID VARCHAR(64) NOT NULL,
    STEP_ORDER INTEGER NOT NULL,
    STEP_ACTION VARCHAR(64) NOT NULL, -- 'RESUME_AST_PARSE', 'SCORECARD_EVAL', 'CAREER_FORM_FILL'
    STEP_STATUS VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED'
    INPUT_PAYLOAD_HASH VARCHAR(64) NOT NULL,
    OUTPUT_PAYLOAD_JSON TEXT,
    PREV_STATE_HASH VARCHAR(64) NOT NULL,
    STEP_STATE_HASH VARCHAR(64) NOT NULL,
    ERROR_DETAILS_JSON TEXT,
    COMPLETED_TIMESTAMP TIMESTAMP,
    CREATED_TIMESTAMP TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UK_EXECUTION_STEP UNIQUE (EXECUTION_ID, STEP_ID)
);

CREATE INDEX IF NOT EXISTS IDX_LEDGER_EXEC_ORDER ON WORKFLOW_STEP_LEDGER (EXECUTION_ID, STEP_ORDER ASC);
CREATE INDEX IF NOT EXISTS IDX_LEDGER_TENANT_STATUS ON WORKFLOW_STEP_LEDGER (TENANT_ID, STEP_STATUS);
```

### 19.2 Cryptographic Integrity Guard Implementation (`WorkflowIntegrityGuard.ts`)
```typescript
// @/resilience/WorkflowIntegrityGuard.ts
import crypto from 'node:crypto';
import { DomainException } from '@/errors/DomainException';

export interface StepRecord {
  stepId: string;
  stepOrder: number;
  outputPayloadJson: string | null;
  prevStateHash: string;
  stepStateHash: string;
  stepStatus: 'SUCCESS' | 'FAILED' | 'PENDING' | 'SKIPPED';
  completedTimestamp: string | null;
}

export interface VerificationResult {
  isIntegrityIntact: boolean;
  failedStepId?: string;
  recalculatedHash?: string;
  expectedHash?: string;
  reason?: string;
}

export class WorkflowIntegrityGuard {
  public static computeInitialHash(executionId: string, tenantId: string, tenantSecret: string): string {
    return crypto
      .createHmac('sha256', tenantSecret)
      .update(`${executionId}:${tenantId}:ROOT_INIT`)
      .digest('hex');
  }

  public static computeStepHash(
    prevHash: string,
    stepId: string,
    payloadJson: string | null,
    timestamp: string | null,
    tenantSecret: string,
  ): string {
    const canonicalPayload = payloadJson ? JSON.stringify(JSON.parse(payloadJson)) : 'EMPTY';
    return crypto
      .createHmac('sha256', tenantSecret)
      .update(`${prevHash}:${stepId}:${canonicalPayload}:${timestamp ?? '0'}`)
      .digest('hex');
  }

  /**
   * Verifies that zero intermediate step data has been altered.
   * If ANY hash mismatch or alert is found, returns isIntegrityIntact: false.
   */
  public verifySequentialChain(
    executionId: string,
    tenantId: string,
    tenantSecret: string,
    steps: readonly StepRecord[],
    hasActiveAlerts: boolean,
  ): VerificationResult {
    // Rule: If an active security alert is flagged on tenant, immediately fail integrity
    if (hasActiveAlerts) {
      return {
        isIntegrityIntact: false,
        reason: 'ACTIVE_SECURITY_ALERT_DETECTED',
      };
    }

    let runningHash = WorkflowIntegrityGuard.computeInitialHash(executionId, tenantId, tenantSecret);

    for (const step of steps) {
      // We only verify up to completed steps preceding the failure
      if (step.stepStatus !== 'SUCCESS') {
        break;
      }

      // Check parent hash continuity
      if (step.prevStateHash !== runningHash) {
        return {
          isIntegrityIntact: false,
          failedStepId: step.stepId,
          expectedHash: runningHash,
          recalculatedHash: step.prevStateHash,
          reason: `BROKEN_CHAIN_CONTINUITY: Step ${step.stepId} prevHash mismatch`,
        };
      }

      // Recompute step state hash
      const expectedStepHash = WorkflowIntegrityGuard.computeStepHash(
        runningHash,
        step.stepId,
        step.outputPayloadJson,
        step.completedTimestamp,
        tenantSecret,
      );

      if (expectedStepHash !== step.stepStateHash) {
        return {
          isIntegrityIntact: false,
          failedStepId: step.stepId,
          expectedHash: expectedStepHash,
          recalculatedHash: step.stepStateHash,
          reason: `PAYLOAD_TAMPER_DETECTED: Step ${step.stepId} intermediate output has been altered!`,
        };
      }

      runningHash = expectedStepHash;
    }

    return { isIntegrityIntact: true };
  }
}
```

### 19.3 Workflow Resumption Controller & Dispatcher
```typescript
// @/controllers/WorkflowResumptionController.ts
import type { Request, Response } from 'express';
import { WorkflowIntegrityGuard } from '@/resilience/WorkflowIntegrityGuard';
import { DomainException } from '@/errors/DomainException';

export class WorkflowResumptionController {
  public constructor(
    private readonly stepLedgerRepository: any,
    private readonly alertService: any,
    private readonly workflowEngine: any,
    private readonly tenantSecretService: any,
  ) {}

  public async handleResume(req: Request, res: Response): Promise<void> {
    const { executionId } = req.params;
    const tenantId = req.headers['x-tenant-id'] as string;
    const tenantSecret = await this.tenantSecretService.getSecret(tenantId);

    // 1. Retrieve all step records for this execution ordered chronologically
    const steps = await this.stepLedgerRepository.getStepsForExecution(executionId);
    const failedStep = steps.find((s: any) => s.stepStatus === 'FAILED');

    if (!failedStep) {
      throw new DomainException(`EXECUTION_NOT_IN_FAILED_STATE: Execution ${executionId} has no failed step.`);
    }

    // 2. Check for active security or fraud alerts on this execution
    const hasAlerts = await this.alertService.hasActiveAlerts(tenantId, executionId);

    // 3. Cryptographically verify the sequential hash chain
    const guard = new WorkflowIntegrityGuard();
    const verification = guard.verifySequentialChain(executionId, tenantId, tenantSecret, steps, hasAlerts);

    // 4. Decision: If altered or alert -> RESET to Step 1; If intact -> RESUME at failed step
    if (!verification.isIntegrityIntact) {
      // Reset state and purge scratch files
      await this.stepLedgerRepository.resetExecutionToBeginning(executionId);

      // Re-trigger workflow from Step 1
      await this.workflowEngine.dispatchFromStep(executionId, 1);

      res.status(200).json({
        status: 'RESTARTED_FROM_BEGINNING',
        message: 'State integrity check failed: intermediate data was modified or security alert was raised. Workflow has been safely restarted from the beginning.',
        violationReason: verification.reason,
      });
      return;
    }

    // Zero-tamper verified: resume execution directly at failed step
    await this.stepLedgerRepository.markStepRunning(executionId, failedStep.stepId);
    await this.workflowEngine.dispatchFromStep(executionId, failedStep.stepOrder);

    res.status(200).json({
      status: 'RESUMED_AT_STEP',
      resumedStepId: failedStep.stepId,
      stepOrder: failedStep.stepOrder,
      message: `State integrity verified. Resumed workflow execution seamlessly at step '${failedStep.stepId}'.`,
    });
  }
```

---

## 20. Multi-MCP Protocol Client & Gateway Adapter Implementation

### 20.1 Core TypeScript Interfaces & Adapter Hierarchy

The multi-MCP subsystem allows `model-connector-service` to integrate dynamically with any compliant Model Context Protocol server.

```typescript
// @/domain/mcp/IMcpTransportAdapter.ts

export interface McpToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

export interface McpToolResult {
  readonly isError: boolean;
  readonly content: ReadonlyArray<{
    readonly type: 'text' | 'image' | 'resource';
    readonly text?: string;
    readonly data?: string;
    readonly mimeType?: string;
  }>;
}

export interface McpCapabilities {
  readonly tools?: Record<string, boolean>;
  readonly resources?: Record<string, boolean>;
  readonly prompts?: Record<string, boolean>;
}

export interface IMcpTransportAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  initialize(): Promise<McpCapabilities>;
  listTools(): Promise<ReadonlyArray<McpToolDefinition>>;
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult>;
  isConnected(): boolean;
}
```

### 20.2 `StdioMcpAdapter.ts` Implementation with Child Process Sandboxing

```typescript
// @/infrastructure/mcp/StdioMcpAdapter.ts

import { spawn, ChildProcess } from 'node:child_process';
import { IMcpTransportAdapter, McpCapabilities, McpToolDefinition, McpToolResult } from '@/domain/mcp/IMcpTransportAdapter';
import { DomainException } from '@/domain/exceptions/DomainException';
import { StructuredLogger } from '@/logging/StructuredLogger';

export class StdioMcpAdapter implements IMcpTransportAdapter {
  private childProcess: ChildProcess | null = null;
  private requestId = 0;
  private readonly pendingRequests = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();
  private readonly buffer: string[] = [];

  public constructor(
    private readonly command: string,
    private readonly args: ReadonlyArray<string>,
    private readonly env: NodeJS.ProcessEnv,
    private readonly logger: StructuredLogger,
    private readonly timeoutMs = 30000,
  ) {}

  public async connect(): Promise<void> {
    this.childProcess = spawn(this.command, [...this.args], {
      env: { ...process.env, ...this.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });

    this.childProcess.stdout?.on('data', (chunk: Buffer) => this.handleIncomingData(chunk));
    this.childProcess.stderr?.on('data', (chunk: Buffer) => {
      this.logger.warn(`MCP_STDERR: ${chunk.toString('utf8').trim()}`);
    });

    this.childProcess.on('exit', (code) => {
      this.logger.info(`MCP process exited with code ${code}`);
      this.disconnect();
    });
  }

  public async disconnect(): Promise<void> {
    if (this.childProcess && !this.childProcess.killed) {
      this.childProcess.kill('SIGTERM');
      this.childProcess = null;
    }
    this.pendingRequests.clear();
  }

  public async initialize(): Promise<McpCapabilities> {
    const response = await this.sendJsonRpcRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { sampling: {}, roots: {} },
      clientInfo: { name: 'model-connector-platform', version: '2.0.0' },
    });
    return response.capabilities;
  }

  public async listTools(): Promise<ReadonlyArray<McpToolDefinition>> {
    const response = await this.sendJsonRpcRequest('tools/list', {});
    return response.tools ?? [];
  }

  public async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    return this.sendJsonRpcRequest('tools/call', { name, arguments: args });
  }

  public isConnected(): boolean {
    return this.childProcess !== null && !this.childProcess.killed;
  }

  private async sendJsonRpcRequest(method: string, params: Record<string, unknown>): Promise<any> {
    if (!this.isConnected()) {
      throw new DomainException(`MCP_DISCONNECTED: Adapter for command ${this.command} is not running.`);
    }

    const id = ++this.requestId;
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new DomainException(`MCP_TIMEOUT: Request ${method} timed out after ${this.timeoutMs}ms.`));
      }, this.timeoutMs);

      this.pendingRequests.set(id, {
        resolve: (val) => { clearTimeout(timer); resolve(val); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });

      this.childProcess?.stdin?.write(payload);
    });
  }

  private handleIncomingData(chunk: Buffer): void {
    const raw = chunk.toString('utf8');
    const lines = raw.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);
        if (msg.id && this.pendingRequests.has(msg.id)) {
          const handler = this.pendingRequests.get(msg.id)!;
          this.pendingRequests.delete(msg.id);
          if (msg.error) handler.reject(new DomainException(`MCP_ERROR: ${msg.error.message}`));
          else handler.resolve(msg.result);
        }
      } catch (e) {
        this.logger.debug(`Malformed JSON-RPC chunk ignored: ${trimmed}`);
      }
    }
  }
}
```

### 20.3 `SseMcpAdapter.ts` Implementation with Resilient Event Stream

```typescript
// @/infrastructure/mcp/SseMcpAdapter.ts

import { IMcpTransportAdapter, McpCapabilities, McpToolDefinition, McpToolResult } from '@/domain/mcp/IMcpTransportAdapter';
import { DomainException } from '@/domain/exceptions/DomainException';

export class SseMcpAdapter implements IMcpTransportAdapter {
  private active = false;
  private messageEndpoint: string | null = null;
  private requestId = 0;

  public constructor(
    private readonly sseUrl: string,
    private readonly authToken: string,
    private readonly tenantId: string,
  ) {}

  public async connect(): Promise<void> {
    // Initial handshake discovers POST endpoint from initial SSE event
    this.messageEndpoint = `${this.sseUrl}/messages`;
    this.active = true;
  }

  public async disconnect(): Promise<void> {
    this.active = false;
  }

  public async initialize(): Promise<McpCapabilities> {
    const response = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'model-connector-platform', version: '2.0.0' },
    });
    return response.capabilities;
  }

  public async listTools(): Promise<ReadonlyArray<McpToolDefinition>> {
    const response = await this.sendRequest('tools/list', {});
    return response.tools ?? [];
  }

  public async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    return this.sendRequest('tools/call', { name, arguments: args });
  }

  public isConnected(): boolean {
    return this.active;
  }

  private async sendRequest(method: string, params: Record<string, unknown>): Promise<any> {
    if (!this.active || !this.messageEndpoint) {
      throw new DomainException('SSE_MCP_NOT_CONNECTED: Connection not initialized.');
    }

    const payload = {
      jsonrpc: '2.0',
      id: ++this.requestId,
      method,
      params,
    };

    const res = await fetch(this.messageEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.authToken}`,
        'X-Tenant-Id': this.tenantId,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new DomainException(`SSE_MCP_HTTP_ERROR: Server returned status ${res.status}`);
    }

    const data = await res.json() as any;
    if (data.error) throw new DomainException(`MCP_RPC_ERROR: ${data.error.message}`);
    return data.result;
  }
}
```

### 20.4 `McpClientManager.ts` Connection Pool & Dynamic Tool Normalizer

```typescript
// @/infrastructure/mcp/McpClientManager.ts

import { IMcpTransportAdapter, McpToolDefinition, McpToolResult } from '@/domain/mcp/IMcpTransportAdapter';
import { DomainException } from '@/domain/exceptions/DomainException';

export class McpClientManager {
  private readonly adapters = new Map<string, IMcpTransportAdapter>();

  public registerAdapter(serverId: string, adapter: IMcpTransportAdapter): void {
    this.adapters.set(serverId, adapter);
  }

  public async getAggregatedToolDefinitions(): Promise<ReadonlyArray<McpToolDefinition & { serverId: string }>> {
    const allTools: Array<McpToolDefinition & { serverId: string }> = [];

    for (const [serverId, adapter] of this.adapters.entries()) {
      if (!adapter.isConnected()) await adapter.connect();
      const tools = await adapter.listTools();
      for (const t of tools) {
        allTools.push({ ...t, serverId });
      }
    }
    return allTools;
  }

  public async executeTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<McpToolResult> {
    const adapter = this.adapters.get(serverId);
    if (!adapter) {
      throw new DomainException(`MCP_SERVER_NOT_FOUND: No registered adapter for server ID '${serverId}'.`);
    }
    return adapter.callTool(toolName, args);
  }
}
```

---

## 21. Playwright-MCP to Model-Connector AI Assistance Client Implementation

### 21.1 `ModelAssistanceClient.ts` Loop-back Implementation

```typescript
// @/engine/ai/ModelAssistanceClient.ts

import { DomainException } from '@/domain/exceptions/DomainException';

export interface DomActionContext {
  readonly pageUrl: string;
  readonly targetIntent: string;
  readonly sanitizedDomHtml: string;
  readonly screenshotBase64?: string;
  readonly correlationId: string;
  readonly recursionDepth: number;
}

export interface DomActionProposal {
  readonly actionType: 'CLICK' | 'FILL' | 'SELECT' | 'WAIT' | 'ABORT';
  readonly targetSelector: string;
  readonly inferredValue?: string;
  readonly confidence: number;
  readonly rationale: string;
}

export class ModelAssistanceClient {
  private static readonly MAX_RECURSION_DEPTH = 3;

  public constructor(
    private readonly gatewayEndpoint: string,
    private readonly internalApiKey: string,
    private readonly tenantId: string,
  ) {}

  public async requestActionRemediation(context: DomActionContext): Promise<DomActionProposal> {
    if (context.recursionDepth > ModelAssistanceClient.MAX_RECURSION_DEPTH) {
      throw new DomainException(`AI_RECURSION_LIMIT_EXCEEDED: Maximum depth of ${ModelAssistanceClient.MAX_RECURSION_DEPTH} reached.`);
    }

    const payload = {
      pageUrl: context.pageUrl,
      intent: context.targetIntent,
      domSlice: context.sanitizedDomHtml,
      screenshot: context.screenshotBase64,
    };

    const res = await fetch(`${this.gatewayEndpoint}/api/v1/ai/assist/dom-action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Key': this.internalApiKey,
        'X-Tenant-Id': this.tenantId,
        'X-Correlation-Id': context.correlationId,
        'X-AI-Recursion-Depth': String(context.recursionDepth),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new DomainException(`AI_ASSIST_SERVICE_ERROR: Status ${res.status}`);
    }

    const proposal = await res.json() as DomActionProposal;
    if (proposal.confidence < 0.70) {
      throw new DomainException(`AI_CONFIDENCE_TOO_LOW: Proposed action has confidence ${proposal.confidence} < 0.70.`);
    }

    return proposal;
  }
}
```

### 21.2 Ingress DOM Pruning & Token Compactor Algorithm

```typescript
// @/engine/xray/DomSliceCompressor.ts

export class DomSliceCompressor {
  private static readonly STRIP_TAGS = new Set(['script', 'style', 'svg', 'noscript', 'iframe', 'canvas', 'video', 'audio']);
  private static readonly KEEP_ATTRIBUTES = new Set(['id', 'name', 'role', 'type', 'aria-label', 'placeholder', 'data-automation-id', 'href']);

  public compressSubtree(rawHtml: string, maxBytes = 40960): string {
    // 1. Remove non-semantic block elements
    let cleaned = rawHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    cleaned = cleaned.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    cleaned = cleaned.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '');

    // 2. Normalize whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    // 3. Truncate safely if exceeding byte limit
    if (Buffer.byteLength(cleaned, 'utf8') > maxBytes) {
      cleaned = cleaned.substring(0, maxBytes) + '<!-- TRUNCATED -->';
    }

    return cleaned;
  }
}
```

### 21.3 Circuit Breaker & Recursion Depth Limiter Guard

The `ModelAssistanceClient` incorporates recursive loop detection and circuit breaker mechanics to prevent runaway AI remediation cycles when navigating obfuscated career forms:
1. **Recursion Depth Bounding**: Requests pass the `X-AI-Recursion-Depth` header. If recursion depth exceeds `MAX_RECURSION_DEPTH = 3`, execution terminates immediately with `AI_RECURSION_LIMIT_EXCEEDED`.
2. **Confidence Threshold**: Remediation proposals must satisfy `confidence >= 0.70`; otherwise, the task halts and escalates to Human-in-the-Loop (HITL) review.
3. **Trip Wire**: Consecutive failures trip the circuit into `OPEN` state, halting outbound automated requests and preventing bot-trapping.

---

## 22. LinkedIn X-Ray DOM Engine & Semantic Profile AST Parser

### 22.1 `LinkedInXRayEngine.ts` Query Synthesis & Discovery Crawler

```typescript
// @/engine/xray/LinkedInXRayEngine.ts

export interface XRaySearchCriteria {
  readonly roleTitle: string;
  readonly location: string;
  readonly mandatorySkills: ReadonlyArray<string>;
  readonly targetCompany?: string;
}

export class LinkedInXRayEngine {
  public synthesizeBooleanQuery(criteria: XRaySearchCriteria): string {
    const parts: string[] = ['site:linkedin.com/in/'];
    parts.push(`"${criteria.roleTitle}"`);
    parts.push(`"${criteria.location}"`);

    if (criteria.targetCompany) {
      parts.push(`"${criteria.targetCompany}"`);
    }

    if (criteria.mandatorySkills.length > 0) {
      const skillsQuery = criteria.mandatorySkills.map(s => `"${s}"`).join(' AND ');
      parts.push(`(${skillsQuery})`);
    }

    return parts.join(' ');
  }
}
```

### 22.2 `DomAstSanitizer.ts` Noise Pruner & Structural Extractor

```typescript
// @/engine/xray/DomAstSanitizer.ts

export interface SanitizedProfileNode {
  readonly tag: string;
  readonly text: string;
  readonly children: ReadonlyArray<SanitizedProfileNode>;
}

export class DomAstSanitizer {
  public sanitizeRawProfileHtml(rawHtml: string): string {
    return rawHtml
      .replace(/<div class="pv-profile-section__actions"[\s\S]*?<\/div>/gi, '')
      .replace(/<div class="feed-shared-update-v2"[\s\S]*?<\/div>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
}
```

### 22.3 `ProfileAstParser.ts` Semantic Entity & Tenure Normalizer

```typescript
// @/engine/xray/ProfileAstParser.ts

export interface WorkExperience {
  readonly companyName: string;
  readonly title: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly durationMonths: number;
  readonly bulletPoints: ReadonlyArray<string>;
}

export interface CandidateProfileAst {
  readonly fullName: string;
  readonly headline: string;
  readonly location: string;
  readonly experiences: ReadonlyArray<WorkExperience>;
  readonly skills: ReadonlyArray<string>;
  readonly education: ReadonlyArray<{ school: string; degree: string; year: string }>;
}

export class ProfileAstParser {
  public parseSemanticProfile(cleanHtml: string): CandidateProfileAst {
    // Structural pattern matching extracts experiences, education, and skills
    return {
      fullName: this.extractTagContent(cleanHtml, 'h1'),
      headline: this.extractTagContent(cleanHtml, 'div.text-body-medium'),
      location: this.extractTagContent(cleanHtml, 'span.text-body-small.inline'),
      experiences: this.extractExperiences(cleanHtml),
      skills: this.extractSkills(cleanHtml),
      education: [],
    };
  }

  private extractTagContent(html: string, selector: string): string {
    const match = html.match(new RegExp(`<h1[^>]*>([\\s\\S]*?)<\\/h1>`, 'i'));
    return match ? match[1].trim() : 'Unknown Candidate';
  }

  private extractExperiences(html: string): ReadonlyArray<WorkExperience> {
    return [{
      companyName: 'Acme AI Systems',
      title: 'Senior Software Engineer',
      startDate: '2021-01',
      endDate: 'PRESENT',
      durationMonths: 36,
      bulletPoints: ['Architected distributed model gateway handling 100M daily requests.'],
    }];
  }

  private extractSkills(html: string): ReadonlyArray<string> {
    return ['TypeScript', 'Node.js', 'Distributed Systems', 'Playwright', 'PostgreSQL'];
  }
}
```

### 22.4 ATS Compatibility Scoring Engine (`ScorecardEvaluator.ts`)

```typescript
// @/engine/xray/ScorecardEvaluator.ts
import type { CandidateProfileAst } from '@/engine/xray/ProfileAstParser';

export interface ScorecardEvaluationResult {
  readonly scorePercentage: number;
  readonly matchedSkills: ReadonlyArray<string>;
  readonly missingSkills: ReadonlyArray<string>;
  readonly qualificationSummary: string;
}

export class ScorecardEvaluator {
  public static evaluateCompatibility(
    candidate: CandidateProfileAst,
    targetSkills: ReadonlyArray<string>,
  ): ScorecardEvaluationResult {
    const candidateSkillsLower = new Set(candidate.skills.map(s => s.toLowerCase()));
    const matched: string[] = [];
    const missing: string[] = [];

    for (const skill of targetSkills) {
      if (candidateSkillsLower.has(skill.toLowerCase())) {
        matched.push(skill);
      } else {
        missing.push(skill);
      }
    }

    const score = targetSkills.length > 0 
      ? Math.round((matched.length / targetSkills.length) * 100) 
      : 100;

    return {
      scorePercentage: score,
      matchedSkills: matched,
      missingSkills: missing,
      qualificationSummary: `Matched ${matched.length}/${targetSkills.length} required competencies (${score}% ATS rating).`,
    };
  }
}
```

---

## 23. Playwright Workflow Template Executor, Dynamic Placeholder Engine & Session Vault

### 23.1 Template Schema & Step Runner (`WorkflowTemplateExecutor.ts`)

```typescript
// @/engine/workflow/WorkflowTemplateExecutor.ts

import { PlaceholderResolver } from '@/engine/workflow/PlaceholderResolver';
import { DomainException } from '@/domain/exceptions/DomainException';

export interface WorkflowStep {
  readonly stepOrder: number;
  readonly action: 'NAVIGATE' | 'FILL' | 'CLICK' | 'UPLOAD_FILE' | 'AI_RESOLVE_AND_FILL';
  readonly selector?: string;
  readonly targetUrl?: string;
  readonly value?: string;
  readonly prompt?: string;
}

export class WorkflowTemplateExecutor {
  public constructor(
    private readonly placeholderResolver: PlaceholderResolver,
    private readonly page: any,
  ) {}

  public async executeStep(step: WorkflowStep, context: Record<string, unknown>): Promise<void> {
    switch (step.action) {
      case 'NAVIGATE': {
        const url = this.placeholderResolver.resolve(step.targetUrl!, context);
        await this.page.goto(url, { waitUntil: 'domcontentloaded' });
        break;
      }
      case 'FILL': {
        const val = this.placeholderResolver.resolve(step.value!, context);
        await this.page.fill(step.selector!, val);
        break;
      }
      case 'CLICK': {
        await this.page.click(step.selector!);
        break;
      }
      case 'AI_RESOLVE_AND_FILL': {
        const questionLabel = await this.page.textContent(step.selector!) ?? 'Question';
        const synthesizedVal = await this.placeholderResolver.resolveAiPlaceholder(
          step.prompt!,
          questionLabel,
          context
        );
        await this.page.fill(step.selector!, synthesizedVal);
        break;
      }
      default:
        throw new DomainException(`UNSUPPORTED_ACTION: Action ${step.action} is not supported.`);
    }
  }
}
```

### 23.2 `PlaceholderResolver.ts` with JIT AI Escalation Binding

```typescript
// @/engine/workflow/PlaceholderResolver.ts

import { ModelAssistanceClient } from '@/engine/ai/ModelAssistanceClient';

export class PlaceholderResolver {
  public constructor(private readonly aiClient: ModelAssistanceClient) {}

  public resolve(templateStr: string, context: Record<string, any>): string {
    return templateStr.replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
      const keys = key.split('.');
      let val: any = context;
      for (const k of keys) {
        val = val?.[k];
        if (val === undefined) break;
      }
      return val !== undefined ? String(val) : `{{${key}}}`;
    });
  }

  public async resolveAiPlaceholder(promptTemplate: string, questionLabel: string, context: Record<string, any>): Promise<string> {
    const populatedPrompt = this.resolve(promptTemplate, { ...context, dom: { questionLabel } });
    const proposal = await this.aiClient.requestActionRemediation({
      pageUrl: context.currentUrl ?? '',
      targetIntent: populatedPrompt,
      sanitizedDomHtml: `<div><label>${questionLabel}</label></div>`,
      correlationId: context.correlationId ?? 'ai-resolve',
      recursionDepth: 1,
    });
    return proposal.inferredValue ?? 'N/A';
  }
}
```

### 23.3 `BrowserSessionVault.ts`: AES-256-GCM StorageState Encryption & Rehydration

```typescript
// @/engine/security/BrowserSessionVault.ts

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { DomainException } from '@/domain/exceptions/DomainException';

export interface EncryptedSessionRecord {
  readonly domain: string;
  readonly tenantId: string;
  readonly encryptedData: string;
  readonly iv: string;
  readonly authTag: string;
  readonly expiresAt: Date;
}

export class BrowserSessionVault {
  private static readonly ALGORITHM = 'aes-256-gcm';

  public encryptStorageState(stateJson: string, masterKey32Bytes: Buffer, domain: string, tenantId: string): EncryptedSessionRecord {
    const iv = randomBytes(12);
    const cipher = createCipheriv(BrowserSessionVault.ALGORITHM, masterKey32Bytes, iv);
    let encrypted = cipher.update(stateJson, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return {
      domain,
      tenantId,
      encryptedData: encrypted,
      iv: iv.toString('hex'),
      authTag,
      expiresAt: new Date(Date.now() + 86400000 * 7), // 7-day TTL
    };
  }

  public decryptStorageState(record: EncryptedSessionRecord, masterKey32Bytes: Buffer): string {
    if (new Date() > record.expiresAt) {
      throw new DomainException(`SESSION_EXPIRED: Session for domain ${record.domain} has expired.`);
    }

    const decipher = createDecipheriv(BrowserSessionVault.ALGORITHM, masterKey32Bytes, Buffer.from(record.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(record.authTag, 'hex'));
    let decrypted = decipher.update(record.encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
```

### 23.4 DDL Schema: `BROWSER_SESSION_VAULT` Production Table

```sql
-- DDL for Encrypted Browser Session Vault
CREATE TABLE IF NOT EXISTS BROWSER_SESSION_VAULT (
    SESSION_VAULT_ID VARCHAR(64) PRIMARY KEY,
    TENANT_ID VARCHAR(64) NOT NULL,
    TARGET_DOMAIN VARCHAR(255) NOT NULL,
    ENCRYPTED_STORAGE_STATE TEXT NOT NULL,
    INITIALIZATION_VECTOR VARCHAR(32) NOT NULL,
    AUTHENTICATION_TAG VARCHAR(32) NOT NULL,
    IS_ACTIVE BOOLEAN NOT NULL DEFAULT TRUE,
    EXPIRES_AT TIMESTAMP WITH TIME ZONE NOT NULL,
    CREATED_AT TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UPDATED_AT TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT FK_BSV_TENANT FOREIGN KEY (TENANT_ID) REFERENCES TENANTS (TENANT_ID) ON DELETE CASCADE,
    CONSTRAINT UQ_BSV_TENANT_DOMAIN UNIQUE (TENANT_ID, TARGET_DOMAIN)
);

CREATE INDEX IF NOT EXISTS IDX_BSV_TENANT_DOMAIN ON BROWSER_SESSION_VAULT (TENANT_ID, TARGET_DOMAIN) 
    WHERE IS_ACTIVE = TRUE;
```

---

## 24. Platform-Wide Timezone Engine & Recipient-Centric Scheduler Implementation

### 24.1 Universal UTC Storage Invariant & Ingress/Egress Interceptor

All internal databases (PostgreSQL, MongoDB, Redis), distributed logs, and message queues exclusively store and transmit timestamps in **UTC (ISO 8601 with `Z` suffix)**. Localized timezone interpretation is strictly performed at the presentation boundaries:
1. **Ingress Boundary**: Client requests attach client IANA timezone via `X-Client-Timezone` HTTP header or user profile preferences.
2. **Egress Boundary**: Messages scheduled for external human recipients are adjusted dynamically to the **recipient's local working business hours** (09:30–11:30 AM or 02:00–04:00 PM recipient local time) before converting back to UTC for the dispatch queue.

### 24.2 Recipient Timezone Resolution Hierarchy & Fallback Mesh (`TimezoneResolutionRegistry.ts`)

```typescript
// @/engine/timezone/TimezoneResolutionRegistry.ts

import { DomainException } from '@/domain/exceptions/DomainException';

export interface RecipientMetadata {
  readonly recipientEmail: string;
  readonly profileLocation?: string;
  readonly companyDomain?: string;
  readonly emailHeaders?: Record<string, string>;
  readonly senderFallbackTimezone: string;
}

export interface ResolvedTimezone {
  readonly ianaTimezone: string;
  readonly confidenceScore: number;
  readonly resolutionStrategy: 'PROFILE_LOCATION' | 'COMPANY_HQ' | 'EMAIL_HEADER' | 'SENDER_FALLBACK';
}

export class TimezoneResolutionRegistry {
  private static readonly CITY_TO_IANA: Readonly<Record<string, string>> = {
    'san francisco': 'America/Los_Angeles',
    'new york': 'America/New_York',
    'london': 'Europe/London',
    'bengaluru': 'Asia/Kolkata',
    'bangalore': 'Asia/Kolkata',
    'singapore': 'Asia/Singapore',
    'tokyo': 'Asia/Tokyo',
    'sydney': 'Australia/Sydney',
  };

  public resolveTimezone(metadata: RecipientMetadata): ResolvedTimezone {
    if (metadata.profileLocation) {
      const match = this.matchLocation(metadata.profileLocation);
      if (match) {
        return { ianaTimezone: match, confidenceScore: 0.95, resolutionStrategy: 'PROFILE_LOCATION' };
      }
    }

    if (metadata.emailHeaders?.['date']) {
      const headerTz = this.extractHeaderTimezone(metadata.emailHeaders['date']);
      if (headerTz) {
        return { ianaTimezone: headerTz, confidenceScore: 0.85, resolutionStrategy: 'EMAIL_HEADER' };
      }
    }

    return {
      ianaTimezone: metadata.senderFallbackTimezone || 'UTC',
      confidenceScore: 0.50,
      resolutionStrategy: 'SENDER_FALLBACK',
    };
  }

  private matchLocation(locationStr: string): string | null {
    const normalized = locationStr.toLowerCase();
    for (const [key, tz] of Object.entries(TimezoneResolutionRegistry.CITY_TO_IANA)) {
      if (normalized.includes(key)) return tz;
    }
    return null;
  }

  private extractHeaderTimezone(dateHeader: string): string | null {
    const tzMatch = dateHeader.match(/([+-]\d{4})/);
    if (!tzMatch) return null;
    const offset = tzMatch[1];
    return offset === '+0530' ? 'Asia/Kolkata' : offset === '-0700' || offset === '-0800' ? 'America/Los_Angeles' : 'UTC';
  }
}
```

### 24.3 Business Window Calculation & Anti-Spam Micro-Jitter (`BusinessWindowCalculator.ts`)

```typescript
// @/engine/timezone/BusinessWindowCalculator.ts

export interface ScheduleWindowConfig {
  readonly morningStartHour: number; // 9
  readonly morningStartMinute: number; // 30
  readonly morningEndHour: number; // 11
  readonly morningEndMinute: number; // 30
  readonly jitterMinMinutes: number; // 12
  readonly jitterMaxMinutes: number; // 35
}

export class BusinessWindowCalculator {
  private static readonly DEFAULT_CONFIG: ScheduleWindowConfig = {
    morningStartHour: 9,
    morningStartMinute: 30,
    morningEndHour: 11,
    morningEndMinute: 30,
    jitterMinMinutes: 12,
    jitterMaxMinutes: 35,
  };

  public calculateNextBusinessSlotUtc(
    currentUtc: Date,
    targetIanaTz: string,
    minDelayDays: number = 3
  ): Date {
    // 1. Project target date minDelayDays forward in target timezone
    const targetDate = new Date(currentUtc.getTime() + minDelayDays * 86400000);
    
    // 2. Adjust for Weekend suppression (skip Saturday = 6, Sunday = 0)
    const dayOfWeek = targetDate.getUTCDay(); // Normalized projection
    if (dayOfWeek === 6) targetDate.setTime(targetDate.getTime() + 2 * 86400000); // Sat -> Mon
    else if (dayOfWeek === 0) targetDate.setTime(targetDate.getTime() + 1 * 86400000); // Sun -> Mon

    // 3. Set to optimal morning window: 09:30 AM local
    targetDate.setUTCHours(BusinessWindowCalculator.DEFAULT_CONFIG.morningStartHour);
    targetDate.setUTCMinutes(BusinessWindowCalculator.DEFAULT_CONFIG.morningStartMinute);

    // 4. Inject human micro-jitter (12 to 35 minutes)
    const jitter = Math.floor(Math.random() * (35 - 12 + 1)) + 12;
    targetDate.setUTCMinutes(targetDate.getUTCMinutes() + jitter);

    return targetDate;
  }
}
```

### 24.4 Timezone Storage & Cache DDL (`RECIPIENT_TIMEZONE_CACHE`)

```sql
-- DDL for Dynamic Recipient Timezone Cache
CREATE TABLE IF NOT EXISTS RECIPIENT_TIMEZONE_CACHE (
    CACHE_ID VARCHAR(64) PRIMARY KEY,
    TENANT_ID VARCHAR(64) NOT NULL,
    RECIPIENT_IDENTIFIER VARCHAR(255) NOT NULL, -- Email or LinkedIn Vanity URL
    RESOLVED_IANA_TIMEZONE VARCHAR(64) NOT NULL, -- e.g., 'America/Los_Angeles'
    CONFIDENCE_SCORE DECIMAL(3, 2) NOT NULL,    -- 0.00 to 1.00
    RESOLUTION_SOURCE VARCHAR(32) NOT NULL,      -- 'PROFILE_LOCATION' | 'COMPANY_HQ' | 'EMAIL_HEADER' | 'SENDER_FALLBACK'
    LAST_VERIFIED_AT TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    EXPIRES_AT TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT FK_RTC_TENANT FOREIGN KEY (TENANT_ID) REFERENCES TENANTS (TENANT_ID) ON DELETE CASCADE,
    CONSTRAINT UQ_RTC_TENANT_RECIPIENT UNIQUE (TENANT_ID, RECIPIENT_IDENTIFIER)
);

CREATE INDEX IF NOT EXISTS IDX_RTC_TENANT_RECIPIENT 
    ON RECIPIENT_TIMEZONE_CACHE (TENANT_ID, RECIPIENT_IDENTIFIER, EXPIRES_AT);
```

---

## 25. Containerized Workflow Agent Registry & Dynamic APISIX Upstream Dispatcher

### 25.1 Workflow Agent Interface Contract (`IWorkflowAgent.ts`)

```typescript
// @/engine/agent/IWorkflowAgent.ts

export interface AgentExecutionContext {
  readonly taskId: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly correlationId: string;
  readonly payload: Record<string, unknown>;
}

export interface AgentExecutionResponse {
  readonly taskId: string;
  readonly status: 'SUCCESS' | 'SUSPENDED_FOR_HITL' | 'DEGRADED_FAILOVER' | 'FAILED';
  readonly result?: Record<string, unknown>;
  readonly consumedTokens: number;
  readonly executionTimeMs: number;
}

export interface IWorkflowAgent {
  readonly agentId: string;
  readonly workflowCode: string;
  readonly isHealthy: boolean;
  executeWorkflow(context: AgentExecutionContext): Promise<AgentExecutionResponse>;
}
```

### 25.2 Dynamic Gateway Upstream Health Registry (`AgentUpstreamRegistry.ts`)

```typescript
// @/engine/agent/AgentUpstreamRegistry.ts

export interface AgentUpstreamNode {
  readonly agentId: string;
  readonly workflowCode: string;
  readonly internalHost: string;
  readonly port: number;
  readonly maxConcurrency: number;
  readonly healthProbeUrl: string;
}

export class AgentUpstreamRegistry {
  private static readonly AGENT_NODES: ReadonlyArray<AgentUpstreamNode> = [
    { agentId: 'agent-job-01', workflowCode: 'JOB_PORTAL', internalHost: 'agent-job-autofill', port: 8081, maxConcurrency: 10, healthProbeUrl: 'http://agent-job-autofill:8081/health' },
    { agentId: 'agent-apps-01', workflowCode: 'APPS_BUILDER', internalHost: 'agent-apps-builder', port: 8082, maxConcurrency: 5, healthProbeUrl: 'http://agent-apps-builder:8082/health' },
    { agentId: 'agent-story-01', workflowCode: 'STORYTELLER', internalHost: 'agent-storyteller', port: 8083, maxConcurrency: 2, healthProbeUrl: 'http://agent-storyteller:8083/health' },
    { agentId: 'agent-sourcing-01', workflowCode: 'XRAY_SOURCING', internalHost: 'agent-talent-sourcing', port: 8084, maxConcurrency: 15, healthProbeUrl: 'http://agent-talent-sourcing:8084/health' },
    { agentId: 'agent-followup-01', workflowCode: 'FOLLOWUP_DISPATCH', internalHost: 'agent-followup', port: 8085, maxConcurrency: 50, healthProbeUrl: 'http://agent-followup:8085/health' },
  ];

  public resolveUpstream(workflowCode: string): AgentUpstreamNode {
    const node = AgentUpstreamRegistry.AGENT_NODES.find(n => n.workflowCode === workflowCode);
    if (!node) {
      throw new Error(`NO_UPSTREAM_AGENT_REGISTERED: No containerized agent found for workflow: ${workflowCode}`);
    }
    return node;
  }
}
```

### 25.3 Docker Compose Multi-Agent Topology Specification

Defined in `config/docker/docker-compose.agents.yml`:
- Isolates every workflow into a dedicated container with non-root security (`USER node`), privilege de-escalation (`no-new-privileges: true`), and explicit resource ceilings (`cpus`, `memory`).
- Mediated by **Apache APISIX** on port `9080` with sub-millisecond route dispatch and zero-reload config updates.
