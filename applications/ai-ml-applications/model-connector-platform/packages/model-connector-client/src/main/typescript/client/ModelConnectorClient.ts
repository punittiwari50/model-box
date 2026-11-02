import { timerUtils, randomUUID } from "@model-box/model-connector-core";
import { ExecutionStrategyType, ModelCatalogDefaults } from "@/domain/constants/index.js";
import type { ExecutionStrategy } from "@/domain/constants/index.js";
import type {
  ExecutionRequest,
  ExecutionResponse,
  StreamChunk,
} from "@/domain/models/execution.types.js";
import type {
  ModelChatPayload,
  ModelChatResponse,
} from "@/domain/models/grounding.types.js";
import type { ModelDescriptor } from "@/domain/models/model.types.js";
import type {
  ModelSession,
  UpstreamAuthStatus,
  UpstreamAuditLog,
} from "@/domain/models/session.types.js";
import type { IConnectorStrategy } from "@/strategies/IConnectorStrategy.js";
import { CliConnectorStrategy } from "@/strategies/cli/CliConnectorStrategy.js";
import {
  defaultCliExecutionCoordinator,
  type ICliExecutionCoordinator,
} from "@/strategies/cli/CliExecutionCoordinator.js";
import { ApiConnectorStrategy } from "@/strategies/api/ApiConnectorStrategy.js";
import { CookieConnectorStrategy } from "@/strategies/cookie/CookieConnectorStrategy.js";
import { OAuthConnectorStrategy } from "@/strategies/oauth/OAuthConnectorStrategy.js";
import {
  defaultModelOAuthStrategyRegistry,
  type IModelOAuthStrategyRegistry,
  type OAuthAuthorizationBuildRequest,
  type OAuthAuthorizationDescriptor,
} from "@/strategies/oauth/ModelOAuthStrategyRegistry.js";
import {
  defaultUserModelCredentialResolver,
  type CredentialLookupCriteria,
  type IUserModelCredentialResolver,
  type ResolvedUserModelCredential,
} from "@/security/UserModelCredentialResolver.js";
import {
  defaultOllamaDockerFallbackConnector,
  type IOllamaDockerFallbackConnector,
  type OllamaDockerEndpointStatus,
} from "@/adapters/OllamaDockerFallbackConnector.js";
import { SessionLineageManager } from "@/strategies/cookie/SessionLineageManager.js";
import { UnifiedModelExecutionAdapter } from "@/adapters/UnifiedModelExecutionAdapter.js";
import { GoogleSearchAiGroundingEngine } from "@/grounding/GoogleSearchAiGroundingEngine.js";
import { DynamicFallbackCascadeHandler } from "@/client/DynamicFallbackCascadeHandler.js";
import { ModelConnectorException } from "@/domain/errors/domainExceptions.js";

export interface ClientConfig {
  readonly defaultStrategy?: ExecutionStrategy;
  readonly upstreamUrl?: string;
  readonly apiKey?: string;
  readonly defaultModel?: string;
  readonly credentialResolver?: IUserModelCredentialResolver;
  readonly oauthRegistry?: IModelOAuthStrategyRegistry;
  readonly cliCoordinator?: ICliExecutionCoordinator;
  readonly ollamaFallback?: IOllamaDockerFallbackConnector;
}

/**
 * Enterprise Model Connector Client with Omni-Auth, User/Task Correlation,
 * Database-Backed Credential Resolution, and Ollama Docker Container Fallback.
 */
export class ModelConnectorClient {
  private readonly strategies = new Map<ExecutionStrategy, IConnectorStrategy>();
  private readonly upstreamAdapter: UnifiedModelExecutionAdapter;
  private readonly sessionManager: SessionLineageManager;
  private readonly groundingEngine: GoogleSearchAiGroundingEngine;
  private readonly defaultStrategy: ExecutionStrategy;
  private readonly defaultModel?: string;
  private readonly credentialResolver: IUserModelCredentialResolver;
  private readonly oauthRegistry: IModelOAuthStrategyRegistry;
  private readonly cliCoordinator: ICliExecutionCoordinator;
  private readonly ollamaFallback: IOllamaDockerFallbackConnector;

