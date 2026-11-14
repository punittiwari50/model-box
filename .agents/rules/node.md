# ENTERPRISE ENGINEERING INSTRUCTIONS
## Declarative Playwright Automation Platform

**Document:** `AGENT_ENGINEERING_STANDARDS.md`  
**Purpose:** Mandatory engineering instructions for AI agents, developers and automated code-generation systems.  
**Technology:** TypeScript, Node.js, Playwright, SCSS, Docker  
**Architecture:** OOP, SOLID, DI, Design Patterns, Distributed Systems  
**Automation Model:** Declarative templates + TypeScript execution runtime

---

# 1. PRIMARY OBJECTIVE

Build a modular, reusable, secure, scalable and enterprise-grade automation platform using TypeScript and Playwright.

The platform must support:

- Declarative YAML/JSON workflow templates.
- Centralized TypeScript workflow execution.
- Reusable Playwright action handlers.
- Multiple independent users and concurrent executions.
- User-specific profiles and securely resolved credentials.
- Portal-specific adapters.
- Human-in-the-loop approval.
- Enterprise-grade logging, tracing and monitoring.
- Fault tolerance, circuit breakers and controlled retries.
- Containerized execution with Docker.
- Maintainable and testable OOP architecture.

## Mandatory Engineering Principles

1. Follow SOLID principles.
2. Prefer composition over inheritance.
3. Apply Dependency Injection.
4. Use suitable design patterns instead of procedural branching.
5. Separate business logic, infrastructure and presentation.
6. Implement secure multi-tenant execution isolation.
7. Optimize for time complexity, space complexity and concurrency.
8. Avoid unnecessary abstractions and overengineering.
9. Use current stable language and library features.
10. Prefer readable, concise and maintainable implementations.

**All application, runtime, automation, testing and backend implementation code MUST be written in TypeScript.**

Exceptions:
- SCSS is permitted for styling.
- YAML/JSON are permitted for declarative configuration and workflow templates.
- Dockerfiles and Docker Compose files are permitted for infrastructure configuration.
- Markdown is permitted for documentation.
- Do not introduce Python, JavaScript or another programming language for application or automation implementation.

# 2. TECHNOLOGY AND LANGUAGE STANDARDS

## 2.1 TypeScript

- Enable strict TypeScript mode.
- Enable `noImplicitAny`.
- Enable `strictNullChecks`.
- Enable `noUncheckedIndexedAccess`.
- Enable `exactOptionalPropertyTypes`.
- Avoid `any`; use `unknown` with explicit narrowing.
- Prefer interfaces for contracts and types for unions.
- Use discriminated unions for action definitions.
- Prefer immutable data structures and readonly properties.
- Use `satisfies` for compile-time configuration validation where appropriate.
- Prefer async/await for asynchronous operations.
- Use AbortSignal for cancellation where supported.
- Avoid unnecessary type assertions.
- Avoid non-null assertions.
- Avoid unsafe type casting.
- Define explicit return types for public methods.

## 2.2 Latest Language Features

Before implementation:

1. Verify the current stable Node.js LTS version.
2. Verify the supported stable TypeScript version.
3. Check official Playwright API documentation.
4. Use stable ECMAScript and TypeScript capabilities.
5. Avoid experimental, deprecated or unsupported APIs.
6. Avoid APIs that are scheduled for removal.
7. Verify library compatibility before upgrading dependencies.

Do not introduce experimental decorators, unstable APIs or unsupported runtime features without explicit architectural approval.

# 3. IMPORT AND MODULE CONVENTIONS

## Mandatory Import Rule

Never use relative imports:

- `./`
- `../`
- `../../`

Use the configured `@/` alias for application imports.

### Anti-pattern

```typescript
import { BrowserManager } from "../browser/browser-manager";
import { Logger } from "../../core/logger";
import { UserProfile } from "./user-profile";
```

### Preferred implementation

```typescript
import { BrowserManager } from "@/browser/browser-manager";
import { Logger } from "@/core/logging/logger";
import { UserProfile } from "@/users/models/user-profile";
```

Requirements:

- Configure `@/*` consistently in TypeScript and the runtime/build system.
- Ensure tests and production execution resolve the same aliases.
- Avoid circular dependencies.
- Keep package boundaries explicit.
- Avoid deep imports into another package's internal implementation.
- Export public APIs through package entry points.

# 4. ENTERPRISE ARCHITECTURE

Use a modular, loosely coupled, layered architecture.

Recommended architecture:

```text
src/
├── core/
│   ├── configuration/
│   ├── logging/
│   ├── exceptions/
│   ├── contracts/
│   ├── constants/
│   ├── utils/
│   ├── events/
│   └── observability/
│
├── application/
│   ├── workflows/
│   ├── services/
│   ├── orchestration/
│   └── approval/
│
├── domain/
│   ├── models/
│   ├── entities/
│   ├── value-objects/
│   └── policies/
│
├── infrastructure/
│   ├── browser/
│   ├── secrets/
│   ├── storage/
│   ├── messaging/
│   └── persistence/
│
├── automation/
│   ├── actions/
│   ├── handlers/
│   ├── registries/
│   ├── templates/
│   └── portals/
│
├── presentation/
│   ├── controllers/
│   └── components/
│
└── bootstrap/
    ├── container.ts
    └── application.ts
```

## Architecture Responsibilities

| Layer | Responsibility |
|---|---|
| Core | Shared contracts, logging, exceptions and utilities |
| Domain | Business entities and rules |
| Application | Workflow orchestration and use cases |
| Infrastructure | Browser, secrets, storage and external services |
| Automation | Playwright actions and portal adapters |
| Presentation | API and user-facing components |
| Bootstrap | Dependency registration and application startup |

Rules:

- Domain must not depend on infrastructure.
- Application must depend on abstractions.
- Infrastructure implements application/domain-facing contracts.
- Presentation must not contain business logic.
- Browser implementation must not leak into domain entities.
- Keep the dependency direction consistent.
- Avoid circular dependencies between modules.

# 5. OOP, SOLID AND DEPENDENCY INJECTION

## Mandatory Principles

### Single Responsibility Principle
A class must have one clearly defined responsibility.

### Open/Closed Principle
Support extension through interfaces, strategies and registered implementations rather than modifying existing core logic.

### Liskov Substitution Principle
Implementations must remain interchangeable without breaking expected behavior.

### Interface Segregation Principle
Prefer small, focused interfaces over large interfaces.

### Dependency Inversion Principle
Depend on abstractions, not concrete infrastructure implementations.

## Dependency Injection

- Register dependencies centrally.
- Use constructor injection.
- Prefer explicit dependencies over hidden global state.
- Avoid service locator patterns throughout business logic.
- Define lifecycle scopes.
- Ensure request-scoped and execution-scoped objects are isolated.
- Dispose resources correctly.

### Anti-pattern

```typescript
class JobWorkflow {
  private browser = new BrowserManager();
  private logger = new ConsoleLogger();
  private secrets = new AzureSecretProvider();
}
```

Problems:
- Tight coupling.
- Difficult unit testing.
- Hidden dependencies.
- Difficult implementation replacement.
- Uncontrolled object lifecycle.

### Preferred implementation

```typescript
interface JobWorkflowDependencies {
  browserManager: BrowserManager;
  logger: Logger;
  secretProvider: SecretProvider;
}

class JobWorkflow {
  constructor(
    private readonly dependencies: JobWorkflowDependencies
  ) {}

  async execute(userId: string): Promise<void> {
    this.dependencies.logger.info(
      "Job workflow started",
      { userId }
    );
  }
}
```

# 6. DESIGN PATTERNS

Prefer established design patterns where they solve actual architectural problems.

| Design Pattern | Application |
|---|---|
| Strategy | Portal-specific behavior and retry policies |
| Factory | Browser and portal creation |
| Abstract Factory | Related browser and provider implementations |
| Registry | Playwright action resolution |
| Adapter | External portal and service integration |
| Builder | Complex workflow construction |
| Observer | Workflow lifecycle events |
| Command | Individual automation actions |
| Template Method | Common workflow lifecycle |
| Decorator | Logging, metrics and execution policies |
| Chain of Responsibility | Validation and middleware pipelines |
| State | Workflow execution lifecycle |
| Repository | Persistence abstraction |
| Circuit Breaker | Fault isolation |
| Saga | Multi-step distributed workflows |
| Specification | Reusable business validation |

Rules:

- Do not introduce a pattern without a clear requirement.
- Avoid unnecessary inheritance hierarchies.
- Prefer composition and small interfaces.
- Avoid creating duplicate factories or registries.
- Keep patterns consistent throughout the application.

# 7. AVOID EXCESSIVE CONDITIONAL BRANCHING

Avoid large `if`, `if...else` and `switch` structures for action selection, portal selection and business behavior.

Use:
- Strategy Pattern.
- Registry Pattern.
- Factory Pattern.
- Discriminated unions.
- Polymorphism.
- Specification Pattern.

### Anti-pattern

```typescript
async function executeAction(action: string) {
  if (action === "navigate") {
    // Navigate
  } else if (action === "click") {
    // Click
  } else if (action === "fill") {
    // Fill
  } else if (action === "upload") {
    // Upload
  } else if (action === "screenshot") {
    // Screenshot
  } else {
    throw new Error("Unknown action");
  }
}
```

