export type ActiveTab =
  | "chat"
  | "models"
  | "sessions"
  | "upstream"
  | "workflows"
  | "onboarding"
  | "model-config"
  | "admin-rbac";

export type StrategyMode = "cli" | "api" | "cookie" | "oauth";

export interface UiUser {
  readonly userId: string;
  readonly companyId: string;
  readonly companyName: string;
  readonly roleId: string;
  readonly roleName: string;
  readonly fullName: string;
  readonly userEmail: string;
  readonly avatarUrl: string;
  readonly permissions: readonly string[];
  readonly token: string;
}

export interface UiDemoUser {
  readonly userId: string;
  readonly fullName: string;
  readonly userEmail: string;
  readonly companyId: string;
  readonly companyName: string;
  readonly roleId: string;
  readonly roleName: string;
  readonly avatarUrl: string;
}

export interface UiMenuItem {
  readonly menuId: string;
  readonly menuLabel: string;
  readonly menuIcon: string;
  readonly routePath: ActiveTab;
  readonly badgeCountKey?: "messages" | "models" | "sessions" | "auditLogs" | "accounts";
  readonly sortOrder: number;
  readonly isDefault: boolean;
  readonly requiredPermission?: string;
  readonly descriptionText?: string;
}

export interface UiExecutiveSummary {
  readonly summaryId: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly activeTasks: readonly string[];
  readonly completedTasks: readonly string[];
  readonly failedTasks: readonly string[];
  readonly completedTasksCount?: number;
  readonly activeTasksCount?: number;
  readonly failedTasksCount?: number;
  readonly executiveSummary: string;
  readonly keyDecisions: readonly string[];
  readonly slaCompliancePercentage: number;
  readonly generatedTimestamp: string;
}

export interface UiTaskTransition {
  readonly eventId: string;
  readonly taskId: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly taskType: string;
  readonly previousStatus: string;
  readonly newStatus: string;
  readonly executionOutputSummary?: string;
  readonly transitionTimestamp: string;
}

export interface ChatMessage {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly model: string;
  readonly strategy: StrategyMode;
  readonly timestamp: string;
  readonly latencyMs?: number;
  readonly tokenCount?: number;
  readonly isStreaming?: boolean;
  readonly fallbackOccurred?: boolean;
  readonly fallbackReason?: string;
  readonly requestedModel?: string;
  readonly fallbackProvider?: string;
}

export interface UiModel {
  readonly id: string;
  readonly name: string;
  readonly family: string;
  readonly tier: "paid" | "freeware";
  readonly supportedStrategies: readonly string[];
  readonly status: "ACTIVE" | "DEPRECATED" | "SHUTDOWN";
  readonly description?: string;
}

export interface UiSession {
  readonly sessionId: string;
  readonly model: string;
  readonly strategy: string;
  readonly turnCount: number;
  readonly createdAt: string;
  readonly lastActiveAt: string;
  readonly cookies: readonly {
    readonly name: string;
    readonly value: string;
  }[];
}

export interface UiUpstreamHealth {
  readonly status: string;
  readonly service: string;
  readonly uptimeSeconds?: number;
  readonly cliStatus?: Record<string, unknown>;
  readonly apiStatus?: Record<string, unknown>;
}

export interface UiAuditRecord {
  readonly id: string;
  readonly action: string;
  readonly modelUsed: string;
  readonly status: string;
  readonly latencyMs: number;
  readonly timestamp: string;
  readonly clientIp?: string;
  readonly message?: string;
  readonly sessionId?: string;
  readonly correlationId?: string;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly errorMessage?: string;
  readonly strategyMode?: string;
}

export interface UiModelAccount {
  readonly accountId: string;
  readonly modelId: string;
  readonly accountName: string;
  readonly userEmail: string;
  readonly authType: "api_key" | "cookie" | "cli_oauth" | "api" | "cli" | "oauth";
  readonly credentialValue: string;
  readonly maskedCredential?: string;
  readonly isActive: boolean;
  readonly accountCategory?: "individual" | "enterprise";
  readonly customLocation?: string;
  readonly credentialsFileContent?: string;
  readonly authMethod?: string;
  readonly config?: {
    readonly apiBaseUrl?: string;
    readonly apiVersion?: string;
    readonly headers?: Record<string, string>;
    readonly cliExecutable?: string;
    readonly cliArguments?: string;
    readonly cliWorkingDir?: string;
    readonly cookieDomain?: string;
    readonly cookiePath?: string;
    readonly oauthClientId?: string;
    readonly oauthClientSecret?: string;
    readonly oauthAuthUrl?: string;
    readonly oauthTokenUrl?: string;
    readonly oauthScopes?: string;
    readonly oauthRedirectUri?: string;
    readonly accountCategory?: "individual" | "enterprise";
    readonly customLocation?: string;
    readonly credentialsFileContent?: string;
    readonly authMethod?: string;
  };
  readonly createdTimestamp: string;
  readonly updatedTimestamp: string;
}

