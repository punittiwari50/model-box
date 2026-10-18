import path from 'node:path';
import { environment, type Environment } from '@/core/config/environment.js';
import { projectRoot } from '@/core/utils/io/pathUtils.js';
import { NetworkConstant, OAuthConstant } from '@/domain/constants/index.js';
import { ModelProperties, type ModelProviderConfig, type ModelSubscriptionConfig } from '@/core/config/properties/modelProperties.js';

export interface ProviderAuthConfig {
  readonly authUrl: string;
  readonly tokenUrl?: string;
  readonly userInfoUrl?: string;
  readonly apiBaseUrl?: string;
  readonly defaultScope?: string;
  readonly codeChallengeMethod?: string;
  readonly responseType?: string;
  readonly accessType?: string;
  readonly prompt?: string;
  readonly userCodeUri?: string;
  readonly apiVersion?: string;
  readonly deviceCodeUrl?: string;
  readonly copilotTokenUrl?: string;
}

export interface DefaultAccountConfig {
  readonly email: string;
  readonly name: string;
}

export interface AuthEndpointsConfig {
  readonly providers: Readonly<Record<string, ProviderAuthConfig>>;
  getProvider(providerKey: string): ProviderAuthConfig;
  readonly googleAuthUrl: string;
  readonly googleTokenUrl: string;
  readonly googleUserInfoUrl: string;
  readonly googleDefaultScope: string;
  readonly googleCodeChallengeMethod: string;
  readonly googleResponseType: string;
  readonly googleAccessType: string;
  readonly googlePrompt: string;
  readonly googleUserCodeUri: string;
  readonly anthropicAuthUrl: string;
  readonly anthropicApiBaseUrl: string;
  readonly anthropicVersion: string;
  readonly openAiAuthUrl: string;
  readonly openAiApiBaseUrl: string;
  readonly copilotAuthUrl: string;
  readonly copilotTokenUrl: string;
  readonly copilotDeviceCodeUrl: string;
  readonly copilotUserInfoUrl: string;
  readonly copilotApiBaseUrl: string;
}

/**
 * Strongly-typed Application Configuration Properties Interface.
 * Conforms to:
 * - STD-COD-002: Centralized Configuration Properties Pattern
 * - STD-COD-007.5: Immutability by Default (readonly schema)
 */
export interface AppConfig {
  readonly env: string;
  readonly port: number;
  readonly host: string;

  // Storage directories & Datasource
  readonly projectRoot: string;
  readonly dataDir: string;
  readonly artifactsDir: string;
  readonly agentsDir: string;
  readonly databaseName: string;

  // Model CLI & API Configuration (Generic & Model-Agnostic)
  readonly defaultModel: string;
  readonly fallbackModel: string;
  readonly fallbackThresholdPercentage: number;
  readonly cliCommand: string;
  readonly geminiCliCommand: string;
  readonly geminiDefaultModel: string;
  readonly apiKey: string;
  readonly geminiApiKey: string;
  readonly googleApiKey: string;
  readonly geminiApiBaseUrl: string;
  readonly geminiExecutionMode: 'auto' | 'api' | 'cli' | 'mock';
  readonly googleGenaiUseVertexAi: boolean;
  readonly googleCloudProject: string;
  readonly cliTimeoutMs: number;
  readonly allowMockFallback: boolean;
  readonly subscriptionPolicy: string;

  getModelConfig(familyOrModel: string): ModelProviderConfig;
  getApiKey(familyOrModel: string): string | undefined;
  getApiBaseUrl(familyOrModel: string): string | undefined;
  getCliCommand(familyOrModel: string): string | undefined;
  getMaxTokens(familyOrModel: string): number;
  getAccountEmail(familyOrModel: string): string;
  getAccountName(familyOrModel: string): string;
  getModelTier(familyOrModel: string): 'paid' | 'freeware';
  isFallbackModel(familyOrModel: string): boolean;
  resolveFamilyKey(familyOrModel: string): string;
  getSubscription(familyOrModel: string, tier: 'paid' | 'freeware'): ModelSubscriptionConfig;
  getModelSubscriptions(familyOrModel: string): readonly ModelSubscriptionConfig[];

