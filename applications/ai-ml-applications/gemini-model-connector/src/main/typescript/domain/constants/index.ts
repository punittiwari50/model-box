/**
 * Centralized Domain Constants & Enums for ModelBox Connector.
 * Conforms to:
 * - STD-COD-002: Centralized Constants Architecture
 * - STD-COD-004: Strict Acyclic Dependencies (Leaf Module)
 * - STD-COD-007.5: Immutability by Default
 */

/**
 * Standard HTTP Header names including distributed tracing & correlation headers.
 * Aligns with W3C TraceContext and OpenTelemetry distributed tracing conventions.
 */
export const HttpHeader = Object.freeze({
  TRACE_ID: 'x-trace-id',
  SPAN_ID: 'x-span-id',
  CORRELATION_ID: 'x-correlation-id',
  TRACEPARENT: 'traceparent',
  CONTENT_TYPE: 'content-type',
  CONTENT_DISPOSITION: 'content-disposition',
  AUTHORIZATION: 'authorization',
  ACCEPT: 'accept',
  USER_AGENT: 'user-agent',
  X_FORWARDED_FOR: 'x-forwarded-for',
  X_REAL_IP: 'x-real-ip',
  HOST: 'host',
  X_CONTENT_TYPE_OPTIONS: 'x-content-type-options',
  X_FRAME_OPTIONS: 'x-frame-options',
  CONTENT_SECURITY_POLICY: 'content-security-policy',
});

/**
 * Network and Host Constants (eliminating hardcoded IP literals)
 */
export const NetworkConstant = Object.freeze({
  LOOPBACK_IP: '127.0.0.1',
  BIND_ALL_HOST: '0.0.0.0',
  LOCALHOST: 'localhost',
  DEFAULT_PORT: 8090,
  DEFAULT_HTTP_SCHEME: 'http',
  DEFAULT_OAUTH_REDIRECT_URI: 'http://localhost:8090/api/v1/auth/callback',
  DEFAULT_OLLAMA_URL: 'http://127.0.0.1:11435',
});

/**
 * Standard MIME Content Types
 */
export const MimeType = Object.freeze({
  JSON: 'application/json',
  FORM_URLENCODED: 'application/x-www-form-urlencoded',
  TEXT_PLAIN: 'text/plain',
  TEXT_MARKDOWN: 'text/markdown',
});

/**
 * Standard System Execution Roles
 */
export const SystemRole = Object.freeze({
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
});

/**
 * Conversation Context Types
 */
export const ContextType = Object.freeze({
  RESUME: 'resume',
  JOB_POSTING: 'job_posting',
  DOCUMENT: 'document',
});

/**
 * Database Table Names (Capitalized strictly across the codebase per Invariant #13)
 */
export const DatabaseTable = Object.freeze({
  CONVERSATIONS: 'CONVERSATIONS',
  MESSAGES: 'MESSAGES',
  CONTEXT_ITEMS: 'CONTEXT_ITEMS',
  AUDIT_LOGS: 'AUDIT_LOGS',
  MODEL_AUTH: 'MODEL_AUTH',
  JOB_SEARCH_PROMPTS: 'JOB_SEARCH_PROMPTS',
  AGENT_EXECUTIONS: 'AGENT_EXECUTIONS',
  AGENT_STEPS: 'AGENT_STEPS',
});

/**
 * Database Column Names (Capitalized strictly across the codebase per Invariant #13)
 */