export interface TokenMetrics {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  readonly contextLimit: number;
  readonly percentConsumed: number;
  readonly percentLeft: number;
}

export interface TestConnectionResult {
  readonly status: "VERIFIED" | "FAILED";
  readonly protocol: string;
  readonly message: string;
  readonly latencyMs: number;
  readonly modelOutput?: string;
  readonly errorMessage?: string;
  readonly details: Record<string, unknown>;
  readonly correlationId?: string;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly modelName?: string;
  readonly cliName?: string;
  readonly cliVersion?: string;
  readonly effortTier?: "low" | "medium" | "high";
  readonly tokenMetrics?: TokenMetrics;
}

export interface UiCategory {
  readonly categoryId: string;
  readonly label: string;
  readonly icon: string;
  readonly accentColor: string;
  readonly description: string;
  readonly sortOrder: number;
}

export interface UiModelOAuthConfig {
  readonly modelId: string;
  readonly provider: string;
  readonly providerName: string;
  readonly providerIcon: string;
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly cliCommand: string;
  readonly defaultScopes: readonly string[];
  readonly defaultClientId: string;
  readonly redirectUri: string;
  readonly authorizationUrl: string;
  readonly executableLaunchUrl?: string;
  readonly requiresClientRegistration?: boolean;
  readonly defaultRedirectUri?: string;
  readonly accountCategory?: "individual" | "enterprise";
  readonly structuredParams?: {
    readonly clientId: string;
    readonly redirectUri: string;
    readonly scopes: readonly string[];
    readonly state: string;
    readonly responseType: string;
    readonly accessType: string;
    readonly prompt: string;
  };
}

export interface UiOAuthExchangeResult {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly tokenType: string;
  readonly expiresInSeconds: number;
  readonly scopes: readonly string[];
  readonly userEmail: string;
  readonly provider: string;
  readonly authorizedTimestamp: string;
}

export interface UiIntegration {
  readonly integrationId: string;
  readonly providerName: string;
  readonly providerShortCode: string;
  readonly category: string;
  readonly description: string;
  readonly icon: string;
  readonly brandColor: string;
  readonly accountCategory: "individual" | "enterprise";
  readonly supportedProtocols: readonly string[];
  readonly capabilities: readonly string[];
  readonly authUrl: string;
  readonly tokenUrl: string;
  readonly apiBaseUrl: string;
  readonly cliCommand: string;
  readonly docsUrl: string;
  readonly lifecycleStatus: "ACTIVE" | "INACTIVE" | "DRAFT";
  readonly createdBy?: string;
  readonly updatedBy?: string;
  readonly createdTimestamp?: string;
  readonly updatedTimestamp?: string;
}

export interface UpsertIntegrationPayload {
  readonly integrationId: string;
  readonly providerName: string;
  readonly providerShortCode?: string;
  readonly category: string;
  readonly description?: string;
  readonly icon?: string;
  readonly brandColor?: string;
  readonly accountCategory?: "individual" | "enterprise";
  readonly supportedProtocols: readonly string[];
  readonly capabilities: readonly string[];
  readonly authUrl?: string;
  readonly tokenUrl?: string;
  readonly apiBaseUrl?: string;
  readonly cliCommand?: string;
  readonly docsUrl?: string;
  readonly lifecycleStatus?: "ACTIVE" | "INACTIVE" | "DRAFT";
}

export interface StagedIntegrationAccount {
  readonly accountId: string;
  readonly isPersisted: boolean;
  readonly accountName: string;
  readonly userEmail: string;
  readonly authType: StrategyMode;
  readonly credentialValue: string;
  readonly isActive: boolean;
  readonly effortTier: "low" | "medium" | "high";
  readonly config: {
    readonly apiBaseUrl?: string;
    readonly apiVersion?: string;
    readonly authUrl?: string;
    readonly tokenUrl?: string;
    readonly oauthClientId?: string;
    readonly oauthClientSecret?: string;
    readonly oauthScopes?: string;
    readonly redirectUri?: string;
    readonly cliExecutable?: string;
    readonly cliArguments?: string;
    readonly cookieDomain?: string;
  };
}
