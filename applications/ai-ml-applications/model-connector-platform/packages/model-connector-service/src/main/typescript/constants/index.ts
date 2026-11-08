import { environment, modelProviderConfigService, ModelCatalog, ProviderId } from "@model-box/model-connector-core";
export { ModelCatalog, ProviderId };

/**
 * Centralized Service Constants sourced from application.yml.
 * Conforms to STD-COD-002: Zero magic literals.
 */

export const EnvironmentProfile = Object.freeze({
  DEVELOPMENT: "development",
  PRODUCTION: "production",
  TEST: "test",
});

export const ConfigProperty = Object.freeze({
  IS_BUILDER: "is.builder",
  CONTAINER_ROLE: "container.role",
  NODE_ENV: "node.env",
  BUILDER_ROLE: "builder",
});

export const ServiceConstant = Object.freeze({
  SERVICE_NAME: environment.getProperty("service.name", "model-connector-service"),
  VERSION: environment.getProperty("service.version", "1.0.0"),
  API_PREFIX: environment.getProperty("server.apiPrefix", "/api/v1"),
  DEFAULT_PORT: environment.getPropertyAsNumber("server.port", 8095),
  DEFAULT_HOST: environment.getProperty("server.host", "0.0.0.0"),
  DEFAULT_UPSTREAM_URL: environment.getProperty("upstream.geminiModelConnector.url", "http://127.0.0.1:8090"),
  DEFAULT_FALLBACK_BASE_URL: modelProviderConfigService.getProviderConfig(ProviderId.OLLAMA).baseUrl,
  DEFAULT_FALLBACK_PROVIDER: environment.getProperty("connector.fallback.provider", ProviderId.OLLAMA),
  DEFAULT_FALLBACK_MODEL: environment.getProperty("connector.fallback.model", ModelCatalog.LLAMA_3_2),
  DEFAULT_FALLBACK_CLI_COMMAND: modelProviderConfigService.getProviderConfig(ProviderId.OLLAMA).cliExecutable,
  DEFAULT_MODEL: environment.getProperty("connector.defaultModel", ModelCatalog.GEMINI_3_8_FLASH),
  DEFAULT_LOG_LEVEL: environment.getProperty("logging.level", "info"),
  DEFAULT_CORS_ORIGINS: "*",
  DEFAULT_QUERY_LIMIT: 50,
  MAX_QUERY_LIMIT: 1000,
  MIN_QUERY_LIMIT: 1,
  DEFAULT_OFFSET: 0,
});

export const HttpStatus = Object.freeze({
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  REQUEST_TIMEOUT: 408,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
});

export const HttpHeader = Object.freeze({
  CORRELATION_ID: "x-correlation-id",
  TRACE_ID: "x-trace-id",
  SPAN_ID: "x-span-id",
  TRACEPARENT: "traceparent",
  CONTENT_TYPE: "content-type",
  CACHE_CONTROL: "cache-control",
  CONNECTION: "connection",
});

export const OAuthConstants = Object.freeze({
  DEFAULT_CALLBACK_URL: modelProviderConfigService.getPlatformUrl("oauthCallbackUrl"),
  DEFAULT_UI_BASE_URL: modelProviderConfigService.getPlatformUrl("uiBaseUrl"),
  DEFAULT_AUTHORIZE_CHOOSER_URL: modelProviderConfigService.getPlatformUrl("oauthAuthorizeChooserUrl"),
  RESPONSE_TYPE_CODE: "code",
  ACCESS_TYPE_OFFLINE: "offline",
  PROMPT_CONSENT: "select_account consent",
});