export const DatabaseColumn = Object.freeze({
  ID: 'ID',
  SESSION_ID: 'SESSION_ID',
  TITLE: 'TITLE',
  MODEL: 'MODEL',
  SYSTEM_INSTRUCTION: 'SYSTEM_INSTRUCTION',
  TAGS: 'TAGS',
  METADATA: 'METADATA',
  VERSION: 'VERSION',
  CREATED_TIMESTAMP: 'CREATED_TIMESTAMP',
  UPDATE_TIMESTAMP: 'UPDATE_TIMESTAMP',
  CREATED_AT: 'CREATED_TIMESTAMP',
  UPDATED_AT: 'UPDATE_TIMESTAMP',
  CONVERSATION_ID: 'CONVERSATION_ID',
  ROLE: 'ROLE',
  CONTENT: 'CONTENT',
  PROMPT_TOKENS: 'PROMPT_TOKENS',
  COMPLETION_TOKENS: 'COMPLETION_TOKENS',
  TOTAL_TOKENS: 'TOTAL_TOKENS',
  LATENCY_MS: 'LATENCY_MS',
  CLI_EXIT_CODE: 'CLI_EXIT_CODE',
  CONTEXT_TYPE: 'CONTEXT_TYPE',
  TIMESTAMP: 'CREATED_TIMESTAMP',
  ACTION: 'ACTION',
  CLIENT_IP: 'CLIENT_IP',
  MODEL_USED: 'MODEL_USED',
  STATUS: 'STATUS',
  ERROR_MESSAGE: 'ERROR_MESSAGE',
  DETAILS: 'DETAILS',
  AUTH_TYPE: 'AUTH_TYPE',
  ACCOUNT_EMAIL: 'ACCOUNT_EMAIL',
  ACCOUNT_NAME: 'ACCOUNT_NAME',
  ACCESS_TOKEN: 'ACCESS_TOKEN',
  REFRESH_TOKEN: 'REFRESH_TOKEN',
  EXPIRES_AT: 'EXPIRES_AT',
  PROMPT_KEY: 'PROMPT_KEY',
  PROMPT_TYPE: 'PROMPT_TYPE',
  DESCRIPTION: 'DESCRIPTION',
});

export const PromptKey = Object.freeze({
  JOB_SEARCH_SYSTEM_INSTRUCTION: 'JOB_SEARCH_SYSTEM_INSTRUCTION',
  JOB_SEARCH_USER_MESSAGE: 'JOB_SEARCH_USER_MESSAGE',
  JOB_SEARCH_ANALYSIS_PROMPT: 'JOB_SEARCH_ANALYSIS_PROMPT',
  JOB_SEARCH_CLI_SYSTEM_INSTRUCTION: 'JOB_SEARCH_CLI_SYSTEM_INSTRUCTION',
});

export const ModelTier = Object.freeze({
  PAID: 'paid',
  FREEWARE: 'freeware',
});

/**
 * Centralized Model Families & Provider Keys (Eliminating hardcoded string literals)
 */
export const ModelFamily = Object.freeze({
  GEMINI: 'gemini',
  GOOGLE: 'google',
  CLAUDE: 'claude',
  ANTHROPIC: 'anthropic',
  CODEX: 'codex',
  OPENAI: 'openai',
  CURSOR: 'cursor',
  COPILOT: 'copilot',
  OLLAMA: 'ollama',
  GROK: 'grok',
  XAI: 'xai',
  GENERIC: 'generic',
});

/**
 * Centralized Audit Actions
 */
export const AuditAction = Object.freeze({
  AUTH_LOGIN_SUCCESS: 'AUTH_LOGIN_SUCCESS',
  AUTH_DIRECT_LOGIN: 'AUTH_DIRECT_LOGIN',
  AUTH_LOGOUT: 'AUTH_LOGOUT',
  AUTH_LOGOUT_ALL: 'AUTH_LOGOUT_ALL',
  CONVERSATION_CREATE: 'CONVERSATION_CREATE',
  CONVERSATION_RESUME: 'CONVERSATION_RESUME',
  CONVERSATION_DELETE: 'CONVERSATION_DELETE',
  CONTEXT_ATTACH: 'CONTEXT_ATTACH',
  MESSAGE_SEND: 'MESSAGE_SEND',
  JOB_ANALYZE_MARKDOWN_GENERATE: 'JOB_ANALYZE_MARKDOWN_GENERATE',
  JOB_ANALYZE: 'JOB_ANALYZE',
});

/**
 * Common System Status Constants
 */
export const CommonStatus = Object.freeze({
  HEALTHY: 'HEALTHY',
  UNHEALTHY: 'UNHEALTHY',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
});

/**
 * Service & Runner Defaults
 */
export const DefaultServiceConstant = Object.freeze({
  SERVICE_NAME: 'gemini-model-connector',
  HEADLESS_CLI: 'HEADLESS_CLI',
  SIMULATION_FALLBACK: 'SIMULATION_FALLBACK',
  DEFAULT_DATABASE_NAME: 'model_connector.db',
});

/**
 * Environment Property Keys
 */
