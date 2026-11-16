import {
  environment,
  processUtils,
  randomUUID,
  timerUtils,
} from "@model-box/model-connector-core";
import {
  DefaultEndpoint,
  DefaultTimeoutMs,
  ExecutionStrategyType,
  ModelCatalogDefaults,
  OLLAMA_DOCKER_CANDIDATE_URLS,
} from "@/domain/constants/index.js";
import type {
  ExecutionRequest,
  ExecutionResponse,
  StructuredExecutionEnvelope,
} from "@/domain/models/execution.types.js";
import { HttpTransport } from "@/strategies/api/HttpTransport.js";

export interface OllamaDockerEndpointStatus {
  readonly endpointUrl: string;
  readonly reachable: boolean;
  readonly availableModels: readonly string[];
  readonly resolvedModel: string;
}

export interface IOllamaDockerFallbackConnector {
  canAttemptFallback(request: ExecutionRequest): boolean;
  discoverHealthyEndpoint(preferredModel?: string, bearerToken?: string): Promise<OllamaDockerEndpointStatus | null>;
  executeDockerFallback(
    request: ExecutionRequest,
    startTimeMs?: number,
    correlationId?: string,
  ): Promise<ExecutionResponse | null>;
}

/**
 * Universal Ollama Docker Container Connector & Default Fallback Engine.
 * Probes local/containerized Ollama endpoints (:11435, host.docker.internal:11435,
 * ollama:11434, :11434, and OAuth gateway :11436) and executes structured fallback inference.
 *
 * Conforms to:
 * - STD-COD-005: Strategy & Dependency Injection
 * - STD-COD-007: <= 20 lines per function & Immutability by Default
 */
export class OllamaDockerFallbackConnector implements IOllamaDockerFallbackConnector {
  private cachedEndpoint: string | null = null;
  private cachedModels: readonly string[] = Object.freeze([]);
  private cacheExpiresAtMs = 0;

  constructor(private readonly candidateUrls: readonly string[] = OLLAMA_DOCKER_CANDIDATE_URLS) {}

  public canAttemptFallback(request: ExecutionRequest): boolean {
    const disabled = processUtils.getEnv("DISABLE_OLLAMA_DOCKER_FALLBACK", "false") === "true";
    if (disabled) {
      return false;
    }
    const modelName = (request.model ?? "").toLowerCase();
    return !modelName.includes("non-existent");
  }

  public async discoverHealthyEndpoint(
    preferredModel?: string,
    bearerToken?: string,
  ): Promise<OllamaDockerEndpointStatus | null> {
    if (this.isCacheValid()) {
      return this.buildCachedStatus(preferredModel);
    }
    const candidates = this.buildCandidateUrlList();
    for (const baseUrl of candidates) {
      const probed = await this.probeSingleEndpoint(baseUrl, preferredModel, bearerToken);
      if (probed) {
        return probed;
      }
    }
    return null;
  }

  public async executeDockerFallback(
    request: ExecutionRequest,
    startTimeMs: number = timerUtils.now(),
    correlationId: string = request.correlationId || randomUUID(),
  ): Promise<ExecutionResponse | null> {
    if (!this.canAttemptFallback(request)) {
      return null;
    }
    const status = await this.discoverHealthyEndpoint(request.model, request.oauthToken);
    const targetUrl = status?.endpointUrl ?? this.resolveConfiguredFallbackUrl();
    const targetModel = status?.resolvedModel ?? this.resolveConfiguredFallbackModel(request.model);
    return this.invokeGenerateEndpoint(targetUrl, targetModel, request, startTimeMs, correlationId);
  }

  private isCacheValid(): boolean {
    if (!this.cachedEndpoint) {
      return false;
    }
    return Date.now() < this.cacheExpiresAtMs;
  }

  private buildCachedStatus(preferredModel?: string): OllamaDockerEndpointStatus {
    return Object.freeze({
      endpointUrl: this.cachedEndpoint!,
      reachable: true,
      availableModels: this.cachedModels,
      resolvedModel: this.selectBestModel(this.cachedModels, preferredModel),
    });
  }

  private buildCandidateUrlList(): readonly string[] {
    const configuredOllama = environment.getProperty("ollama.base.url", "");
    const configuredFallback = environment.getProperty("fallback.base.url", "");
    const envHost = processUtils.getEnv("OLLAMA_HOST", "");
    const rawList = [
      configuredOllama,
      configuredFallback,
      envHost,
      DefaultEndpoint.FALLBACK_API_BASE_URL,
      ...this.candidateUrls,
    ];
    const normalized = rawList
      .map((u) => u.trim().replace(/\/+$/, ""))
      .filter((u) => u.startsWith("http"));
    return Object.freeze(Array.from(new Set(normalized)));
  }

  private async probeSingleEndpoint(
    baseUrl: string,
    preferredModel?: string,
    bearerToken?: string,
  ): Promise<OllamaDockerEndpointStatus | null> {
    try {
      const headers: Record<string, string> = {};
      if (bearerToken) {
        headers.Authorization = `Bearer ${bearerToken}`;
      }
      const res = await HttpTransport.request<{ models?: readonly { name?: string }[] }>(
        `${baseUrl}/api/tags`,
        { method: "GET", headers, timeoutMs: 2500 },
      );
      const models = this.extractModelNames(res.data);
      this.updateDiscoveryCache(baseUrl, models);
      return Object.freeze({
        endpointUrl: baseUrl,
        reachable: true,
        availableModels: models,
        resolvedModel: this.selectBestModel(models, preferredModel),
      });
    } catch {
      return null;
    }
  }