  constructor(config: ClientConfig = {}) {
    this.sessionManager = new SessionLineageManager();
    this.groundingEngine = new GoogleSearchAiGroundingEngine();
    this.defaultStrategy = config.defaultStrategy || ExecutionStrategyType.API;
    this.defaultModel = config.defaultModel;
    this.credentialResolver = config.credentialResolver || defaultUserModelCredentialResolver;
    this.oauthRegistry = config.oauthRegistry || defaultModelOAuthStrategyRegistry;
    this.cliCoordinator = config.cliCoordinator || defaultCliExecutionCoordinator;
    this.ollamaFallback = config.ollamaFallback || defaultOllamaDockerFallbackConnector;
    this.upstreamAdapter = new UnifiedModelExecutionAdapter(config.upstreamUrl, this.ollamaFallback);
    this.initializeStrategies();
  }

  public registerStrategy(strategy: IConnectorStrategy): void {
    this.strategies.set(strategy.strategyType, strategy);
  }

  public getDefaultModel(): string | undefined {
    return this.defaultModel;
  }

  public getGroundingEngine(): GoogleSearchAiGroundingEngine {
    return this.groundingEngine;
  }

  public getCredentialResolver(): IUserModelCredentialResolver {
    return this.credentialResolver;
  }

  public buildOAuthAuthorizationConfig(
    request: OAuthAuthorizationBuildRequest,
  ): OAuthAuthorizationDescriptor {
    return this.oauthRegistry.resolveByModel(request.modelId).buildOAuthAuthorizationConfig(request);
  }

  public resolveUserCredential(
    criteria: CredentialLookupCriteria,
  ): ResolvedUserModelCredential | null {
    return this.credentialResolver.resolveUserCredential(criteria);
  }

  public async discoverOllamaDockerEndpoint(
    preferredModel?: string,
    bearerToken?: string,
  ): Promise<OllamaDockerEndpointStatus | null> {
    return this.ollamaFallback.discoverHealthyEndpoint(preferredModel, bearerToken);
  }

  public async execute(request: ExecutionRequest): Promise<ExecutionResponse> {
    const resolvedRequest = this.resolveExecutionRequest(request);
    const strategy = this.resolveStrategy(resolvedRequest.strategy);
    const result = await DynamicFallbackCascadeHandler.executeWithCascade(
      strategy,
      resolvedRequest,
      (s) => this.strategies.get(s),
      this.ollamaFallback,
    );
    return this.ensureRequestCorrelationBound(result.response, resolvedRequest);
  }

  public async executeChat(
    payload: ModelChatPayload,
    correlationId?: string,
  ): Promise<ModelChatResponse> {
    const resolvedCorrId = correlationId || payload.correlationId || randomUUID();
    const startTime = timerUtils.now();
    const request = this.mapChatPayloadToRequest(payload, resolvedCorrId);
    const executionResult = await this.execute(request);
    return this.applyGroundingIfRequested(payload, executionResult, startTime, resolvedCorrId);
  }