export const EnvPropertyKey = Object.freeze({
  PORT: 'PORT',
  HOST: 'HOST',
  NODE_ENV: 'NODE_ENV',
  APP_ENV: 'APP_ENV',
  PATH: 'PATH',
  DATA_DIR: 'DATA_DIR',
  ARTIFACTS_DIR: 'ARTIFACTS_DIR',
  DATABASE_NAME: 'DATABASE_NAME',
  GEMINI_CLI_COMMAND: 'GEMINI_CLI_COMMAND',
  GEMINI_DEFAULT_MODEL: 'GEMINI_DEFAULT_MODEL',
  GEMINI_API_BASE_URL: 'GEMINI_API_BASE_URL',
  GEMINI_EXECUTION_MODE: 'GEMINI_EXECUTION_MODE',
  GOOGLE_CLIENT_ID: 'GOOGLE_CLIENT_ID',
  GOOGLE_CLIENT_SECRET: 'GOOGLE_CLIENT_SECRET',
  OAUTH_REDIRECT_URI: 'OAUTH_REDIRECT_URI',
  DB_INIT_ENABLED: 'DB_INIT_ENABLED',
  DB_POOL_MIN: 'DB_POOL_MIN',
  DB_POOL_MAX: 'DB_POOL_MAX',
  DB_POOL_ACQUIRE_TIMEOUT_MS: 'DB_POOL_ACQUIRE_TIMEOUT_MS',
  CLI_TIMEOUT_MS: 'CLI_TIMEOUT_MS',
  ALLOW_MOCK_FALLBACK: 'ALLOW_MOCK_FALLBACK',
  OLLAMA_BASE_URL: 'OLLAMA_BASE_URL',
  OLLAMA_CLI_COMMAND: 'OLLAMA_CLI_COMMAND',
});

/**
 * Model Lifecycle Status Constants.
 */
export const ModelStatus = Object.freeze({
  ACTIVE: 'ACTIVE',
  DEPRECATED: 'DEPRECATED',
  SHUTDOWN: 'SHUTDOWN',
});

/**
 * Verified Available Models Catalog.
 * Models are explicitly categorized by lifecycle status.
 */
export const ModelCatalog = Object.freeze({
  // Google Gemini verified active models (Recommended defaults)
  GEMINI_3_5_FLASH: 'gemini-3.5-flash',
  GEMINI_3_5_FLASH_LITE: 'gemini-3.5-flash-lite',
  GEMINI_3_8_FLASH: 'gemini-3.8-flash',

  // Google Gemini deprecated / legacy models (no longer available to new users or shutdown)
  GEMINI_2_5_FLASH: 'gemini-2.5-flash',
  GEMINI_2_5_PRO: 'gemini-2.5-pro',
  GEMINI_2_0_FLASH: 'gemini-2.0-flash',
  GEMINI_2_0_FLASH_LITE: 'gemini-2.0-flash-lite',
  GEMINI_1_5_PRO: 'gemini-1.5-pro',
  GEMINI_1_5_FLASH: 'gemini-1.5-flash',

  // Anthropic Claude models
  CLAUDE_3_7_SONNET: 'claude-3-7-sonnet',
  CLAUDE_3_5_SONNET: 'claude-3-5-sonnet',
  CLAUDE_3_5_HAIKU: 'claude-3-5-haiku',

  // OpenAI / Codex models
  GPT_4O: 'gpt-4o',
  GPT_4O_MINI: 'gpt-4o-mini',
  O3_MINI: 'o3-mini',
  CODEX: 'codex',

  // GitHub Copilot models
  COPILOT: 'copilot',
  COPILOT_CHAT: 'copilot-chat',
  GITHUB_COPILOT: 'github-copilot',
  COPILOT_GPT_4O: 'copilot-gpt-4o',
  COPILOT_CLAUDE_3_5_SONNET: 'copilot-claude-3.5-sonnet',
  COPILOT_O3_MINI: 'copilot-o3-mini',

  // Local Ollama models
  TINYLLAMA: 'tinyllama',
  LLAMA_3_2: 'llama3.2',
  LLAMA_3_1: 'llama3.1',
  QWEN_3: 'qwen3',
  QWEN_3_CODER: 'qwen3-coder',
  PHI_4: 'phi4',
  GEMMA_4: 'gemma4',
  DEEPSEEK_R1: 'deepseek-r1',
  NEMOTRON_3: 'nemotron3',
  MINICPM_V: 'minicpm-v',
  QWEN_2_5_VL: 'qwen2.5vl',

  // xAI Grok models
  GROK_3: 'grok-3',
  GROK_2: 'grok-2',
  GROK_BETA: 'grok-beta',

  // Default system fallback
  DEFAULT: 'default',
});