### Preferred implementation

```typescript
interface ActionHandler {
  execute(step: WorkflowStep): Promise<void>;
}

class ActionRegistry {
  constructor(
    private readonly handlers: ReadonlyMap<
      WorkflowAction,
      ActionHandler
    >
  ) {}

  get(action: WorkflowAction): ActionHandler {
    const handler = this.handlers.get(action);

    if (!handler) {
      throw new UnsupportedActionException(action);
    }

    return handler;
  }
}
```

A small guard clause or simple conditional is acceptable when it improves clarity.

**Do not replace every conditional with a design pattern.** Avoid overengineering.

# 8. FUNCTION, METHOD AND CLASS DESIGN

## Method Rules

- Prefer methods with one clear responsibility.
- Keep method arguments minimal.
- Prefer parameter objects for complex input.
- Avoid methods with more than 4 independent arguments unless justified.
- Prefer explicit return types.
- Avoid deeply nested callbacks.
- Avoid large methods performing multiple unrelated operations.
- Avoid hidden side effects.
- Use meaningful domain-specific names.

### Anti-pattern

```typescript
async function execute(
  userId: string,
  portal: string,
  email: string,
  password: string,
  resume: string,
  browser: string,
  retry: number,
  timeout: number
) {}
```

### Preferred implementation

```typescript
interface ExecutionRequest {
  userId: string;
  portal: string;
  retryPolicy: RetryPolicy;
  timeoutMs: number;
}

async function execute(
  request: ExecutionRequest
): Promise<ExecutionResult> {}
```

## Class Rules

- Keep classes focused.
- Prefer approximately 100–200 lines as a review guideline, not an absolute limit.
- Split classes when responsibilities become unrelated.
- Avoid god classes.
- Avoid excessive public methods.
- Avoid static methods for business operations requiring dependencies.
- Use instance-based services and constructor injection.
- Pure deterministic helper functions may remain standalone where appropriate.

# 9. CENTRALIZED CONSTANTS AND ENUMERATIONS

Use a centralized, strongly typed approach for application-wide constants.

Rules:

- Avoid magic strings.
- Avoid magic numbers.
- Avoid duplicate configuration values.
- Use `as const` objects for fixed value sets.
- Use discriminated unions for action types.
- Use enums only when their semantics justify them.
- Keep configuration separate from constants.
- Never place credentials or environment-specific secrets in constants.

### Anti-pattern

```typescript
if (status === "completed") {}
if (action === "navigate") {}

setTimeout(callback, 30000);
```

### Preferred implementation

```typescript
export const WorkflowStatus = {
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled"
} as const;

export type WorkflowStatus =
  typeof WorkflowStatus[keyof typeof WorkflowStatus];

export const RuntimeLimits = {
  MAX_RETRIES: 3,
  DEFAULT_TIMEOUT_MS: 30_000,
  MAX_CONCURRENT_EXECUTIONS: 20
} as const;
```

Use validated environment configuration for deployment-specific limits.

# 10. NAMING CONVENTIONS

Use short, meaningful and consistent names.

| Element | Convention | Example |
|---|---|---|
| File | kebab-case | `browser-manager.ts` |
| Class | PascalCase | `BrowserManager` |
| Interface | PascalCase | `SecretProvider` |
| Type | PascalCase | `WorkflowDefinition` |
| Method | camelCase | `executeWorkflow()` |
| Variable | camelCase | `executionContext` |
| Constant | UPPER_SNAKE_CASE | `MAX_RETRIES` |
| SCSS file | kebab-case | `workflow-panel.scss` |
| Test file | descriptive `.spec.ts` | `login.spec.ts` |
| Template | descriptive kebab-case | `job-application.yaml` |
| Package | lowercase | `workflow-runtime` |

Additional rules:

- Avoid abbreviations unless universally recognized.
- Avoid meaningless names such as `data`, `obj`, `temp`, `helper` and `manager1`.
- Avoid redundant prefixes.
- Avoid inconsistent singular/plural naming.
- Name booleans using `is`, `has`, `can` or `should`.
- Name asynchronous methods according to their operation, not with unnecessary `Async` suffixes.

# 11. CORE AND UTILITY PACKAGE STANDARDS

Keep genuinely reusable cross-cutting utilities in `core/utils`.

Suggested organization:

```text
core/
├── utils/
│   ├── date-time.util.ts
│   ├── object.util.ts
│   ├── validation.util.ts
│   ├── retry.util.ts
│   ├── async.util.ts
│   └── correlation.util.ts
│
├── logging/
├── exceptions/
├── constants/
├── contracts/
└── observability/
```

Rules:

- Reuse existing utilities before creating new ones.
- Avoid duplicate utility implementations.
- Keep utilities independent of application-specific business rules.
- Avoid turning the utility package into a miscellaneous dumping ground.
- Avoid circular dependencies.
- Avoid unnecessary static utility classes.
- Use pure functions for deterministic transformations.
- Use injected services for operations involving I/O.
- Provide unit tests for reusable utilities.
- Do not expose internal implementation details unnecessarily.

# 12. ENTERPRISE-GRADE LOGGING AND OBSERVABILITY

Logging must support investigation across distributed services and concurrent workflow executions.

Use structured JSON logging.

Every execution must have:

- `timestamp`
- `level`
- `service`
- `environment`
- `version`
- `traceId`
- `spanId`
- `correlationId`
- `executionId`
- `userId` (internal pseudonymous identifier)
- `workflowId`
- `templateVersion`
- `portal`
- `action`
- `durationMs`
- `status`
- `errorCode` where applicable

Do not log:
- Passwords.
- Access tokens.
- Cookies.
- Session storage.
- Authorization headers.
- Sensitive personal information.
- Resume contents.
- Unredacted browser form values.

## Logging Levels

| Level | Purpose |
|---|---|
| TRACE | Detailed development diagnostics |
| DEBUG | Troubleshooting |
| INFO | Workflow lifecycle and business events |
| WARN | Recoverable anomalies |
| ERROR | Failed operation |
| FATAL | Process-level critical failure |

## Mandatory Logging Events

1. Workflow accepted.
2. Template validation completed.
3. Execution context created.
4. Browser launched.
5. Authentication initiated.
6. Authentication completed or failed.
7. Action started and completed.
8. Retry initiated.
9. Circuit breaker state changed.
10. Approval requested.
11. Approval received or rejected.
12. Workflow completed or failed.
13. Browser closed.
14. Execution resources released.

## Example Structured Log

```json
{
  "timestamp": "2026-11-14T10:30:00Z",
  "level": "INFO",
  "service": "workflow-runtime",
  "traceId": "trace-123",
  "spanId": "span-456",
  "correlationId": "corr-789",
  "executionId": "exec-001",
  "userId": "user-001",
  "workflowId": "job-application",
  "templateVersion": "1.2.0",
  "portal": "job-portal",
  "action": "profile-validation",
  "durationMs": 120,
  "status": "COMPLETED"
}
```

Use OpenTelemetry-compatible tracing and metrics.

Propagate trace context across asynchronous operations and service boundaries.

# 13. ENTERPRISE EXCEPTION HANDLING

Exception handling must help engineers identify:

1. What failed?
2. Which component failed?
3. Which execution was affected?
4. What was the failure category?
5. Is it retryable?
6. What investigation information is available?

## Exception Design

Create typed exceptions:

- `ConfigurationException`
- `TemplateValidationException`
- `AuthenticationException`
- `AuthorizationException`
- `BrowserLaunchException`
- `BrowserTimeoutException`
- `LocatorNotFoundException`
- `ActionExecutionException`
- `SecretResolutionException`
- `ConcurrencyLimitException`
- `CircuitBreakerOpenException`
- `WorkflowCancelledException`
- `ResourceExhaustionException`
- `ExternalServiceException`

## Exception Message Convention

Use:

`[ERROR_CODE] Short failure statement | component | executionId | retryable`

Examples:

```text
[AUTO-001] Browser launch failed | browser-manager | exec-001 | retryable=true

[AUTO-002] Locator resolution failed | form-handler | exec-002 | retryable=false

[AUTO-003] Authentication rejected | login-handler | exec-003 | retryable=false

[AUTO-004] Execution deadline exceeded | workflow-engine | exec-004 | retryable=false

[AUTO-005] Secret retrieval failed | secret-provider | exec-005 | retryable=false

[AUTO-006] Browser process unresponsive | execution-supervisor | exec-006 | retryable=true
```

## Anti-pattern

```typescript
try {
  await workflow.execute();
} catch (error) {
  console.log("Something went wrong");
}
```

Problems:
- No error classification.
- No correlation context.
- No investigation information.
- No recovery strategy.
- No proper error propagation.

## Preferred implementation

```typescript
try {
  await workflow.execute();
} catch (error: unknown) {
  const exception = ExceptionMapper.map(error);

  logger.error(
    "Workflow execution failed",
    {
      errorCode: exception.code,
      component: exception.component,
      executionId,
      traceId,
      retryable: exception.retryable
    }
  );

  throw exception;
}
```

Rules:

- Preserve the original exception as `cause`.
- Do not swallow unexpected exceptions.
- Avoid empty catch blocks.
- Do not log the same exception repeatedly at every layer.
- Log once at the appropriate handling boundary.
- Use short, stable exception messages.
- Keep stack traces in restricted diagnostic systems.
- Redact sensitive information before logging.
- Distinguish business failures from infrastructure failures.
- Never retry permanent failures automatically.

# 14. DISTRIBUTED SYSTEMS AND CONCURRENCY

The platform must support multiple users and multiple simultaneous workflow executions.

## Mandatory Isolation Rules

Every execution must own:

- Unique `executionId`.
- Independent browser instance or managed browser allocation.
- Independent BrowserContext.
- Independent page lifecycle.
- Independent user profile snapshot.
- Independent secret-resolution context.
- Independent template execution state.
- Independent cancellation signal.
- Independent logging and tracing context.

Never share:
- BrowserContext across users.
- Authenticated pages across executions.
- User credentials in global variables.
- Mutable workflow variables between executions.
- User-specific template state.
- Authentication cookies across tenants.

## Recommended Execution Architecture

```text
Execution API
     |
     v
Execution Scheduler
     |
     v
Concurrency Controller
     |
     v
Execution Queue
     |
     +---- Execution A ---- Browser Context A
     |
     +---- Execution B ---- Browser Context B
     |
     +---- Execution C ---- Browser Context C
     |
     v
Execution Result Store
```

## Concurrency Requirements

- Use bounded concurrency.
- Apply queue-based execution.
- Enforce per-user execution limits.
- Enforce global execution limits.
- Apply backpressure when capacity is exhausted.
- Use distributed locks only when shared resources require them.
- Avoid unnecessary global locks.
- Implement execution leases for distributed workers.
- Use idempotency keys for workflow initiation.
- Make cancellation and cleanup reliable.
- Avoid duplicate execution during worker recovery.

A process-local concurrency limiter is insufficient when multiple containers are running. Use distributed coordination or a queue-backed scheduler where global limits are required.

## Anti-pattern: Shared Mutable State

```typescript
let currentUser: UserProfile;
let currentPage: Page;
let currentTemplate: WorkflowDefinition;

async function execute(user: UserProfile) {
  currentUser = user;
  currentPage = await browser.newPage();
}
```

This can mix user data and browser sessions during concurrent execution.

## Preferred approach

```typescript
interface ExecutionContext {
  executionId: string;
  userId: string;
  page: Page;
  profile: Readonly<UserProfile>;
  signal: AbortSignal;
}

class WorkflowExecutor {
  async execute(
    context: ExecutionContext,
    template: WorkflowDefinition
  ): Promise<ExecutionResult> {
    // All mutable execution state remains scoped
    // to this individual execution.
    return this.run(template, context);
  }
}
```

# 15. PLAYWRIGHT EXECUTION SUPERVISION

Browser automation must not run indefinitely.

## Required Controls

- Maximum execution duration.
- Per-action timeout.
- Navigation timeout.
- Browser launch timeout.
- Overall workflow deadline.
- Heartbeat monitoring.
- Process health monitoring.
- Memory and CPU limits.
- Cancellation propagation.
- Browser and context cleanup.

## Stuck Browser Detection

Monitor:

- Missing heartbeat.
- Browser process unresponsive.
- Action deadline exceeded.
- Navigation timeout.
- Unexpected process termination.
- Memory exhaustion.
- CPU saturation.

## Recovery Sequence

```text
Workflow Started
      |
      v
Heartbeat Monitoring
      |
      v
Deadline Exceeded?
      |
   +--+--+
   |     |
  No    Yes
   |     |
Continue Cancel execution
         |
         v
     Stop browser
         |
         v
   Graceful shutdown
         |
         v
   Terminate process
         |
         v
   Release resources
         |
         v
   Record failure
```

Rules:

1. Attempt graceful cancellation first.
2. Close BrowserContext.
3. Close browser.
4. Terminate the isolated worker process if unresponsive.
5. Use an external process supervisor for hard termination.
6. Record the termination reason.
7. Release execution leases.
8. Prevent automatic retry from creating duplicate submissions.

Never rely solely on a JavaScript timer to kill a blocked browser process.

Use process isolation so that terminating one stuck execution does not terminate unrelated users' workflows.

# 16. CIRCUIT BREAKER AND RETRY MECHANISM

Use a centralized resilience policy.

## Circuit Breaker States

- CLOSED: Normal operation.
- OPEN: Stop requests temporarily.
- HALF_OPEN: Allow controlled recovery requests.

## Retry Policy

Use:
- Exponential backoff.
- Randomized jitter.
- Maximum retry count.
- Overall retry deadline.
- Retry classification.
- Cancellation support.

### Retryable failures

- Temporary network errors.
- Transient service unavailability.
- Temporary browser launch failures.
- Selected rate-limit responses.