  // Authentication Configuration (Generic Provider Mapping)
  readonly defaultAccount: DefaultAccountConfig;
  readonly authEndpoints: AuthEndpointsConfig;
  readonly auth: {
    readonly providers: Readonly<Record<string, ProviderAuthConfig>>;
    getProvider(providerKey: string): ProviderAuthConfig;
    readonly defaultAccount: DefaultAccountConfig;
  };

  // Google & GitHub / Copilot OAuth Settings (Retrieved exclusively via Environment/.env)
  readonly googleClientId: string;
  readonly googleClientSecret: string;
  readonly githubClientId: string;
  readonly githubClientSecret: string;
  readonly oauthRedirectUri: string;
  readonly geminiOAuthUserCodeUri: string;

  // Job Search Agent limits
  readonly maxFileSizeBytes: number;

  // Datasource Connection Pool & Schema Loader Configuration
  readonly dbInitEnabled: boolean;
  readonly dbPoolMin: number;
  readonly dbPoolMax: number;
  readonly dbPoolAcquireTimeoutMs: number;
}

const resolvedApiKey =
  environment.getProperty('models.gemini.apiKey', '') ||
  environment.getProperty('model.gemini.apiKey', '') ||
  environment.getProperty('model.apiKey', '') ||
  environment.getProperty('models.default.apiKey', '') ||
  environment.getProperty('MODEL_API_KEY', '') ||
  environment.getProperty('API_KEY', '') ||
  environment.getProperty('GEMINI_API_KEY', '') ||
  environment.getProperty('GOOGLE_API_KEY', '');

const executionMode = (environment.getProperty('GEMINI_EXECUTION_MODE', 'auto') as
  | 'auto'
  | 'api'
  | 'cli'
  | 'mock');

const googleConfig: ProviderAuthConfig = Object.freeze({
  authUrl: environment.getProperty('auth.endpoints.google.authUrl', 'https://accounts.google.com/o/oauth2/v2/auth'),
  tokenUrl: environment.getProperty('auth.endpoints.google.tokenUrl', 'https://oauth2.googleapis.com/token'),
  userInfoUrl: environment.getProperty('auth.endpoints.google.userInfoUrl', 'https://www.googleapis.com/oauth2/v3/userinfo'),
  defaultScope: environment.getProperty(
    'auth.endpoints.google.defaultScope',
    'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid'
  ),
  codeChallengeMethod: environment.getProperty('auth.endpoints.google.codeChallengeMethod', 'S256'),
  responseType: environment.getProperty('auth.endpoints.google.responseType', 'code'),
  accessType: environment.getProperty('auth.endpoints.google.accessType', 'offline'),
  prompt: environment.getProperty('auth.endpoints.google.prompt', 'consent'),
  userCodeUri: environment.getProperty('auth.endpoints.google.userCodeUri', 'https://codeassist.google.com/authcode'),
});

const anthropicConfig: ProviderAuthConfig = Object.freeze({
  authUrl: environment.getProperty('auth.endpoints.anthropic.authUrl', 'https://console.anthropic.com/settings/keys'),
  apiBaseUrl: environment.getProperty('auth.endpoints.anthropic.apiBaseUrl', 'https://api.anthropic.com'),
  apiVersion: environment.getProperty('auth.endpoints.anthropic.version', '2023-06-01'),
});

const openAiConfig: ProviderAuthConfig = Object.freeze({
  authUrl: environment.getProperty('auth.endpoints.openai.authUrl', 'https://platform.openai.com/api-keys'),
  apiBaseUrl: environment.getProperty('auth.endpoints.openai.apiBaseUrl', 'https://api.openai.com/v1'),
});

const ollamaConfig: ProviderAuthConfig = Object.freeze({
  authUrl: environment.getProperty('OLLAMA_BASE_URL', environment.getProperty('auth.endpoints.ollama.authUrl', NetworkConstant.DEFAULT_OLLAMA_URL)),
  apiBaseUrl: environment.getProperty('OLLAMA_BASE_URL', environment.getProperty('model.ollama.apiBaseUrl', NetworkConstant.DEFAULT_OLLAMA_URL)),
});