/**
 * Active, fully supported Google Gemini models.
 */
export const ACTIVE_GEMINI_MODELS = Object.freeze([
  ModelCatalog.GEMINI_3_5_FLASH,
  ModelCatalog.GEMINI_3_5_FLASH_LITE,
  ModelCatalog.GEMINI_3_8_FLASH,
]);

/**
 * Deprecated or legacy Google Gemini models (rejected by API for new users).
 */
export const DEPRECATED_GEMINI_MODELS = Object.freeze([
  ModelCatalog.GEMINI_2_5_FLASH,
  ModelCatalog.GEMINI_2_5_PRO,
  ModelCatalog.GEMINI_2_0_FLASH,
  ModelCatalog.GEMINI_2_0_FLASH_LITE,
  ModelCatalog.GEMINI_1_5_PRO,
  ModelCatalog.GEMINI_1_5_FLASH,
]);

/**
 * Global collection of all deprecated models across providers.
 */
export const DEPRECATED_MODELS = Object.freeze([
  ...DEPRECATED_GEMINI_MODELS,
]);

/**
 * Check if a model is deprecated or shutdown.
 */
export function isModelDeprecated(model: string): boolean {
  return (DEPRECATED_MODELS as readonly string[]).includes(model.toLowerCase());
}

export const GEMINI_MODELS = Object.freeze([
  ...ACTIVE_GEMINI_MODELS,
  ...DEPRECATED_GEMINI_MODELS,
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
  ModelCatalog.GITHUB_COPILOT,
  ModelCatalog.COPILOT_GPT_4O,
  ModelCatalog.COPILOT_CLAUDE_3_5_SONNET,
  ModelCatalog.COPILOT_O3_MINI,
]);

export function isCopilotModel(model: string): boolean {
  if (!model) return false;
  const normalized = model.toLowerCase();
  return (
    normalized === ModelFamily.COPILOT ||
    normalized.includes('copilot') ||
    (COPILOT_MODELS as readonly string[]).some((m) => Boolean(m) && m.toLowerCase() === normalized)
  );
}

export const OLLAMA_MODELS = Object.freeze([
  ModelCatalog.TINYLLAMA,
  ModelCatalog.LLAMA_3_2,
  ModelCatalog.LLAMA_3_1,
  ModelCatalog.QWEN_3,
  ModelCatalog.QWEN_3_CODER,
  ModelCatalog.PHI_4,
  ModelCatalog.GEMMA_4,
  ModelCatalog.DEEPSEEK_R1,
  ModelCatalog.NEMOTRON_3,
  ModelCatalog.MINICPM_V,
  ModelCatalog.QWEN_2_5_VL,
]);

export function isFallbackModel(model: string): boolean {
  if (!model) return false;
  const normalized = model.toLowerCase().split(':')[0];
  return (
    normalized === ModelFamily.OLLAMA ||
    normalized === 'tinyllama' ||
    normalized.startsWith('ollama/') ||
    (OLLAMA_MODELS as readonly string[]).some((m) => Boolean(m) && m.toLowerCase().startsWith(normalized))
  );
}

export const isOllamaModel = isFallbackModel;

export const GROK_MODELS = Object.freeze([
  ModelCatalog.GROK_3,
  ModelCatalog.GROK_2,
  ModelCatalog.GROK_BETA,
]);

export function isGrokModel(model: string): boolean {
  if (!model) return false;
  const normalized = model.toLowerCase();
  return (
    normalized === ModelFamily.GROK ||
    normalized.includes('grok') ||
    normalized.includes('xai') ||
    (GROK_MODELS as readonly string[]).some((m) => Boolean(m) && m.toLowerCase() === normalized)
  );
}

export const KNOWN_MODELS = Object.freeze([
  ...GEMINI_MODELS,
  ...CLAUDE_MODELS,
  ...OPENAI_MODELS,
  ...COPILOT_MODELS,
  ...OLLAMA_MODELS,
  ...GROK_MODELS,
  ModelCatalog.DEFAULT,
]);