### Non-retryable failures

- Invalid credentials.
- Authorization failures.
- Invalid template.
- Unsupported action.
- User rejection.
- Permanent validation failure.
- CAPTCHA or MFA requiring user interaction.

Important:
- Never retry non-idempotent submission blindly.
- Check submission status before retrying.
- Use idempotency keys where supported.
- Do not retry after user cancellation.
- Apply retry budgets to prevent retry storms.
- Use per-portal circuit breakers where appropriate.

# 17. PERFORMANCE AND COMPLEXITY

Every implementation must consider:

- Time complexity.
- Space complexity.
- CPU consumption.
- Memory consumption.
- Network overhead.
- Browser resource consumption.
- Event-loop blocking.
- Concurrent execution capacity.

## Complexity Guidelines

| Operation | Preferred complexity |
|---|---|
| Registry lookup | O(1) average |
| User context lookup | O(1) average |
| Template action resolution | O(1) average |
| Sequential workflow | O(n) |
| Profile validation | O(n) |
| Duplicate detection | O(n) using Set/Map where appropriate |
| Sorting | O(n log n) |
| Unnecessary nested comparisons | Avoid O(n²) |

These are targets, not guarantees. Select data structures based on actual requirements and profiling.

## Performance Rules

- Avoid repeated parsing of identical immutable templates.
- Cache validated template definitions safely.
- Never cache user secrets globally.
- Avoid unbounded Promise.all.
- Use bounded parallel execution.
- Avoid unnecessary browser instances.
- Reuse browser processes only where isolation is preserved.
- Avoid unnecessary page reloads.
- Avoid arbitrary fixed delays.
- Prefer locator-based waiting.
- Avoid loading unnecessary browser resources where compatible with the workflow.
- Use streaming for large files.
- Release memory and file handles promptly.

Do not optimize based on assumptions alone. Use profiling and load testing.

# 18. SECURITY AND MULTI-TENANT PROTECTION

Security must be enforced at every boundary.

## Credential Management

- Never store passwords in YAML, JSON or Markdown templates.
- Use a SecretProvider abstraction.
- Support Azure Key Vault or another authorized secret manager.
- Apply least-privilege access.
- Resolve secrets only after user authorization.
- Keep secrets in memory for the shortest possible duration.
- Never write credentials to logs or screenshots.
- Never share browser authentication state between users.

## Authentication

- Support user-assisted MFA.
- Do not bypass CAPTCHA.
- Do not circumvent portal access restrictions.
- Respect portal terms and automation policies.
- Handle account challenges through authorized user interaction.

## Template Security

- Validate templates against strict schemas.
- Allowlist supported actions.
- Allowlist permitted navigation domains.
- Validate URLs against SSRF risks.
- Restrict file paths to authorized directories.
- Prevent path traversal.
- Do not execute arbitrary code from templates.
- Do not allow arbitrary shell commands.
- Enforce template version and integrity checks.

## Human Approval

Require explicit authenticated approval before irreversible operations, including final job application submission.

# 19. DECLARATIVE TEMPLATE ENGINE

Templates define WHAT should happen.

TypeScript handlers define HOW it happens.

## Required Template Capabilities

- Template metadata.
- Template version.
- Input variables.
- Secret references.
- Conditional steps.
- Validation.
- Action execution.
- Timeouts.
- Retry policies.
- Approval checkpoints.
- Execution dependencies.
- Error-handling policies.

## Template Execution Lifecycle

```text
Load
  |
Validate Schema
  |
Validate Permissions
  |
Resolve User Context
  |
Resolve Authorized Secrets
  |
Create Isolated Execution
  |
Execute Actions
  |
Validate Results
  |
Request Approval
  |
Execute Approved Operation
  |
Audit and Cleanup
```

## Template Engine Requirements

- Use schema validation.
- Support template versioning.
- Keep templates immutable during execution.
- Resolve variables through a centralized resolver.
- Prevent cross-execution variable leakage.
- Use typed action contracts.
- Reject unsupported actions.
- Support dry-run mode.
- Maintain execution state independently from template definitions.

# 20. DOCKER CONTAINERIZATION

Use Docker to isolate execution environments.

The Node.js TypeScript application is the primary automation runtime.

Python must not be introduced as an alternative implementation language for application logic.

If an external Python workload is required, isolate it in a separately managed container with an explicit service contract.

## Container Requirements

- Use supported Node.js LTS base images.
- Prefer multi-stage builds.
- Use non-root execution.
- Pin dependencies and base image versions.
- Apply CPU and memory limits.
- Configure health checks.
- Use read-only root filesystems where feasible.
- Drop unnecessary Linux capabilities.
- Never bake secrets into images.
- Use Docker secrets or authorized secret injection.
- Keep browser processes isolated.
- Implement graceful shutdown.
- Ensure temporary data cleanup.