const copilotConfig: ProviderAuthConfig = Object.freeze({
  authUrl: environment.getProperty('auth.endpoints.copilot.authUrl', 'https://github.com/login/oauth/authorize'),
  tokenUrl: environment.getProperty('auth.endpoints.copilot.tokenUrl', 'https://github.com/login/oauth/access_token'),
  deviceCodeUrl: environment.getProperty('auth.endpoints.copilot.deviceCodeUrl', 'https://github.com/login/device/code'),
  userInfoUrl: environment.getProperty('auth.endpoints.copilot.userInfoUrl', 'https://api.github.com/user'),
  copilotTokenUrl: environment.getProperty('auth.endpoints.copilot.copilotTokenUrl', 'https://api.github.com/copilot_internal/v2/token'),
  apiBaseUrl: environment.getProperty('COPILOT_BASE_URL', environment.getProperty('model.copilot.apiBaseUrl', 'https://api.githubcopilot.com')),
  defaultScope: environment.getProperty('auth.endpoints.copilot.defaultScope', 'read:user,copilot'),
});

const providersMap: Readonly<Record<string, ProviderAuthConfig>> = Object.freeze({
  google: googleConfig,
  anthropic: anthropicConfig,
  openai: openAiConfig,
  copilot: copilotConfig,
  github: copilotConfig,
  ollama: ollamaConfig,
});

const defaultAccountConfig: DefaultAccountConfig = Object.freeze({
  email: environment.getProperty('auth.defaultAccount.email', 'enterprise-user@internal.modelbox'),
  name: environment.getProperty('auth.defaultAccount.name', 'Enterprise Authenticated User'),
});

export const modelProperties = new ModelProperties(environment);

/**
 * Application configuration loaded exclusively via the Environment abstraction.
 * Direct process.env reads and hardcoded sensitive credentials are eliminated (STD-COD-002, Invariant #7).
 */
