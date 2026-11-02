/**
 * Enterprise Model and System Constants.
 * Conforms to:
 * - STD-COD-002: Zero Magic Literals.
 * - Invariant: Avoid generic ID; keep meaningful column names.
 * - Invariant: All table and column names strictly in UPPER CASE.
 * - Model Names & Versions aligned with verified model catalog standards.
 * - Distributed Microservices Tracing standards (W3C TraceContext & OpenTelemetry).
 */

/**
 * Database Table Names (Strictly UPPER CASE)
 */
export const DatabaseTable = Object.freeze({
  MODELS: "MODELS",
  SESSIONS: "SESSIONS",
  MESSAGES: "MESSAGES",
  CONTEXT_ITEMS: "CONTEXT_ITEMS",
  AUDIT_LOGS: "AUDIT_LOGS",
  MODEL_CREDENTIALS: "MODEL_CREDENTIALS",
  TENANTS: "TENANTS",
  USERS: "USERS",
  TASK_EXECUTIONS: "TASK_EXECUTIONS",
  EXECUTIVE_SUMMARIES: "EXECUTIVE_SUMMARIES",
  WORKFLOW_STEP_LEDGER: "WORKFLOW_STEP_LEDGER",
  WORKFLOWS: "WORKFLOWS",
  WORKFLOW_STEPS: "WORKFLOW_STEPS",
  PROMPTS: "PROMPTS",
  METRICS: "METRICS",
  TOKEN_LEDGERS: "TOKEN_LEDGERS",
  API_KEYS: "API_KEYS",
  JOB_APPLICATIONS: "JOB_APPLICATIONS",
  APP_TEMPLATES: "APP_TEMPLATES",
  STORY_PROJECTS: "STORY_PROJECTS",
});

/**
 * Database Column Names (Strictly UPPER CASE with meaningful non-generic keys)
 */
export const DatabaseColumn = Object.freeze({
  // MODELS table columns
  MODEL_ID: "MODEL_ID",
  MODEL_NAME: "MODEL_NAME",
  MODEL_FAMILY: "MODEL_FAMILY",
  PROVIDER_NAME: "PROVIDER_NAME",
  CONTEXT_WINDOW_SIZE: "CONTEXT_WINDOW_SIZE",
  SUPPORTED_STRATEGIES: "SUPPORTED_STRATEGIES",
  LIFECYCLE_STATUS: "LIFECYCLE_STATUS",
  DESCRIPTION_TEXT: "DESCRIPTION_TEXT",

  // SESSIONS table columns
  SESSION_ID: "SESSION_ID",
  SESSION_TITLE: "SESSION_TITLE",
  ACTIVE_MODEL_ID: "ACTIVE_MODEL_ID",
  STRATEGY_MODE: "STRATEGY_MODE",
  TURN_COUNT: "TURN_COUNT",
  SESSION_METADATA_JSON: "SESSION_METADATA_JSON",

  // MESSAGES table columns
  MESSAGE_ID: "MESSAGE_ID",
  MESSAGE_ROLE: "MESSAGE_ROLE",
  MESSAGE_CONTENT: "MESSAGE_CONTENT",
  TOKEN_COUNT: "TOKEN_COUNT",
  LATENCY_MS: "LATENCY_MS",

  // CONTEXT_ITEMS table columns
  CONTEXT_ID: "CONTEXT_ID",
  CONTEXT_TYPE: "CONTEXT_TYPE",
  CONTEXT_NAME: "CONTEXT_NAME",
  CONTEXT_CONTENT: "CONTEXT_CONTENT",

  // AUDIT_LOGS table columns
  AUDIT_LOG_ID: "AUDIT_LOG_ID",
  CORRELATION_ID: "CORRELATION_ID",
  TRACE_ID: "TRACE_ID",
  SPAN_ID: "SPAN_ID",
  ACTION_NAME: "ACTION_NAME",
  EXECUTION_STATUS: "EXECUTION_STATUS",
  CLIENT_IP: "CLIENT_IP",
  ERROR_MESSAGE: "ERROR_MESSAGE",

  // MODEL_CREDENTIALS table columns
  CREDENTIAL_ID: "CREDENTIAL_ID",
  KEY_NAME: "KEY_NAME",
  KEY_HASH: "KEY_HASH",
  IS_ACTIVE: "IS_ACTIVE",

  // TENANTS table columns
  TENANT_ID: "TENANT_ID",
  TENANT_NAME: "TENANT_NAME",
  SUBSCRIPTION_TIER: "SUBSCRIPTION_TIER",
  STATUS: "STATUS",

  // USERS table columns
  USER_ID: "USER_ID",
  EMAIL: "EMAIL",
  FULL_NAME: "FULL_NAME",
  USER_ROLE: "USER_ROLE",

  // TASK_EXECUTIONS table columns (UC-11)
  TASK_ID: "TASK_ID",
  TASK_TYPE: "TASK_TYPE",
  TARGET_ENTITY_ID: "TARGET_ENTITY_ID",
  TASK_STATUS: "TASK_STATUS",
  EXECUTION_OUTPUT_SUMMARY: "EXECUTION_OUTPUT_SUMMARY",
  STARTED_AT: "STARTED_AT",
  COMPLETED_AT: "COMPLETED_AT",

  // EXECUTIVE_SUMMARIES table columns (UC-11)
  SUMMARY_ID: "SUMMARY_ID",
  TIME_WINDOW: "TIME_WINDOW",
  COMPLETED_TASKS_COUNT: "COMPLETED_TASKS_COUNT",
  FAILED_TASKS_COUNT: "FAILED_TASKS_COUNT",
  HIGHLIGHTS_JSON: "HIGHLIGHTS_JSON",
  NEXT_ACTIONS_JSON: "NEXT_ACTIONS_JSON",
  CREATED_AT: "CREATED_AT",

  // WORKFLOW_STEP_LEDGER table columns (STEP-06 / LLD 19.1)
  LEDGER_ID: "LEDGER_ID",
  WORKFLOW_EXECUTION_ID: "WORKFLOW_EXECUTION_ID",
  STEP_INDEX: "STEP_INDEX",
  STEP_NAME: "STEP_NAME",
  INPUT_HASH: "INPUT_HASH",
  OUTPUT_HASH: "OUTPUT_HASH",
  CUMULATIVE_HMAC: "CUMULATIVE_HMAC",
  PAYLOAD_SNAPSHOT: "PAYLOAD_SNAPSHOT",
  EXECUTION_TIMESTAMP: "EXECUTION_TIMESTAMP",

  // Common Timestamps
  CREATED_TIMESTAMP: "CREATED_TIMESTAMP",
  UPDATED_TIMESTAMP: "UPDATED_TIMESTAMP",
});