## Bidirectional Code Mount

For local development:

```yaml
services:
  automation-runtime:
    build:
      context: .
      dockerfile: Dockerfile

    init: true

    working_dir: /app

    volumes:
      - .:/app
      - node_modules:/app/node_modules

    environment:
      NODE_ENV: development

    command: npm run dev

volumes:
  node_modules:
```

The bind mount allows:

- Host changes to appear inside the container.
- Container-generated code changes to appear on the host.
- Shared access to workflow templates and test files.
- Development without rebuilding the image after every source change.

Important:
- Do not mount production secrets into the source directory.
- Use separate development and production configurations.
- Use isolated writable directories for temporary execution artifacts.
- Restrict concurrent file writes.
- Never let concurrent executions overwrite shared mutable template files.

For production, prefer immutable images and controlled deployment artifacts rather than mounting the entire source repository.

# 21. SCSS ENGINEERING STANDARDS

Use SCSS instead of plain CSS for authored application stylesheets.

## Mandatory Rules

- Use modular SCSS architecture.
- Use variables and design tokens.
- Use mixins for repeated styling patterns.
- Use functions for reusable calculations where justified.
- Use component-scoped styles.
- Avoid deeply nested selectors.
- Avoid unnecessary `!important`.
- Avoid duplicated declarations.
- Follow responsive design standards.
- Support accessibility.
- Maintain consistent spacing, typography and color tokens.
- Avoid deprecated Sass APIs.
- Use `@use` and `@forward` instead of deprecated `@import`.

## Recommended Structure

```text
styles/
├── abstracts/
│   ├── _variables.scss
│   ├── _mixins.scss
│   └── _functions.scss
│
├── base/
│   ├── _reset.scss
│   └── _typography.scss
│
├── components/
│   ├── _buttons.scss
│   ├── _forms.scss
│   └── _workflow.scss
│
├── layouts/
│   ├── _header.scss
│   └── _dashboard.scss
│
└── main.scss
```

## SCSS Anti-pattern

```scss
.dashboard {
  .panel {
    .content {
      .form {
        .input {
          color: red;
        }
      }
    }
  }
}
```

## Preferred approach

```scss
.workflow-panel {
  color: var(--color-text-primary);

  &__form {
    display: grid;
    gap: var(--spacing-medium);
  }

  &__input {
    width: 100%;
  }
}
```

Keep selector specificity low and use consistent component naming.

# 22. TESTING AND QUALITY GATES

All application tests must use TypeScript.

## Required Testing

| Test Type | Purpose |
|---|---|
| Unit | Individual class and service validation |
| Integration | Infrastructure adapter interactions |
| Contract | Interface and provider compatibility |
| Playwright | Browser workflow verification |
| Concurrency | Multi-user isolation |
| Security | Tenant isolation and credential protection |
| Performance | CPU, memory and throughput |
| Resilience | Retry and circuit breaker behavior |
| Regression | Prevent existing workflow failures |

## Mandatory Edge Cases

Test at minimum:

1. Invalid user profile.
2. Missing credentials.
3. Invalid credentials.
4. MFA required.
5. CAPTCHA encountered.
6. Portal unavailable.
7. Locator missing.
8. Navigation timeout.
9. Browser process terminated.
10. Duplicate workflow request.
11. Concurrent executions for the same user.
12. Concurrent executions for different users.
13. User cancellation.
14. Worker restart.
15. Template version mismatch.
16. Secret provider unavailable.
17. Memory or CPU exhaustion.
18. Retry exhaustion.
19. Circuit breaker open.
20. Approval rejected.
21. Application already submitted.
22. Browser cleanup failure.

## Quality Gates

- TypeScript compilation.
- Linting.
- Formatting.
- Unit tests.
- Integration tests.
- Playwright tests.
- Dependency vulnerability scanning.
- Secret scanning.
- Static analysis.
- Concurrency tests.
- Performance tests.

Never consider a feature complete merely because the happy-path test passes.

# 23. ANTI-PATTERN CHECKLIST

The AI agent MUST identify and avoid the following:

| Anti-pattern | Required alternative |
|---|---|
| Relative imports | `@/` alias |
| JavaScript implementation | TypeScript |
| Procedural application architecture | OOP + SOLID |
| Direct dependency instantiation | Constructor DI |
| Large switch statements | Registry + Strategy |
| Duplicate business logic | Shared domain/application services |
| Magic strings | Centralized typed constants |
| God classes | Focused classes |
| Long methods | Smaller cohesive methods |
| Excessive arguments | Parameter objects |
| Global mutable state | Execution-scoped state |
| Shared browser contexts | Isolated contexts |
| Unbounded concurrency | Bounded scheduler |
| Blind retries | Classified retry policies |
| Infinite browser execution | Deadlines + process supervision |
| Generic exception messages | Typed exceptions |
| Unstructured logs | Structured JSON |
| Logging sensitive information | Redaction |
| Global secret cache | Authorized short-lived resolution |
| Arbitrary template code | Validated declarative actions |
| Fixed browser sleeps | Locator-based waits |
| Plain CSS | SCSS |
| Deprecated Sass imports | `@use` / `@forward` |
| Unbounded Promise.all | Controlled concurrency |
| Repeated template parsing | Safe immutable caching |
| Shared mutable template objects | Immutable execution definitions |
| Catch and ignore | Classify, log and propagate |
| Duplicate workflow submission | Idempotency and status checks |

# 24. AI AGENT IMPLEMENTATION PROCESS

Before implementing any requirement, follow this process.

## Phase 1: Understand

- Inspect the existing codebase.
- Identify existing architecture.
- Identify existing packages and reusable utilities.
- Review current dependency versions.
- Understand workflow requirements.
- Identify affected modules.
- Avoid introducing duplicate implementations.

## Phase 2: Design

- Define module boundaries.
- Identify domain entities.
- Define interfaces and contracts.
- Select suitable design patterns.
- Identify dependencies.
- Evaluate security requirements.
- Evaluate concurrency requirements.
- Consider time and space complexity.
- Identify failure and recovery scenarios.

## Phase 3: Implement

- Use TypeScript exclusively for application code.
- Follow the `@/` import convention.
- Apply SOLID and DI.
- Reuse existing utilities.
- Keep business logic independent of infrastructure.
- Use centralized configuration.
- Implement structured logging.
- Implement typed exceptions.
- Implement resource cleanup.

## Phase 4: Validate

- Run type checking.
- Run linting.
- Run unit tests.
- Run integration tests.
- Run Playwright tests.
- Test concurrent execution.
- Test tenant isolation.
- Test timeout and recovery.
- Validate CPU and memory usage.
- Review security implications.

## Phase 5: Review

Before declaring completion, verify:

- No relative imports.
- No unintended JavaScript implementation.
- No duplicate logic.
- No hardcoded secrets.
- No global mutable execution state.
- No cross-user session leakage.
- No uncontrolled retries.
- No unbounded concurrency.
- No swallowed exceptions.
- No unstructured sensitive logging.
- No deprecated or experimental APIs.
- No unnecessary complexity.
- No missing edge-case tests.

# 25. IMPLEMENTATION COMPLETION REPORT

Every completed implementation must provide:

1. **Requirement:** What was implemented?
2. **Architecture:** Which layers and design patterns were used?
3. **Files:** Which files were created or modified?
4. **Dependencies:** Which dependencies were introduced or upgraded?
5. **Security:** How are sensitive data and user isolation protected?
6. **Performance:** Complexity and concurrency considerations.
7. **Logging:** Which investigation fields and events are available?
8. **Exceptions:** Which typed failures are handled?
9. **Testing:** Which tests were executed and their results?
10. **Limitations:** Any unresolved issues or external dependencies.

Do not claim successful execution of tests that were not actually executed.

---

# 26. FINAL NON-NEGOTIABLE DIRECTIVES

1. TypeScript is the only application implementation language.
2. Use `@/` imports; never use `./` or `../`.
3. Follow OOP, SOLID, DI and appropriate design patterns.
4. Prefer composition over unnecessary inheritance.
5. Avoid excessive conditional branching.
6. Centralize constants, configuration and shared contracts.
7. Avoid duplicate code and business logic.
8. Use concise, meaningful naming conventions.
9. Implement enterprise-grade structured logging and exception handling.
10. Design for distributed systems and high concurrency.
11. Isolate every user's browser session and execution state.
12. Supervise Playwright processes and enforce execution deadlines.
13. Implement bounded concurrency, circuit breakers and classified retries.
14. Optimize time complexity, space complexity, CPU and memory usage.
15. Use SCSS with modular architecture and modern Sass practices.
16. Use Docker for isolated and reproducible execution.
17. Use declarative templates with a centralized TypeScript runtime.
18. Never expose credentials or sensitive information.
19. Require explicit user approval before irreversible operations.
20. Prefer stable, supported and maintainable technologies.

**Decision Rule:** When multiple implementation approaches are possible, choose the one that provides the best balance of security, maintainability, scalability, performance, testability and operational simplicity.

**Do not sacrifice enterprise engineering quality for shorter code. Do not introduce unnecessary complexity in the name of enterprise architecture.**