export const config: AppConfig = Object.freeze({
  env: environment.getProperty('NODE_ENV', 'development'),
  port: environment.getPropertyAsNumber('PORT', 8090),
  host: environment.getProperty('HOST', NetworkConstant.LOOPBACK_IP),

  // Storage directories & Datasource
  projectRoot,
  dataDir: environment.getProperty('storage.dataDir', environment.getProperty('DATA_DIR', path.join(projectRoot, 'config', 'data'))),
  artifactsDir: environment.getProperty('storage.artifactsDir', environment.getProperty('ARTIFACTS_DIR', path.join(projectRoot, 'config', 'artifacts'))),
  agentsDir: environment.getProperty('storage.agentsDir', environment.getProperty('AGENTS_DIR', path.join(projectRoot, 'AGENTS'))),
  databaseName: environment.getProperty('datasource.name', environment.getProperty('storage.databaseName', environment.getProperty('DATABASE_NAME', 'gemini_connector.db'))),

  // Model CLI & API Configuration (Generic & Model-Agnostic)
  defaultModel: modelProperties.defaultModel,
  fallbackModel: modelProperties.fallbackModel,
  fallbackThresholdPercentage: modelProperties.fallbackThresholdPercentage,
  cliCommand: modelProperties.cliCommand,
  geminiCliCommand: modelProperties.cliCommand,
  geminiDefaultModel: modelProperties.defaultModel,
  apiKey: resolvedApiKey,
  geminiApiKey: resolvedApiKey,
  googleApiKey: resolvedApiKey,
  geminiApiBaseUrl: modelProperties.getApiBaseUrl('gemini') || 'https://generativelanguage.googleapis.com',
  geminiExecutionMode: ['auto', 'api', 'cli', 'mock'].includes(executionMode) ? executionMode : 'auto',
  googleGenaiUseVertexAi: environment.getPropertyAsBoolean('model.googleGenaiUseVertexAi', environment.getPropertyAsBoolean('models.gemini.useVertexAi', environment.getPropertyAsBoolean('GOOGLE_GENAI_USE_VERTEXAI', false))),
  googleCloudProject: environment.getProperty('model.googleCloudProject', environment.getProperty('models.gemini.cloudProject', environment.getProperty('GOOGLE_CLOUD_PROJECT', ''))),
  cliTimeoutMs: modelProperties.cliTimeoutMs,
  allowMockFallback: modelProperties.allowMockFallback,

  getModelConfig: (familyOrModel: string) => modelProperties.getModelConfig(familyOrModel),
  getApiKey: (familyOrModel: string) => modelProperties.getApiKey(familyOrModel),
  getApiBaseUrl: (familyOrModel: string) => modelProperties.getApiBaseUrl(familyOrModel),
  getCliCommand: (familyOrModel: string) => modelProperties.getCliCommand(familyOrModel),
  getMaxTokens: (familyOrModel: string) => modelProperties.getMaxTokens(familyOrModel),
  getAccountEmail: (familyOrModel: string) => modelProperties.getAccountEmail(familyOrModel),
  getAccountName: (familyOrModel: string) => modelProperties.getAccountName(familyOrModel),
  getModelTier: (familyOrModel: string) => modelProperties.getModelTier(familyOrModel),
  isFallbackModel: (familyOrModel: string) => modelProperties.isFallbackModel(familyOrModel),
  resolveFamilyKey: (familyOrModel: string) => modelProperties.resolveFamilyKey(familyOrModel),
  getSubscription: (familyOrModel: string, tier: 'paid' | 'freeware') => modelProperties.getSubscription(familyOrModel, tier),
  getModelSubscriptions: (familyOrModel: string) => modelProperties.getModelSubscriptions(familyOrModel),
  subscriptionPolicy: modelProperties.subscriptionPolicy,

  // Default Authenticated Account (Sourced from application.yml)
  defaultAccount: Object.freeze({
    email: environment.getProperty('auth.defaultAccount.email', 'enterprise-user@internal.modelbox'),
    name: environment.getProperty('auth.defaultAccount.name', 'Enterprise Authenticated User'),
  }),

  // Authentication configuration and generic providers map
  auth: Object.freeze({
    providers: providersMap,
    getProvider(providerKey: string): ProviderAuthConfig {
      const p = providersMap[providerKey.toLowerCase()];
      if (!p) {
        throw new Error(`[Config] Unknown auth provider: '${providerKey}'`);
      }
      return p;
    },
    defaultAccount: defaultAccountConfig,
  }),

  // Authentication Endpoints loaded dynamically from application.yml
  authEndpoints: Object.freeze({
    providers: providersMap,
    getProvider(providerKey: string): ProviderAuthConfig {
      const p = providersMap[providerKey.toLowerCase()];
      if (!p) {
        throw new Error(`[Config] Unknown auth provider: '${providerKey}'`);
      }
      return p;
    },
    googleAuthUrl: googleConfig.authUrl,
    googleTokenUrl: googleConfig.tokenUrl || '',
    googleUserInfoUrl: googleConfig.userInfoUrl || '',
    googleDefaultScope: googleConfig.defaultScope || '',
    googleCodeChallengeMethod: googleConfig.codeChallengeMethod || 'S256',
    googleResponseType: googleConfig.responseType || 'code',
    googleAccessType: googleConfig.accessType || 'offline',
    googlePrompt: googleConfig.prompt || 'consent',
    googleUserCodeUri: googleConfig.userCodeUri || '',
    anthropicAuthUrl: anthropicConfig.authUrl,
    anthropicApiBaseUrl: anthropicConfig.apiBaseUrl || '',
    anthropicVersion: anthropicConfig.apiVersion || '2023-06-01',
    openAiAuthUrl: openAiConfig.authUrl,
    openAiApiBaseUrl: openAiConfig.apiBaseUrl || '',
    copilotAuthUrl: copilotConfig.authUrl,
    copilotTokenUrl: copilotConfig.tokenUrl || '',
    copilotDeviceCodeUrl: copilotConfig.deviceCodeUrl || '',
    copilotUserInfoUrl: copilotConfig.userInfoUrl || '',
    copilotApiBaseUrl: copilotConfig.apiBaseUrl || '',
  }),

  // Google & GitHub / Copilot OAuth Settings (Sourced dynamically from application.yml / env)
  googleClientId: environment.getProperty('auth.googleClientId', environment.getProperty('auth.endpoints.google.clientId', environment.getProperty('GOOGLE_CLIENT_ID', ''))),
  googleClientSecret: environment.getProperty('auth.googleClientSecret', environment.getProperty('auth.endpoints.google.clientSecret', environment.getProperty('GOOGLE_CLIENT_SECRET', ''))),
  githubClientId: environment.getProperty('auth.githubClientId', environment.getProperty('auth.endpoints.copilot.clientId', environment.getProperty('GITHUB_CLIENT_ID', environment.getProperty('COPILOT_CLIENT_ID', OAuthConstant.DEFAULT_GITHUB_CLIENT_ID)))),
  githubClientSecret: environment.getProperty('auth.githubClientSecret', environment.getProperty('auth.endpoints.copilot.clientSecret', environment.getProperty('GITHUB_CLIENT_SECRET', environment.getProperty('COPILOT_CLIENT_SECRET', '')))),
  oauthRedirectUri: environment.getProperty('auth.oauthRedirectUri', environment.getProperty('auth.endpoints.google.redirectUri', environment.getProperty('OAUTH_REDIRECT_URI', NetworkConstant.DEFAULT_OAUTH_REDIRECT_URI))),
  geminiOAuthUserCodeUri: environment.getProperty('auth.geminiOAuthUserCodeUri', environment.getProperty('auth.endpoints.google.userCodeUri', environment.getProperty('GEMINI_OAUTH_USER_CODE_URI', 'https://codeassist.google.com/authcode'))),

  // Limits
  maxFileSizeBytes: 5 * 1024 * 1024,

  // Datasource Connection Pool & Schema Loader Configuration
  dbInitEnabled: environment.getPropertyAsBoolean('datasource.init.enabled', environment.getPropertyAsBoolean('DB_INIT_ENABLED', false)),
  dbPoolMin: environment.getPropertyAsNumber('datasource.pool.min', environment.getPropertyAsNumber('DB_POOL_MIN', 1)),
  dbPoolMax: environment.getPropertyAsNumber('datasource.pool.max', environment.getPropertyAsNumber('DB_POOL_MAX', 5)),
  dbPoolAcquireTimeoutMs: environment.getPropertyAsNumber('datasource.pool.acquireTimeoutMs', environment.getPropertyAsNumber('DB_POOL_ACQUIRE_TIMEOUT_MS', 5000)),
});