/**
 * Supported Model Families across the Platform
 */
export const ModelFamily = Object.freeze({
  GEMINI: "gemini",
  GROK: "grok",
  COPILOT: "copilot",
  CHATGPT: "chatgpt",
  CLAUDE: "claude",
  OLLAMA: "ollama",
  GOOGLE: "google",
  ANTHROPIC: "anthropic",
  OPENAI: "openai",
  XAI: "xai",
  GENERIC: "generic",
});

/**
 * Model Lifecycle Status
 */
export const ModelStatus = Object.freeze({
  ACTIVE: "ACTIVE",
  DEPRECATED: "DEPRECATED",
  SHUTDOWN: "SHUTDOWN",
});

/**
 * Verified Available Models Catalog.
 * Exact canonical model identifiers and versions.
 */
export const ModelCatalog = Object.freeze({
  // Google Gemini verified active models (Recommended defaults)
  GEMINI_3_8_FLASH: "gemini-3.8-flash",
  GEMINI_3_5_FLASH: "gemini-3.5-flash",
  GEMINI_3_5_FLASH_LITE: "gemini-3.5-flash-lite",

  // Google Gemini deprecated / legacy models
  GEMINI_2_5_FLASH: "gemini-2.5-flash",
  GEMINI_2_5_PRO: "gemini-2.5-pro",
  GEMINI_2_0_FLASH: "gemini-2.0-flash",
  GEMINI_2_0_FLASH_LITE: "gemini-2.0-flash-lite",
  GEMINI_1_5_PRO: "gemini-1.5-pro",
  GEMINI_1_5_FLASH: "gemini-1.5-flash",

  // Anthropic Claude models
  CLAUDE_3_7_SONNET: "claude-3-7-sonnet",
  CLAUDE_3_5_SONNET: "claude-3-5-sonnet",
  CLAUDE_3_5_HAIKU: "claude-3-5-haiku",

  // OpenAI / ChatGPT models
  GPT_4O: "gpt-4o",
  GPT_4O_MINI: "gpt-4o-mini",
  O3_MINI: "o3-mini",
  CODEX: "codex",

  // Microsoft / GitHub Copilot models
  COPILOT: "copilot",
  COPILOT_CHAT: "copilot-chat",
  COPILOT_GPT_4O: "copilot-gpt-4o",
  COPILOT_CLAUDE_3_5_SONNET: "copilot-claude-3.5-sonnet",
  COPILOT_O3_MINI: "copilot-o3-mini",

  // xAI Grok models
  GROK_3: "grok-3",
  GROK_2: "grok-2",
  GROK_BETA: "grok-beta",

  // Local Ollama models
  LLAMA_3_2: "llama3.2",
  LLAMA_3_1: "llama3.1",
  DEEPSEEK_R1: "deepseek-r1",
  TINYLLAMA: "tinyllama",
  QWEN_3: "qwen3",
  QWEN_3_CODER: "qwen3-coder",
  PHI_4: "phi4",
  GEMMA_4: "gemma4",

  // Default system fallback
  DEFAULT: "gemini-3.8-flash",
});

