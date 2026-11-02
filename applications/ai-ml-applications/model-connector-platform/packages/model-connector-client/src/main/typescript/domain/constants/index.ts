/**
 * Centralized Domain Constants & Enums for Model Connector Client.
 * Conforms to:
 * - STD-COD-002: Centralized Constants Architecture (Zero magic literals)
 * - STD-COD-004: Strict Acyclic Dependencies (Leaf Module)
 * - STD-COD-007.5: Immutability by Default
 */

import { environment } from "@model-box/model-connector-core";

export const ExecutionStrategyType = Object.freeze({
  CLI: "cli",
  API: "api",
  COOKIE: "cookie",
  OAUTH: "oauth",
  ENTERPRISE_IAM: "enterprise_iam",
});

export type ExecutionStrategy =
  (typeof ExecutionStrategyType)[keyof typeof ExecutionStrategyType];

export const GroundingStatus = Object.freeze({
  GROUNDED: "GROUNDED",
  UNGROUNDED: "UNGROUNDED",
  SEARCH_FAILED: "SEARCH_FAILED",
  FALLBACK_PARAMETRIC: "FALLBACK_PARAMETRIC",
});

export type GroundingStatusType =
  (typeof GroundingStatus)[keyof typeof GroundingStatus];

export const ModelFamily = Object.freeze({
  GEMINI: "gemini",
  CHATGPT: "chatgpt",
  CLAUDE: "claude",
  OPENAI: "openai",
  OLLAMA: "ollama",
  GROK: "grok",
  COPILOT: "copilot",
  GENERIC: "generic",
});

export type ModelFamilyType = (typeof ModelFamily)[keyof typeof ModelFamily];

export const HttpHeader = Object.freeze({
  CONTENT_TYPE: "content-type",
  AUTHORIZATION: "authorization",
  COOKIE: "cookie",
  SET_COOKIE: "set-cookie",
  X_API_KEY: "x-api-key",
  X_GOOG_API_KEY: "x-goog-api-key",
  X_CORRELATION_ID: "x-correlation-id",
  X_TRACE_ID: "x-trace-id",
  X_SESSION_ID: "x-session-id",
  X_REQUEST_ID: "x-request-id",
  X_TASK_ID: "x-task-id",
  X_USER_ID: "x-user-id",
  ACCEPT: "accept",
});

export const MimeType = Object.freeze({
  JSON: "application/json",
  TEXT_EVENT_STREAM: "text/event-stream",
  TEXT_PLAIN: "text/plain",
});

export const OLLAMA_DOCKER_CANDIDATE_URLS: readonly string[] = Object.freeze([
  "http://localhost:11435",
  "http://host.docker.internal:11435",
  "http://127.0.0.1:11435",
  "http://ollama:11434",
  "http://host.docker.internal:11434",
  "http://localhost:11434",
  "http://127.0.0.1:11434",
]);

export const DefaultEndpoint = Object.freeze({
  UPSTREAM_CONNECTOR_URL: environment.getProperty("upstream.geminiModelConnector.url", "http://127.0.0.1:8090"),
  GEMINI_CONNECTOR_URL: environment.getProperty("upstream.geminiModelConnector.url", "http://127.0.0.1:8090"),
  GEMINI_API_BASE_URL: environment.getProperty("providers.google.baseUrl", "https://generativelanguage.googleapis.com"),
  FALLBACK_API_BASE_URL: environment.getProperty("providers.ollama.baseUrl", "http://localhost:11435"),
  OLLAMA_API_BASE_URL: environment.getProperty("providers.ollama.baseUrl", "http://localhost:11435"),
  OLLAMA_OAUTH_GATEWAY_URL: environment.getProperty("urls.ollamaOAuthBaseUrl", "http://localhost:11436"),
  OAUTH_CALLBACK_BASE_URL: environment.getProperty("urls.oauthCallbackBaseUrl", "http://localhost:8085"),
  OPENAI_API_BASE_URL: environment.getProperty("providers.openai.baseUrl", "https://api.openai.com/v1"),
  ANTHROPIC_API_BASE_URL: environment.getProperty("providers.anthropic.baseUrl", "https://api.anthropic.com/v1"),
  GROK_API_BASE_URL: environment.getProperty("providers.xai.baseUrl", "https://api.x.ai/v1"),
  COPILOT_API_BASE_URL: environment.getProperty("providers.github.baseUrl", "https://api.githubcopilot.com"),
});

export const DefaultCliCommand = Object.freeze({
  DEFAULT: environment.getProperty("providers.google.cliExecutable", "gemini"),
  GEMINI: environment.getProperty("providers.google.cliExecutable", "gemini"),
  FALLBACK: environment.getProperty("providers.ollama.cliExecutable", "ollama"),
  OLLAMA: environment.getProperty("providers.ollama.cliExecutable", "ollama"),
  OPENAI: environment.getProperty("providers.openai.cliExecutable", "openai"),
  COPILOT: environment.getProperty("providers.github.cliExecutable", "github-copilot-cli"),
  CLAUDE: environment.getProperty("providers.anthropic.cliExecutable", "claude"),
  GROK: environment.getProperty("providers.xai.cliExecutable", "grok"),
});

export const DefaultTimeoutMs = Object.freeze({
  CLI_TIMEOUT: 60000,
  HTTP_TIMEOUT: 30000,
  UPSTREAM_SYNC_TIMEOUT: 10000,
  FALLBACK_TIMEOUT: 60000,
});

export const ModelCatalogDefaults = Object.freeze({
  DEFAULT_MODEL: "gemini-3.8-flash",
  DEFAULT_GEMINI_MODEL: "gemini-3.8-flash",
  DEFAULT_CLAUDE_MODEL: "claude-3-7-sonnet",
  DEFAULT_OPENAI_MODEL: "gpt-4o",
  DEFAULT_GROK_MODEL: "grok-3",
  DEFAULT_COPILOT_MODEL: "copilot-gpt-4o",
  DEFAULT_OLLAMA_MODEL: "llama3.2",
  DEFAULT_FALLBACK_MODEL: "llama3.2",
  DEFAULT_FALLBACK_PROVIDER: "ollama",
});

export const AuthStatusConstant = Object.freeze({
  AUTHENTICATED: "AUTHENTICATED",
  EXPIRED: "EXPIRED",
  UNAUTHENTICATED: "UNAUTHENTICATED",
});

export const GoogleAuthConstants = Object.freeze({
  SIGN_IN_WITH_GOOGLE: "sign_in_with_google",
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
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/generative-language",
  ]),
});

export * from "@/domain/constants/modelCliCatalog.js";