export * from '@/core/config/rest/index.js';
export * from '@/core/config/queue/index.js';
export * from '@/core/config/websocket/index.js';
export * from '@/core/config/security/index.js';

import {
  DataSourceProperties,
  TransactionProperties,
  RestClientProperties,
  QueueProperties,
  SecurityProperties,
  ResilienceProperties,
} from '@/core/config/properties/index.js';

export {
  DataSourceProperties,
  TransactionProperties,
  RestClientProperties,
  QueueProperties,
  SecurityProperties,
  ResilienceProperties,
  ModelProperties,
  type ModelProviderConfig,
};
import { RestClientConfig, Http2Config } from '@/core/config/rest/index.js';
import { QueueConfig } from '@/core/config/queue/index.js';
import { WebsocketConfig } from '@/core/config/websocket/index.js';

export const dataSourceProperties = new DataSourceProperties(environment, config.dataDir);
export const databaseProperties = dataSourceProperties;
export const transactionProperties = new TransactionProperties(environment);
export const restClientProperties = new RestClientProperties(environment);
export const queueProperties = new QueueProperties(environment);
export const securityProperties = new SecurityProperties(environment);
export const resilienceProperties = new ResilienceProperties(environment);

export const restClientConfig = new RestClientConfig(environment);
export const http2Config = new Http2Config(environment);
export const queueConfig = new QueueConfig(environment);
export const websocketConfig = new WebsocketConfig(environment);

export { environment, type Environment };
export { projectRoot } from '@/core/utils/io/pathUtils.js';