export const ACTIVE_GEMINI_MODELS = Object.freeze([
  ModelCatalog.GEMINI_3_8_FLASH,
  ModelCatalog.GEMINI_3_5_FLASH,
  ModelCatalog.GEMINI_3_5_FLASH_LITE,
]);

export const DEPRECATED_GEMINI_MODELS = Object.freeze([
  ModelCatalog.GEMINI_2_5_FLASH,
  ModelCatalog.GEMINI_2_5_PRO,
  ModelCatalog.GEMINI_2_0_FLASH,
  ModelCatalog.GEMINI_2_0_FLASH_LITE,
  ModelCatalog.GEMINI_1_5_PRO,
  ModelCatalog.GEMINI_1_5_FLASH,
]);

export const CLAUDE_MODELS = Object.freeze([
  ModelCatalog.CLAUDE_3_7_SONNET,
  ModelCatalog.CLAUDE_3_5_SONNET,
  ModelCatalog.CLAUDE_3_5_HAIKU,
]);

export const OPENAI_MODELS = Object.freeze([
  ModelCatalog.GPT_4O,
  ModelCatalog.GPT_4O_MINI,
  ModelCatalog.O3_MINI,
  ModelCatalog.CODEX,
]);

export const COPILOT_MODELS = Object.freeze([
  ModelCatalog.COPILOT,
  ModelCatalog.COPILOT_CHAT,
  ModelCatalog.COPILOT_GPT_4O,
  ModelCatalog.COPILOT_CLAUDE_3_5_SONNET,
  ModelCatalog.COPILOT_O3_MINI,
]);

export const GROK_MODELS = Object.freeze([
  ModelCatalog.GROK_3,
  ModelCatalog.GROK_2,
  ModelCatalog.GROK_BETA,
]);

export const OLLAMA_MODELS = Object.freeze([
  ModelCatalog.LLAMA_3_2,
  ModelCatalog.LLAMA_3_1,
  ModelCatalog.DEEPSEEK_R1,
  ModelCatalog.TINYLLAMA,
  ModelCatalog.QWEN_3,
  ModelCatalog.PHI_4,
]);

export function isModelDeprecated(model: string): boolean {
  return (DEPRECATED_GEMINI_MODELS as readonly string[]).includes(model.toLowerCase());
}

/**
 * Model Constants and Platform Defaults
 */
export const ModelConstants = Object.freeze({
  DEFAULT_MODEL_ID: ModelCatalog.GEMINI_3_8_FLASH,
  DEFAULT_FALLBACK_MODEL_ID: ModelCatalog.LLAMA_3_2,
  DEFAULT_FALLBACK_PROVIDER: "ollama",
  DEFAULT_FALLBACK_ENDPOINT: "http://127.0.0.1:11434",
  DEFAULT_FALLBACK_CLI_COMMAND: "ollama",
  DEFAULT_OLLAMA_MODEL_ID: ModelCatalog.LLAMA_3_2,
  DEFAULT_TEMPERATURE: 0.7,
  DEFAULT_MAX_OUTPUT_TOKENS: 4096,
  DEFAULT_CONTEXT_WINDOW: 1048576,
  PROVIDERS: Object.freeze({
    GOOGLE: "google",
    XAI: "xai",
    MICROSOFT: "microsoft",
    OPENAI: "openai",
    ANTHROPIC: "anthropic",
    FALLBACK: "ollama",
    OLLAMA: "ollama",
  }),
  STRATEGIES: Object.freeze({
    API: "API",
    CLI: "CLI",
    COOKIE: "COOKIE",
  }),
});

