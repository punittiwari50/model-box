import { HttpTransport } from "@/strategies/api/HttpTransport.js";
import { DefaultEndpoint, ModelCatalogDefaults } from "@/domain/constants/index.js";
import type { ModelDescriptor } from "@/domain/models/model.types.js";
import type { UpstreamAuthStatus, UpstreamAuditLog } from "@/domain/models/session.types.js";
import { environment, ModelCatalog, ModelFamily } from "@model-box/model-connector-core";
import { ModelConnectorException } from "@/domain/errors/domainExceptions.js";
import { SimulationPolicyFactory } from "@/domain/policies/SimulationPolicyFactory.js";
import {
  defaultOllamaDockerFallbackConnector,
  type IOllamaDockerFallbackConnector,
} from "@/adapters/OllamaDockerFallbackConnector.js";

import type { ModelChatPayload, ModelChatResponse } from "@/domain/models/grounding.types.js";

export interface ModelConnectorHealth {
  readonly status: string;
  readonly service: string;
  readonly cliStatus?: Readonly<Record<string, unknown>>;
  readonly apiStatus?: Readonly<Record<string, unknown>>;
  readonly uptimeSeconds?: number;
  readonly supportedFamilies?: readonly string[];
}

/**
 * Unified Model Execution Adapter.
 * Functionality-based adapter designed to interface with all 6 model families
 * (Gemini, Grok, Copilot, ChatGPT, Claude, Ollama) across local CLI and remote API endpoints.
 */
export class UnifiedModelExecutionAdapter {
  protected readonly baseUrl: string;
  protected readonly ollamaFallback: IOllamaDockerFallbackConnector;

  constructor(
    baseUrl?: string,
    ollamaFallback: IOllamaDockerFallbackConnector = defaultOllamaDockerFallbackConnector,
  ) {
    const resolvedUrl =
      baseUrl ||
      environment.getProperty(
        "upstream.connector.url",
        environment.getProperty("gemini.connector.url", DefaultEndpoint.UPSTREAM_CONNECTOR_URL),
      );
    this.baseUrl = resolvedUrl.replace(/\/+$/, "");
    this.ollamaFallback = ollamaFallback;
  }

  public async fetchHealth(correlationId?: string): Promise<ModelConnectorHealth> {
    try {
      const res = await HttpTransport.request<ModelConnectorHealth>(
        `${this.baseUrl}/api/v1/health`,
        { correlationId }
      );
      return {
        ...res.data,
        supportedFamilies: Object.values(ModelFamily),
      };
    } catch {
      return {
        status: "DEGRADED",
        service: "model-connector-platform",
        uptimeSeconds: 0,
        supportedFamilies: Object.values(ModelFamily),
      };
    }
  }

  public async fetchModels(correlationId?: string): Promise<readonly ModelDescriptor[]> {
    try {
      const res = await HttpTransport.request<any>(`${this.baseUrl}/api/v1/models`, {
        correlationId,
      });
      const rawList = Array.isArray(res.data) ? res.data : res.data?.models || [];
      return rawList.map((m: any) => ({
        id: m.id || m.name,
        name: m.name || m.id,
        family: m.family || ModelFamily.GEMINI,
        tier: m.tier || "freeware",
        supportedStrategies: m.supportedStrategies || ["api", "cli", "cookie"],
        status: m.status || "ACTIVE",
        description: m.description || "",
      }));
    } catch {
      return this.getAllSupportedModelCatalogs();
    }
  }