  public async stream(
    request: ExecutionRequest,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<ExecutionResponse> {
    const resolvedRequest = this.resolveExecutionRequest(request);
    const strategy = this.resolveStrategy(resolvedRequest.strategy);
    const response = await strategy.stream(resolvedRequest, onChunk);
    return this.ensureRequestCorrelationBound(response, resolvedRequest);
  }

  public async executeChatStream(
    payload: ModelChatPayload,
    onChunk: (chunk: StreamChunk) => void,
    correlationId?: string,
  ): Promise<ModelChatResponse> {
    const resolvedCorrId = correlationId || payload.correlationId || randomUUID();
    const startTime = timerUtils.now();
    const request = this.mapChatPayloadToRequest(payload, resolvedCorrId);
    const executionResponse = await this.stream(request, onChunk);
    return this.applyGroundingIfRequested(payload, executionResponse, startTime, resolvedCorrId);
  }

  public async getModels(correlationId?: string): Promise<readonly ModelDescriptor[]> {
    return this.upstreamAdapter.fetchModels(correlationId);
  }

  public async getAuthStatus(correlationId?: string): Promise<UpstreamAuthStatus> {
    return this.upstreamAdapter.fetchAuthStatus(correlationId);
  }

  public async getAuditLogs(correlationId?: string): Promise<readonly UpstreamAuditLog[]> {
    return this.upstreamAdapter.fetchAuditLogs(correlationId);
  }

  public getSessions(): readonly ModelSession[] {
    return this.sessionManager.listSessions();
  }

  public getSession(sessionId: string): ModelSession | undefined {
    return this.sessionManager.getSession(sessionId);
  }

  public getUpstreamAdapter(): UnifiedModelExecutionAdapter {
    return this.upstreamAdapter;
  }

  private initializeStrategies(): void {
    this.registerStrategy(
      new CliConnectorStrategy(
        undefined,
        undefined,
        this.cliCoordinator,
        this.credentialResolver,
        this.ollamaFallback,
      ),
    );
    this.registerStrategy(
      new ApiConnectorStrategy(
        undefined,
        undefined,
        this.credentialResolver,
        this.ollamaFallback,
      ),
    );
    this.registerStrategy(new CookieConnectorStrategy(this.sessionManager));
    this.registerStrategy(
      new OAuthConnectorStrategy(
        this.oauthRegistry,
        this.credentialResolver,
        this.ollamaFallback,
      ),
    );
  }

  private mapChatPayloadToRequest(
    payload: ModelChatPayload,
    correlationId: string,
  ): ExecutionRequest {
    return Object.freeze({
      prompt: payload.prompt,
      model: payload.modelId || this.defaultModel,
      strategy: payload.strategy || this.defaultStrategy,
      systemInstruction: payload.systemInstruction,
      sessionId: payload.sessionId,
      correlationId,
      requestId: payload.requestId,
      taskId: payload.taskId,
      userId: payload.userId,
      userEmail: payload.userEmail,
      accountId: payload.accountId,
      tenantId: payload.tenantId,
      apiKey: payload.apiKey,
      oauthToken: payload.oauthToken,
    });
  }

  private resolveExecutionRequest(request: ExecutionRequest): ExecutionRequest {
    const model = request.model || this.defaultModel || ModelCatalogDefaults.DEFAULT_MODEL;
    const correlationId = request.correlationId || randomUUID();
    const requestId = request.requestId || `req-${correlationId}`;
    const taskId = request.taskId || `task-${correlationId}`;
    const dbCred = this.credentialResolver.resolveUserCredential({
      modelId: model,
      userId: request.userId,
      userEmail: request.userEmail,
      accountId: request.accountId,
    });
    const userId = request.userId || request.userEmail || dbCred?.userEmail || "anonymous-user";
    return Object.freeze({
      ...request,
      model,
      correlationId,
      requestId,
      taskId,
      userId,
      userEmail: request.userEmail || dbCred?.userEmail || undefined,
      accountId: request.accountId || dbCred?.accountId || undefined,
      apiKey: request.apiKey || dbCred?.apiKey || dbCred?.oauthToken,
      oauthToken: request.oauthToken || dbCred?.oauthToken,
      cookieHeader: request.cookieHeader || dbCred?.cookieData,
    });
  }

  private ensureRequestCorrelationBound(
    response: ExecutionResponse,
    request: ExecutionRequest,
  ): ExecutionResponse {
    return Object.freeze({
      ...response,
      correlationId: request.correlationId || response.correlationId,
      requestId: request.requestId || response.requestId,
      taskId: request.taskId || response.taskId,
      userId: request.userId || response.userId,
      userEmail: request.userEmail || response.userEmail,
      accountId: request.accountId || response.accountId,
    });
  }

  private resolveStrategy(requested?: ExecutionStrategy): IConnectorStrategy {
    const key = requested || this.defaultStrategy;
    const strategy = this.strategies.get(key);
    if (!strategy) {
      throw new ModelConnectorException(
        `Execution strategy '${key}' is not registered. Available: ${Array.from(this.strategies.keys()).join(", ")}`,
      );
    }
    return strategy;
  }

  private async applyGroundingIfRequested(
    payload: ModelChatPayload,
    executionResponse: ExecutionResponse,
    startTime: number,
    correlationId: string,
  ): Promise<ModelChatResponse> {
    let finalContent = executionResponse.content;
    let citations = undefined;
    let searchQueriesUsed = undefined;

    if (payload.enableSearchGrounding) {
      const grounded = await this.groundingEngine.groundPrompt(payload.prompt, executionResponse.content);
      finalContent = grounded.content;
      citations = grounded.citations;
      searchQueriesUsed = grounded.searchQueriesUsed;
    }

    return Object.freeze({
      content: finalContent,
      modelId: executionResponse.model,
      strategyUsed: executionResponse.strategyUsed,
      tokenCount: executionResponse.tokenMetrics.totalTokens,
      latencyMs: Math.round(timerUtils.timeElapsedMs(startTime)),
      finishReason: "COMPLETE",
      citations,
      searchQueriesUsed,
      correlationId,
      requestId: executionResponse.requestId,
      taskId: executionResponse.taskId,
      userId: executionResponse.userId,
      userEmail: executionResponse.userEmail,
      accountId: executionResponse.accountId,
      fallbackOccurred: executionResponse.fallbackOccurred,
      fallbackProvider: executionResponse.fallbackProvider,
      timestamp: new Date().toISOString(),
    });
  }
}