/**
 * System and Network Constants
 */
export const SystemConstants = Object.freeze({
  DEFAULT_PORT: 8095,
  DEFAULT_UI_PORT: 3005,
  DEFAULT_HOST: "0.0.0.0",
  PROFILES: Object.freeze({
    DEVELOPMENT: "development",
    PRODUCTION: "production",
    TEST: "test",
  }),
  HEADERS: Object.freeze({
    CORRELATION_ID: "x-correlation-id",
    TRACE_ID: "x-trace-id",
    SPAN_ID: "x-span-id",
    TRACEPARENT: "traceparent",
    REQUEST_ID: "x-request-id",
    SESSION_ID: "x-session-id",
    AUTHORIZATION: "authorization",
  }),
  TIMEOUTS: Object.freeze({
    DEFAULT_HTTP_TIMEOUT_MS: 30000,
    DEFAULT_CONNECT_TIMEOUT_MS: 5000,
    DEFAULT_POOL_ACQUIRE_TIMEOUT_MS: 5000,
    DEFAULT_CIRCUIT_WAIT_MS: 8000,
  }),
  ERROR_CODES: Object.freeze({
    CIRCUIT_OPEN: "CORE_ERR_CIRCUIT_OPEN",
    POOL_TIMEOUT: "CORE_ERR_POOL_TIMEOUT",
    RATE_LIMITED: "CORE_ERR_RATE_LIMITED",
    BULKHEAD_FULL: "CORE_ERR_BULKHEAD_FULL",
    VALIDATION_ERROR: "CORE_ERR_VALIDATION",
    SECURITY_ERROR: "CORE_ERR_SECURITY",
    DATABASE_ERROR: "CORE_ERR_DATABASE",
  }),
});

/**
 * Task Execution Lifecycle Status (UC-11)
 */
export const TaskExecutionStatus = Object.freeze({
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  PAUSED: "PAUSED",
});

/**
 * Executive Summary Time Windows (UC-11)
 */
export const ExecutiveSummaryTimeWindow = Object.freeze({
  IMMEDIATE_MILESTONE: "IMMEDIATE_MILESTONE",
  DAILY_RECAP: "DAILY_RECAP",
  WEEKLY_ROLLUP: "WEEKLY_ROLLUP",
});

/**
 * Workflow Ledger Sequential Verification Status (LLD 19.1 / STEP-06)
 */
export const WorkflowLedgerStatus = Object.freeze({
  PENDING: "PENDING",
  EXECUTED: "EXECUTED",
  FAILED: "FAILED",
  COMPROMISED: "COMPROMISED",
});

const resolveDefaultClientId = (): string => {
  if (typeof process !== "undefined" && process.env?.GEMINI_CLI_OAUTH_CLIENT_ID) {
    return process.env.GEMINI_CLI_OAUTH_CLIENT_ID;
  }
  return "";
};

const resolveDefaultClientSecret = (): string => {
  if (typeof process !== "undefined" && process.env?.GEMINI_CLI_OAUTH_CLIENT_SECRET) {
    return process.env.GEMINI_CLI_OAUTH_CLIENT_SECRET;
  }
  return "";
};

/**
 * Official Google Gemini CLI OAuth Constants & Invariant Defaults
 */
export const GoogleAuthConstants = Object.freeze({
  SIGN_IN_WITH_GOOGLE: "sign_in_with_google",
  DEFAULT_GEMINI_CLIENT_ID: resolveDefaultClientId(),
  DEFAULT_GEMINI_CLIENT_SECRET: resolveDefaultClientSecret(),
  DEFAULT_GEMINI_OAUTH_FILE: "oauth_creds.json",
  ENV_GOOGLE_APPLICATION_CREDENTIALS: "GOOGLE_APPLICATION_CREDENTIALS",
  ENV_GEMINI_CLI_AUTH_DIR: "GEMINI_CLI_AUTH_DIR",
  ENV_GOOGLE_GENAI_USE_GCA: "GOOGLE_GENAI_USE_GCA",
  ENV_GOOGLE_CLOUD_ACCESS_TOKEN: "GOOGLE_CLOUD_ACCESS_TOKEN",
  ENV_HOME: "HOME",
  ENV_USERPROFILE: "USERPROFILE",
  PROMPT_SELECT_ACCOUNT: "select_account",
  DEFAULT_AUTH_DIR: "/tmp/model-connector/auth/gemini",
  DEFAULT_SCOPES: Object.freeze([
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ]),
});