  public async executeChat(
    payload: ModelChatPayload,
    correlationId?: string
  ): Promise<ModelChatResponse> {
    const startTime = Date.now();
    try {
      const res = await HttpTransport.request<any>(`${this.baseUrl}/api/v1/chat`, {
        method: "POST",
        correlationId,
        body: payload,
      });
      return {
        content: res.data?.content || res.data?.text || "",
        modelId: payload.modelId,
        strategyUsed: (payload.strategy as any) || "api",
        tokenCount: res.data?.tokenCount || 0,
        latencyMs: Date.now() - startTime,
        finishReason: res.data?.finishReason || "COMPLETE",
        correlationId: correlationId || payload.correlationId || "corr-exec-default",
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      return this.executeFallbackChat(payload, startTime);
    }
  }

  private async executeFallbackChat(
    payload: ModelChatPayload,
    startTime: number,
  ): Promise<ModelChatResponse> {
    const dockerRes = await this.ollamaFallback.executeDockerFallback(
      {
        prompt: payload.prompt,
        model: payload.modelId,
        strategy: payload.strategy,
        correlationId: payload.correlationId,
        requestId: payload.requestId,
        taskId: payload.taskId,
        userId: payload.userId,
        userEmail: payload.userEmail,
        accountId: payload.accountId,
        tenantId: payload.tenantId,
      },
      startTime,
      payload.correlationId,
    );
    if (dockerRes) {
      return {
        content: dockerRes.content,
        modelId: dockerRes.model,
        strategyUsed: dockerRes.strategyUsed,
        tokenCount: dockerRes.tokenMetrics.totalTokens,
        latencyMs: dockerRes.latencyMs,
        finishReason: "FALLBACK_SUCCESS",
        correlationId: payload.correlationId || dockerRes.correlationId,
        requestId: payload.requestId || dockerRes.requestId,
        taskId: payload.taskId || dockerRes.taskId,
        userId: payload.userId || dockerRes.userId,
        userEmail: payload.userEmail || dockerRes.userEmail,
        accountId: payload.accountId || dockerRes.accountId,
        timestamp: dockerRes.timestamp,
        fallbackOccurred: true,
        fallbackProvider: dockerRes.fallbackProvider,
      };
    }

    const allowMock = SimulationPolicyFactory.createPolicy().isSimulationAllowed();
    if (!allowMock) {
      throw new ModelConnectorException(
        `Chat execution failed for model '${payload.modelId}' and fallback mock is disabled (builder: false).`,
        "UPSTREAM_EXECUTION_ERROR",
      );
    }

    return {
      content: `[Fallback Response from ${payload.modelId}]: Received prompt successfully.`,
      modelId: payload.modelId,
      strategyUsed: (payload.strategy as any) || "api",
      tokenCount: Math.ceil(payload.prompt.length / 4),
      latencyMs: Date.now() - startTime,
      finishReason: "FALLBACK_SUCCESS",
      correlationId: payload.correlationId || "corr-mock",
      requestId: payload.requestId,
      taskId: payload.taskId,
      userId: payload.userId,
      userEmail: payload.userEmail,
      accountId: payload.accountId,
      timestamp: new Date().toISOString(),
      fallbackOccurred: true,
    };
  }

  public async fetchAuthStatus(correlationId?: string): Promise<UpstreamAuthStatus> {
    try {
      const res = await HttpTransport.request<any>(`${this.baseUrl}/api/v1/auth/status`, {
        correlationId,
      });
      return {
        authenticated: Boolean(res.data?.authenticated),
        activeModel:
          res.data?.activeModel ||
          environment.getProperty("default.model", ModelCatalogDefaults.DEFAULT_MODEL),
        activeSessions: res.data?.activeSessions || [],
        email: res.data?.email || null,
        activeSession: Boolean(res.data?.activeSession),
        expiresAt: res.data?.expiresAt || null,
      };
    } catch {
      return {
        authenticated: false,
        activeModel: "none",
        activeSessions: [],
        email: null,
        activeSession: false,
        expiresAt: null,
      };
    }
  }

  public async fetchAuditLogs(
    correlationId?: string,
    limit: number = 50
  ): Promise<readonly UpstreamAuditLog[]> {
    try {
      const res = await HttpTransport.request<any>(
        `${this.baseUrl}/api/v1/audit/logs?limit=${encodeURIComponent(String(limit))}`,
        { correlationId }
      );
      const rawList = Array.isArray(res.data) ? res.data : res.data?.logs || [];
      return rawList.map((log: any) => ({
        id: log.id || log.audit_id || log.auditId || `audit-${Date.now()}`,
        action: log.action || log.operation || "INFERENCE_EXECUTION",
        modelUsed: log.model_used || log.modelUsed || log.model || log.modelId || "unknown",
        status: log.status || "SUCCESS",
        latencyMs: Math.round(Number(log.latency_ms ?? log.latencyMs ?? 0)),
        clientIp: log.client_ip || log.clientIp || "127.0.0.1",
        timestamp: log.timestamp || log.created_timestamp || new Date().toISOString(),
        message: log.details?.task || log.details?.message || log.message || log.error || "",
      }));
    } catch {
      return [];
    }
  }

  public getAllSupportedModelCatalogs(): readonly ModelDescriptor[] {
    return Object.freeze([
      // 1. Google Gemini (Verified Active Flagships)
      {
        id: ModelCatalog.GEMINI_3_8_FLASH,
        name: "Google Gemini 3.8 Flash",
        family: ModelFamily.GEMINI,
        tier: "freeware",
        supportedStrategies: ["api", "cli", "cookie"],
        status: "ACTIVE",
        description: "Flagship high-speed multimodal intelligence by Google DeepMind",
      },
      {
        id: "gemini-3.5-flash",
        name: "Google Gemini 3.5 Flash",
        family: ModelFamily.GEMINI,
        tier: "freeware",
        supportedStrategies: ["api", "cli", "cookie"],
        status: "ACTIVE",
        description: "Frontier multimodal reasoning intelligence by Google DeepMind",
      },
      {
        id: "gemini-3.5-flash-lite",
        name: "Google Gemini 3.5 Flash Lite",
        family: ModelFamily.GEMINI,
        tier: "freeware",
        supportedStrategies: ["api", "cli", "cookie"],
        status: "ACTIVE",
        description: "Ultra-low latency lightweight intelligence by Google",
      },
      // 2. xAI Grok
      {
        id: "grok-3",
        name: "xAI Grok-3",
        family: ModelFamily.GROK,
        tier: "paid",
        supportedStrategies: ["api", "cli", "cookie"],
        status: "ACTIVE",
        description: "Flagship reasoning and code generation intelligence by xAI",
      },
      {
        id: "grok-2",
        name: "xAI Grok-2",
        family: ModelFamily.GROK,
        tier: "paid",
        supportedStrategies: ["api", "cli", "cookie"],
        status: "ACTIVE",
        description: "Frontier multimodal reasoning intelligence by xAI",
      },
      // 3. Microsoft Copilot
      {
        id: "copilot-gpt-4o",
        name: "GitHub Copilot (GPT-4o)",
        family: ModelFamily.COPILOT,
        tier: "paid",
        supportedStrategies: ["api", "cli", "cookie"],
        status: "ACTIVE",
        description: "Developer pair programmer agent with GitHub integration",
      },
      {
        id: "copilot-claude-3.5-sonnet",
        name: "GitHub Copilot (Claude 3.5 Sonnet)",
        family: ModelFamily.COPILOT,
        tier: "paid",
        supportedStrategies: ["api", "cli", "cookie"],
        status: "ACTIVE",
        description: "Nuanced GitHub coding assistant powered by Anthropic",
      },
      // 4. OpenAI ChatGPT
      {
        id: "gpt-4o",
        name: "OpenAI ChatGPT-4o",
        family: ModelFamily.CHATGPT,
        tier: "paid",
        supportedStrategies: ["api", "cli", "cookie"],
        status: "ACTIVE",
        description: "Omni-channel reasoning flagship model by OpenAI",
      },
      {
        id: "gpt-4o-mini",
        name: "OpenAI GPT-4o Mini",
        family: ModelFamily.CHATGPT,
        tier: "freeware",
        supportedStrategies: ["api", "cli", "cookie"],
        status: "ACTIVE",
        description: "Fast, cost-effective reasoning intelligence by OpenAI",
      },
      {
        id: "o3-mini",
        name: "OpenAI o3-mini",
        family: ModelFamily.CHATGPT,
        tier: "paid",
        supportedStrategies: ["api", "cli", "cookie"],
        status: "ACTIVE",
        description: "High-reasoning STEM intelligence model by OpenAI",
      },
      // 5. Anthropic Claude
      {
        id: "claude-3-7-sonnet",
        name: "Anthropic Claude 3.7 Sonnet",
        family: ModelFamily.CLAUDE,
        tier: "paid",
        supportedStrategies: ["api", "cli", "cookie"],
        status: "ACTIVE",
        description: "Hybrid reasoning and coding flagship model by Anthropic",
      },
      {
        id: "claude-3-5-sonnet",
        name: "Anthropic Claude 3.5 Sonnet",
        family: ModelFamily.CLAUDE,
        tier: "paid",
        supportedStrategies: ["api", "cli", "cookie"],
        status: "ACTIVE",
        description: "Nuanced writing, reasoning, and visual comprehension by Anthropic",
      },
      {
        id: "claude-3-5-haiku",
        name: "Anthropic Claude 3.5 Haiku",
        family: ModelFamily.CLAUDE,
        tier: "freeware",
        supportedStrategies: ["api", "cli", "cookie"],
        status: "ACTIVE",
        description: "Near-instantaneous lightweight model by Anthropic",
      },
      // 6. Ollama Local
      {
        id: "lfm3-omni",
        name: "Liquid LFM3-Omni (Ollama Local Audio/Omni)",
        family: ModelFamily.OLLAMA,
        tier: "freeware",
        supportedStrategies: ["cli", "api"],
        status: "ACTIVE",
        description: "Local multimodal & speech omni model running on Ollama GPU container",
      },
      {
        id: "llama3.2",
        name: "Ollama LLaMA 3.2",
        family: ModelFamily.OLLAMA,
        tier: "freeware",
        supportedStrategies: ["cli", "api"],
        status: "ACTIVE",
        description: "Local private on-device open weights model by Meta/Ollama",
      },
      {
        id: "deepseek-r1",
        name: "Ollama DeepSeek-R1",
        family: ModelFamily.OLLAMA,
        tier: "freeware",
        supportedStrategies: ["cli", "api"],
        status: "ACTIVE",
        description: "Local reasoning intelligence model by DeepSeek/Ollama",
      },
      {
        id: "tinyllama",
        name: "TinyLlama 1.1B",
        family: ModelFamily.OLLAMA,
        tier: "freeware",
        supportedStrategies: ["cli", "api"],
        status: "ACTIVE",
        description: "Default fallback runner for low-resource environments",
      },
    ]);
  }
}
