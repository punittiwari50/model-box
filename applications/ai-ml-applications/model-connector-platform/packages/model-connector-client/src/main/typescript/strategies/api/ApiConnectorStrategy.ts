import { environment, timerUtils, randomUUID } from "@model-box/model-connector-core";
import type { IConnectorStrategy } from "@/strategies/IConnectorStrategy.js";
import {
  ExecutionStrategyType,
  ModelCatalogDefaults,
} from "@/domain/constants/index.js";
import type {
  ExecutionRequest,
  ExecutionResponse,
  StreamChunk,
  StructuredExecutionEnvelope,
} from "@/domain/models/execution.types.js";
import { HttpTransport } from "@/strategies/api/HttpTransport.js";
import { ApiTransportException } from "@/domain/errors/domainExceptions.js";
import type { ISimulationPolicy } from "@/domain/policies/ISimulationPolicy.js";
import { SimulationPolicyFactory } from "@/domain/policies/SimulationPolicyFactory.js";
import type { IModelPropertyResolverRegistry } from "@/domain/resolvers/ModelPropertyResolverRegistry.js";
import { ModelPropertyResolverRegistry } from "@/domain/resolvers/ModelPropertyResolverRegistry.js";
import {
  defaultUserModelCredentialResolver,
  type IUserModelCredentialResolver,
} from "@/security/UserModelCredentialResolver.js";
import {
  defaultOllamaDockerFallbackConnector,
  type IOllamaDockerFallbackConnector,
} from "@/adapters/OllamaDockerFallbackConnector.js";

export class ApiConnectorStrategy implements IConnectorStrategy {
  public readonly strategyType = ExecutionStrategyType.API;

  constructor(
    private readonly simulationPolicy: ISimulationPolicy = SimulationPolicyFactory.createPolicy(),
    private readonly resolverRegistry: IModelPropertyResolverRegistry = ModelPropertyResolverRegistry.getInstance(),
    private readonly credentialResolver: IUserModelCredentialResolver = defaultUserModelCredentialResolver,
    private readonly ollamaDockerFallback: IOllamaDockerFallbackConnector = defaultOllamaDockerFallbackConnector,
  ) {}

  public supports(_model: string): boolean {
    return true;
  }

  public async execute(request: ExecutionRequest): Promise<ExecutionResponse> {
    const startTime = timerUtils.now();
    const correlationId = request.correlationId || randomUUID();
    const defaultModel = environment.getProperty(
      "default.model",
      ModelCatalogDefaults.DEFAULT_MODEL,
    );
    const model = request.model || defaultModel;
    const effectiveRequest = this.enrichWithResolvedCredentials(request, model);
    const isOllama = this.isOllamaFamilyModel(model);

    if (effectiveRequest.apiKey || isOllama) {
      return this.executeWithLiveOrFallback(effectiveRequest, model, startTime, correlationId);
    }
    if (!this.isSimulationAllowed()) {
      this.throwMissingApiKey(model, correlationId);
    }
    return this.executeFallback(effectiveRequest, model, startTime, correlationId);
  }