export type KnownModel = (typeof KNOWN_MODELS)[number];

/**
 * Authentication Providers & Auth Types
 */
export const AuthProviderId = Object.freeze({
  GOOGLE: 'google',
  ANTHROPIC: 'anthropic',
  OPENAI: 'openai',
  COPILOT: 'copilot',
  GITHUB: 'github',
  OLLAMA: 'ollama',
  GENERIC: 'generic',
});

export const AuthType = Object.freeze({
  OAUTH_GOOGLE: 'oauth-google',
  OAUTH_ANTHROPIC: 'oauth-anthropic',
  OAUTH_OPENAI: 'oauth-openai',
  OAUTH_COPILOT: 'oauth-copilot',
  COPILOT: 'copilot',
  OLLAMA: 'ollama',
  API_KEY: 'api-key',
  VERTEX_AI: 'vertex-ai',
});

export const AuthScheme = Object.freeze({
  BEARER: 'Bearer',
  GOOGLE_API_KEY: 'GoogleApiKey',
  ANTHROPIC_API_KEY: 'AnthropicApiKey',
  OPENAI_BEARER: 'OpenAiBearer',
  COPILOT_BEARER: 'Bearer',
  NOOP: 'NoOp',
});

export const AuthStatusConstant = Object.freeze({
  AUTHENTICATED: 'AUTHENTICATED',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
});

export const OAuthConstant = Object.freeze({
  DEFAULT_GITHUB_CLIENT_ID: 'Iv1.b507a08c87ec2b81',
});

/**
 * Execution Modes
 */
export const ExecutionMode = Object.freeze({
  AUTO: 'auto',
  API: 'api',
  CLI: 'cli',
  MOCK: 'mock',
});

export const SubscriptionTierConstant = Object.freeze({
  PAID: 'paid',
  FREEWARE: 'freeware',
});

export const SubscriptionPolicyConstant = Object.freeze({
  PAID_FIRST: 'paid_first',
  FREE_FIRST: 'free_first',
  PAID_ONLY: 'paid_only',
  FREE_ONLY: 'free_only',
});

export const ModelDiscoverySource = Object.freeze({
  API: 'api',
  CLI: 'cli',
});

/**
 * Standard HTTP Status Codes
 */
export const HttpStatus = Object.freeze({
  OK: 200,
  CREATED: 201,
  TEMPORARY_REDIRECT: 307,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
});

/**
 * Timeouts & Expiry Durations (in Milliseconds)
 */
export const TimeDurationMs = Object.freeze({
  PENDING_STATE_EXPIRY: 15 * 60 * 1000, // 15 minutes
  OAUTH_TOKEN_DEFAULT_EXPIRY: 3600 * 1000, // 1 hour
  CREDENTIAL_DEFAULT_EXPIRY: 30 * 24 * 3600 * 1000, // 30 days
  DEFAULT_CLI_TIMEOUT: 120000, // 2 minutes
  AUDIT_EXPIRY_THRESHOLD: 7 * 24 * 3600 * 1000, // 7 days
});

/**
 * Payload & File Upload Limits
 */
export const PayloadLimits = Object.freeze({
  MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024, // 5MB
});

/**
 * Autonomous Agent Lifecycle Status Constants
 */
export const AgentStatusConstant = Object.freeze({
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
});

/**
 * Autonomous Agent Approval Modes (Gemini CLI / MCP Policy Engine)
 */
export const AgentApprovalModeConstant = Object.freeze({
  DEFAULT: 'default',
  AUTO_EDIT: 'auto_edit',
  YOLO: 'yolo',
  PLAN: 'plan',
});

/**
 * Autonomous Agent Tool Identifiers across supported AI model providers
 */
export const AgentToolName = Object.freeze({
  GEMINI: 'gemini-cli-agent',
  OLLAMA: 'ollama-local-agent',
  GROK: 'grok-xai-agent',
  COPILOT: 'copilot-workspace-agent',
  CODEX: 'codex-openai-agent',
  CURSOR: 'cursor-ide-agent',
  CLAUDE: 'claude-anthropic-agent',
  GENERIC: 'generic-model-agent',
});