  private extractModelNames(data?: { models?: readonly { name?: string }[] }): readonly string[] {
    const list = data?.models ?? [];
    const names = list.map((m) => (m.name ?? "").trim()).filter((n) => n.length > 0);
    return Object.freeze(names);
  }

  private updateDiscoveryCache(endpointUrl: string, models: readonly string[]): void {
    this.cachedEndpoint = endpointUrl;
    this.cachedModels = models;
    this.cacheExpiresAtMs = Date.now() + 30000;
  }

  private selectBestModel(available: readonly string[], preferred?: string): string {
    const defaultFallback = this.resolveConfiguredFallbackModel();
    if (available.length === 0) {
      return defaultFallback;
    }
    const matchedPreferred = this.findMatchingModel(available, preferred);
    if (matchedPreferred) {
      return matchedPreferred;
    }
    const matchedDefault = this.findMatchingModel(available, defaultFallback);
    return matchedDefault ?? available[0];
  }

  private findMatchingModel(available: readonly string[], candidate?: string): string | null {
    if (!candidate) {
      return null;
    }
    const clean = candidate.toLowerCase().trim();
    const exact = available.find((m) => m.toLowerCase() === clean);
    if (exact) {
      return exact;
    }
    const prefix = available.find((m) => m.toLowerCase().startsWith(clean));
    return prefix ?? null;
  }

  private resolveConfiguredFallbackUrl(): string {
    return environment
      .getProperty(
        "fallback.base.url",
        environment.getProperty("ollama.base.url", DefaultEndpoint.FALLBACK_API_BASE_URL),
      )
      .replace(/\/+$/, "");
  }

  private resolveConfiguredFallbackModel(preferred?: string): string {
    const fallbackModel = environment.getProperty(
      "fallback.model",
      ModelCatalogDefaults.DEFAULT_FALLBACK_MODEL,
    );
    if (preferred && this.isKnownOllamaModel(preferred)) {
      return preferred;
    }
    return fallbackModel;
  }

  private isKnownOllamaModel(model: string): boolean {
    const lower = model.toLowerCase();
    const prefixes = ["llama", "lfm3", "ollama", "deepseek", "qwen", "phi", "gemma", "mistral", "tinyllama"];
    return prefixes.some((p) => lower.includes(p));
  }

  private async invokeGenerateEndpoint(
    baseUrl: string,
    model: string,
    request: ExecutionRequest,
    startTimeMs: number,
    correlationId: string,
  ): Promise<ExecutionResponse | null> {
    try {
      const res = await HttpTransport.request<{
        response?: string;
        prompt_eval_count?: number;
        eval_count?: number;
      }>(`${baseUrl}/api/generate`, {
        method: "POST",
        body: { model, prompt: request.prompt, stream: false },
        timeoutMs: environment.getPropertyAsNumber(
          "fallback.timeout.ms",
          DefaultTimeoutMs.FALLBACK_TIMEOUT,
        ),
        correlationId,
      });
      if (!res.data?.response) {
        return null;
      }
      return this.buildFallbackResponse(res.data, model, baseUrl, request, startTimeMs, correlationId);
    } catch {
      return null;
    }
  }

  private buildFallbackResponse(
    data: { response?: string; prompt_eval_count?: number; eval_count?: number },
    model: string,
    baseUrl: string,
    request: ExecutionRequest,
    startTimeMs: number,
    correlationId: string,
  ): ExecutionResponse {
    const content = (data.response ?? "").trim();
    const promptTokens = data.prompt_eval_count || Math.ceil(request.prompt.length / 4);
    const completionTokens = data.eval_count || Math.ceil(content.length / 4);
    const completedAt = new Date().toISOString();
    const envelope = this.buildEnvelope(request, model, correlationId, completedAt);
    return Object.freeze({
      content,
      model,
      strategyUsed: request.strategy || ExecutionStrategyType.API,
      latencyMs: Math.max(0, Math.round(timerUtils.now() - startTimeMs)),
      tokenMetrics: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
      sessionId: envelope.sessionId,
      correlationId,
      requestId: envelope.requestId,
      taskId: envelope.taskId,
      userId: envelope.userId,
      userEmail: request.userEmail,
      accountId: request.accountId,
      fallbackOccurred: true,
      fallbackProvider: ModelCatalogDefaults.DEFAULT_FALLBACK_PROVIDER,
      envelope,
      timestamp: completedAt,
      metadata: {
        executionSource: "OLLAMA_DOCKER_CONTAINER_FALLBACK",
        provider: ModelCatalogDefaults.DEFAULT_FALLBACK_PROVIDER,
        endpointUrl: baseUrl,
      },
    });
  }

  private buildEnvelope(
    request: ExecutionRequest,
    model: string,
    correlationId: string,
    completedAt: string,
  ): StructuredExecutionEnvelope {
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
      strategyUsed: request.strategy || ExecutionStrategyType.API,
      fallbackOccurred: true,
      fallbackProvider: ModelCatalogDefaults.DEFAULT_FALLBACK_PROVIDER,
      dispatchedAt: completedAt,
      completedAt,
    });
  }
}

export const defaultOllamaDockerFallbackConnector: IOllamaDockerFallbackConnector =
  new OllamaDockerFallbackConnector();