  public async stream(
    request: ExecutionRequest,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<ExecutionResponse> {
    const fullResponse = await this.execute(request);
    const words = fullResponse.content.split(" ");
    let accumulated = "";
    for (let i = 0; i < words.length; i++) {
      const part = (i === 0 ? "" : " ") + words[i];
      accumulated += part;
      onChunk({
        delta: part,
        accumulatedText: accumulated,
        isComplete: i === words.length - 1,
        tokenMetrics: fullResponse.tokenMetrics,
        correlationId: fullResponse.correlationId,
        requestId: fullResponse.requestId,
        taskId: fullResponse.taskId,
        userId: fullResponse.userId,
      });
    }
    return fullResponse;
  }

  private enrichWithResolvedCredentials(
    request: ExecutionRequest,
    model: string,
  ): ExecutionRequest {
    const resolver = this.resolverRegistry.resolve(model);
    const dbCred = this.credentialResolver.resolveUserCredential({
      modelId: model,
      userId: request.userId,
      userEmail: request.userEmail,
      accountId: request.accountId,
    });
    const apiKey = request.apiKey || request.oauthToken || dbCred?.apiKey || dbCred?.oauthToken || resolver.resolveApiKey(model);
    if (!apiKey) {
      return request;
    }
    return Object.freeze({
      ...request,
      apiKey,
      userEmail: request.userEmail || dbCred?.userEmail || undefined,
      accountId: request.accountId || dbCred?.accountId || undefined,
    });
  }

  private isOllamaFamilyModel(model: string): boolean {
    const resolver = this.resolverRegistry.resolve(model);
    if (resolver.family === "ollama") {
      return true;
    }
    const lower = model.toLowerCase();
    const tags = ["llama", "lfm3", "ollama", "deepseek", "phi", "qwen", "gemma", "tinyllama"];
    return tags.some((t) => lower.includes(t));
  }

  private async executeWithLiveApiOrOllama(
    request: ExecutionRequest,
    model: string,
    startTime: number,
    correlationId: string,
  ): Promise<ExecutionResponse> {
    if (this.isOllamaFamilyModel(model)) {
      const dockerRes = await this.ollamaDockerFallback.executeDockerFallback(
        { ...request, model, strategy: ExecutionStrategyType.API },
        startTime,
        correlationId,
      );
      if (dockerRes) {
        return { ...dockerRes, fallbackOccurred: false };
      }
    }
    return this.executeLiveApi(request, model, startTime, correlationId);
  }

  private async executeWithLiveOrFallback(
    request: ExecutionRequest,
    model: string,
    startTime: number,
    correlationId: string,
  ): Promise<ExecutionResponse> {
    try {
      return await this.executeWithLiveApiOrOllama(request, model, startTime, correlationId);
    } catch (err: unknown) {
      return this.executeFallback(request, model, startTime, correlationId, err);
    }
  }

  private isSimulationAllowed(): boolean {
    return this.simulationPolicy.isSimulationAllowed();
  }

  private async executeLiveApi(
    request: ExecutionRequest,
    model: string,
    startTime: number,
    correlationId: string,
  ): Promise<ExecutionResponse> {
    const resolver = this.resolverRegistry.resolve(model);
    const apiSpec = resolver.buildApiRequest(model, request.apiKey || "", request.prompt);
    const res = await HttpTransport.request<Record<string, unknown>>(apiSpec.endpoint, {
      method: "POST",
      headers: apiSpec.headers as Record<string, string>,
      body: apiSpec.body,
      correlationId,
    });
    return this.extractApiResponse(res.data, request, model, startTime, correlationId);
  }

  private extractApiResponse(
    data: Record<string, unknown>,
    request: ExecutionRequest,
    model: string,
    startTime: number,
    correlationId: string,
  ): ExecutionResponse {
    const latencyMs = Math.max(0, Math.round(timerUtils.now() - startTime));
    const content = this.parseResponseText(data);
    const usage = data.usageMetadata as {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    } | undefined;
    const envelope = this.buildEnvelope(request, model, correlationId, false);
    return Object.freeze({
      content: content.trim(),
      model,
      strategyUsed: ExecutionStrategyType.API,
      latencyMs,
      tokenMetrics: {
        promptTokens: usage?.promptTokenCount || 20,
        completionTokens: usage?.candidatesTokenCount || 40,
        totalTokens: usage?.totalTokenCount || 60,
      },
      sessionId: envelope.sessionId,
      correlationId,
      requestId: envelope.requestId,
      taskId: envelope.taskId,
      userId: envelope.userId,
      userEmail: request.userEmail,
      accountId: request.accountId,
      envelope,
      timestamp: envelope.completedAt,
      metadata: { executionSource: "REMOTE_REST_API" },
    });
  }

  private parseResponseText(data: Record<string, unknown>): string {
    const candidates = data.candidates as { content?: { parts?: { text?: string }[] } }[] | undefined;
    const choices = data.choices as { message?: { content?: string } }[] | undefined;
    return (
      candidates?.[0]?.content?.parts?.[0]?.text ||
      choices?.[0]?.message?.content ||
      (typeof data.response === "string" ? data.response : "") ||
      JSON.stringify(data)
    );
  }

  private async executeFallback(
    request: ExecutionRequest,
    model: string,
    startTime: number,
    correlationId: string,
    originalError?: unknown,
  ): Promise<ExecutionResponse> {
    const dockerFallback = await this.ollamaDockerFallback.executeDockerFallback(
      { ...request, strategy: ExecutionStrategyType.API },
      startTime,
      correlationId,
    );
    if (dockerFallback) {
      const errMsg = originalError instanceof Error ? originalError.message : String(originalError || "Authentication error or missing API key");
      return Object.freeze({
        ...dockerFallback,
        fallbackOccurred: true,
        metadata: {
          ...dockerFallback.metadata,
          requestedModel: model,
          originalError: errMsg,
          fallbackReason: `Authentication or connection failure for '${model}' (${errMsg.slice(0, 100)}). Automatically routed to local ${dockerFallback.model} (Ollama Docker).`,
        },
      });
    }
    if (!this.isSimulationAllowed()) {
      this.throwStrictApiFailure(model, correlationId, originalError);
    }
    return this.executeSimulationFallback(request, model, startTime, correlationId);
  }

  private throwMissingApiKey(model: string, correlationId: string): never {
    throw new ApiTransportException(
      `API key is not configured for model '${model}'. Please configure an API key in the Model Configuration menu (or set GEMINI_API_KEY).`,
      401,
      undefined,
      correlationId,
    );
  }

  private throwStrictApiFailure(
    model: string,
    correlationId: string,
    originalError?: unknown,
  ): never {
    const msg =
      originalError instanceof Error
        ? originalError.message
        : `API key is not configured for model '${model}'. Please configure an API key in the Model Configuration menu.`;
    const status = originalError ? 502 : 401;
    throw new ApiTransportException(
      `Live API and fallback API calls failed, and mock simulation is disabled (builder: false). ${msg}`,
      status,
      undefined,
      correlationId,
    );
  }

  private executeSimulationFallback(
    request: ExecutionRequest,
    model: string,
    startTime: number,
    correlationId: string,
  ): ExecutionResponse {
    const latencyMs = Math.max(0, Math.round(timerUtils.now() - startTime));
    const content = this.formatSimulationContent(request.prompt, model);
    const envelope = this.buildEnvelope(request, model, correlationId, true);
    return Object.freeze({
      content,
      model,
      strategyUsed: ExecutionStrategyType.API,
      latencyMs,
      tokenMetrics: {
        promptTokens: Math.ceil(request.prompt.length / 4),
        completionTokens: Math.ceil(content.length / 4),
        totalTokens: Math.ceil((request.prompt.length + content.length) / 4),
      },
      sessionId: envelope.sessionId,
      correlationId,
      requestId: envelope.requestId,
      taskId: envelope.taskId,
      userId: envelope.userId,
      userEmail: request.userEmail,
      accountId: request.accountId,
      fallbackOccurred: true,
      envelope,
      timestamp: envelope.completedAt,
      metadata: { executionSource: "API_SIMULATION_FALLBACK" },
    });
  }

  private formatSimulationContent(prompt: string, model: string): string {
    const isDateTimePrompt = /date|time|clock|now/i.test(prompt);
    if (isDateTimePrompt) {
      const now = new Date();
      return `Current Date and Time Information:\n- UTC Time: ${now.toUTCString()}\n- ISO 8601: ${now.toISOString()}\n- Local Time: ${now.toLocaleString()}\n- Unix Timestamp: ${now.getTime()} ms\n- Model: ${model}\n- Protocol: REST API Connection\n- Status: Online & Synchronized`;
    }
    const snippet = `${prompt.slice(0, 80)}${prompt.length > 80 ? "..." : ""}`;
    return `[REST API Engine - ${model}] Response generated for: "${snippet}" using optimized REST API streaming connector.`;
  }

  private buildEnvelope(
    request: ExecutionRequest,
    model: string,
    correlationId: string,
    fallbackOccurred: boolean,
  ): StructuredExecutionEnvelope {
    const completedAt = new Date().toISOString();
    return Object.freeze({
      requestId: request.requestId || correlationId,
      taskId: request.taskId || `task-${correlationId}`,
      userId: request.userId || request.userEmail || "anonymous-user",
      userEmail: request.userEmail,
      accountId: request.accountId,
      tenantId: request.tenantId,
      sessionId: request.sessionId || randomUUID(),
      correlationId,
      model,
      strategyUsed: ExecutionStrategyType.API,
      fallbackOccurred,
      dispatchedAt: completedAt,
      completedAt,
    });
  }
}
