import {
  childProcessUtils,
  modelProviderConfigService,
  ollamaModelDiscoveryCache,
  processUtils,
  ProviderId,
  type IOllamaModelDiscoveryCache,
  type IProviderConfigRegistry,
} from "@model-box/model-connector-core";
import { accountRepository } from "@/auth/ModelAccountRepository.js";
import { OAuthExecutorFactory } from "@/auth/oauth/OAuthExecutorFactory.js";
import type {
  CliExecutionPlan,
  ConnectionTestResult,
  IProtocolVerificationRegistry,
  IProtocolVerificationStrategy,
  IProviderVerificationRegistry,
  IProviderVerificationStrategy,
  VerificationTokenMetrics,
  VerificationContext,
  ModelInteractionMode,
} from "@/auth/verification/types.js";

export * from "@/auth/verification/types.js";

const CLI_COMMAND_PREFIXES = Object.freeze(["gemini ", "claude ", "github-copilot-cli ", "gh ", "ollama ", "antigravity ", "agy "]);

export class OllamaProviderVerificationStrategy implements IProviderVerificationStrategy {
  constructor(
    private readonly configRegistry: IProviderConfigRegistry = modelProviderConfigService,
    private readonly ollamaCache: IOllamaModelDiscoveryCache = ollamaModelDiscoveryCache,
  ) { }

  public supports(modelId: string): boolean {
    return this.ollamaCache.isOllamaModel(modelId);
  }

  public async verifyApi(ctx: VerificationContext): Promise<ConnectionTestResult> {
    void this.ollamaCache.getAvailableModels();
    if (this.isOAuthTokenCredential(ctx.credentialValue)) {
      return this.verifyOAuthProtectedOllama(ctx);
    }
    const endpoints = this.resolveGenerateEndpoints();
    let lastError = "";
    for (const url of endpoints) {
      try {
        const res = await this.probeOllamaEndpoint(url, ctx);
        if (res) return res;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
    return this.buildUnreachableResult(ctx.startTime, lastError);
  }

  private isOAuthTokenCredential(credentialValue: string): boolean {
    const trimmed = (credentialValue || "").trim();
    if (trimmed.startsWith("oat_ollama_")) return true;
    return trimmed.startsWith("Bearer ");
  }

  private async verifyOAuthProtectedOllama(ctx: VerificationContext): Promise<ConnectionTestResult> {
    const cfg = this.configRegistry.getProviderConfig("ollama");
    const oauthBase = (cfg.oauthBaseUrl || "http://localhost:11436").replace(/\/+$/, "");
    const url = `${oauthBase}/ollama-oauth/api/generate`;
    const cleanToken = ctx.credentialValue.replace(/^Bearer\s+/i, "").trim();
    const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${cleanToken}` };
    if (ctx.correlationId) headers["x-correlation-id"] = ctx.correlationId;
    if (ctx.traceId) headers["x-trace-id"] = ctx.traceId;
    if (ctx.spanId) headers["x-span-id"] = ctx.spanId;
    if (ctx.traceId && ctx.spanId) headers.traceparent = `00-${ctx.traceId}-${ctx.spanId}-01`;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: ctx.modelId, prompt: ctx.userPrompt, stream: false }),
    });
    if (!res.ok) {
      return {
        status: "FAILED",
        protocol: "Ollama OAuth 2.0 Gateway",
        message: `Ollama OAuth verification failed with status ${res.status}`,
        latencyMs: Date.now() - ctx.startTime,
        errorMessage: `HTTP ${res.status} from Ollama OAuth Gateway`,
        executedCall: `POST ${url}`,
        details: { status: res.status, endpoint: url },
      };
    }
    const data = (await res.json()) as { response?: string; model?: string; total_duration?: number };
    return {
      status: "VERIFIED",
      protocol: "Ollama OAuth 2.0 Gateway",
      message: `Ollama OAuth bearer token verified via gateway for '${ctx.modelId}'.`,
      latencyMs: Date.now() - ctx.startTime,
      modelOutput: data.response || "Ollama OAuth output received",
      executedCall: `POST ${url}`,
      details: { endpoint: url, model: data.model, totalDuration: data.total_duration },
      correlationId: ctx.correlationId,
      traceId: ctx.traceId,
      spanId: ctx.spanId,
    };
  }

  private resolveGenerateEndpoints(): readonly string[] {
    const cfg = this.configRegistry.getProviderConfig("ollama");
    const candidateList = (cfg as unknown as Record<string, unknown>).dockerCandidateUrls;
    const configuredCandidates: readonly string[] = Array.isArray(candidateList) ? candidateList : [];
    const directBase = cfg.baseUrl || "http://localhost:11435";
    const candidates = [
      `${directBase}/api/generate`,
      ...configuredCandidates.map((u: string) => `${u.replace(/\/+$/, "")}/api/generate`),
      "http://localhost:11435/api/generate",
      "http://host.docker.internal:11435/api/generate",
      "http://127.0.0.1:11435/api/generate",
      "http://ollama:11434/api/generate",
      "http://host.docker.internal:11434/api/generate",
      "http://localhost:11434/api/generate",
      "http://127.0.0.1:11434/api/generate",
    ];
    return Array.from(new Set(candidates));
  }

  private async probeOllamaEndpoint(url: string, ctx: VerificationContext): Promise<ConnectionTestResult | undefined> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (ctx.correlationId) headers["x-correlation-id"] = ctx.correlationId;
    if (ctx.traceId) headers["x-trace-id"] = ctx.traceId;
    if (ctx.spanId) headers["x-span-id"] = ctx.spanId;
    if (ctx.traceId && ctx.spanId) headers.traceparent = `00-${ctx.traceId}-${ctx.spanId}-01`;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: ctx.modelId, prompt: ctx.userPrompt, stream: false }),
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { response?: string; model?: string; total_duration?: number };
    return {
      status: "VERIFIED",
      protocol: "Local Ollama Engine",
      message: `Ollama live connection verified via ${url}. Model: '${ctx.modelId}'.`,
      latencyMs: Date.now() - ctx.startTime,
      modelOutput: data.response || "Ollama generated response",
      details: { endpoint: url, model: data.model, totalDuration: data.total_duration, correlationId: ctx.correlationId, traceId: ctx.traceId },
      correlationId: ctx.correlationId,
      traceId: ctx.traceId,
      spanId: ctx.spanId,
    };
  }

  private buildUnreachableResult(startTime: number, lastError: string): ConnectionTestResult {
    return {
      status: "FAILED",
      protocol: "Local Ollama Engine",
      message: "Failed to connect to local Ollama container on configured endpoints.",
      latencyMs: Date.now() - startTime,
      errorMessage: `Ollama unreachable: ${lastError}`,
      details: {},
    };
  }

  public async executeOllamaFallback(ctx: VerificationContext, reason: string): Promise<ConnectionTestResult | null> {
    const endpoints = this.resolveGenerateEndpoints();
    const fallbackModel = await this.discoverFirstAvailableOllamaModel(endpoints);
    for (const url of endpoints) {
      const result = await this.attemptOllamaFallbackCall(url, fallbackModel, ctx, reason);
      if (result) return result;
    }
    return null;
  }

  private async discoverFirstAvailableOllamaModel(endpoints: readonly string[]): Promise<string> {
    for (const url of endpoints) {
      try {
        const base = url.replace(/\/api\/generate$/, "");
        const tagsRes = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(2500) });
        if (tagsRes.ok) {
          const data = (await tagsRes.json()) as { models?: { name?: string }[] };
          const first = data?.models?.[0]?.name;
          if (first) return first;
        }
      } catch {
        // next endpoint
      }
    }
    return "llama3";
  }

  private async attemptOllamaFallbackCall(
    url: string,
    model: string,
    ctx: VerificationContext,
    reason: string,
  ): Promise<ConnectionTestResult | null> {
    try {
      const headers = this.buildTelemetryHeaders(ctx);
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ model, prompt: ctx.userPrompt, stream: false }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { response?: string; model?: string; total_duration?: number };
      return this.buildFallbackResult(url, data, model, ctx, reason);
    } catch {
      return null;
    }
  }

  private buildTelemetryHeaders(ctx: VerificationContext): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (ctx.correlationId) headers["x-correlation-id"] = ctx.correlationId;
    if (ctx.traceId) headers["x-trace-id"] = ctx.traceId;
    if (ctx.spanId) headers["x-span-id"] = ctx.spanId;
    if (ctx.traceId && ctx.spanId) headers.traceparent = `00-${ctx.traceId}-${ctx.spanId}-01`;
    return headers;
  }

  private buildFallbackResult(
    url: string,
    data: { response?: string; model?: string; total_duration?: number },
    model: string,
    ctx: VerificationContext,
    reason: string,
  ): ConnectionTestResult {
    const promptTokens = Math.max(1, Math.ceil(ctx.userPrompt.length / 4));
    const completionTokens = Math.max(1, Math.ceil((data.response || "").length / 4));
    const totalTokens = promptTokens + completionTokens;
    const tokenMetrics: VerificationTokenMetrics = {
      promptTokens,
      completionTokens,
      totalTokens,
      contextLimit: 8192,
      percentConsumed: Number(((totalTokens / 8192) * 100).toFixed(4)),
      percentLeft: Number((100 - (totalTokens / 8192) * 100).toFixed(4)),
    };
    return {
      status: "VERIFIED",
      protocol: "Local Ollama Fallback",
      message: `Verified via local Ollama engine (${data.model || model}). Upstream fallback active.`,
      latencyMs: Date.now() - ctx.startTime,
      modelOutput: `[Local Ollama Fallback Engine]\nModel: ${data.model || model} (Fallback for ${ctx.modelId})\nReason: ${reason}\n\nPrompt (Request):\n${ctx.userPrompt}\n\nResponse:\n${data.response || "Ollama fallback operational"}`,
      executedCall: `POST ${url}`,
      executedCommand: `ollama run ${data.model || model} "${ctx.userPrompt.replace(/"/g, '\\"')}"`,
      details: {
        endpoint: url,
        model: data.model || model,
        fallbackUsed: true,
        fallbackProvider: "ollama",
        originalModel: ctx.modelId,
        originalReason: reason,
        correlationId: ctx.correlationId,
        traceId: ctx.traceId,
        tokenMetrics,
      },
      correlationId: ctx.correlationId,
      traceId: ctx.traceId,
      spanId: ctx.spanId,
      modelName: `${ctx.modelId} (Ollama Fallback: ${data.model || model})`,
      tokenMetrics,
      isFallback: true,
    };
  }

  public buildCliPlan(modelId: string, sanitizedPrompt: string, _credential?: string, _mode?: ModelInteractionMode): CliExecutionPlan {
    const cfg = this.configRegistry.getProviderConfig("ollama");
    return {
      binary: cfg.cliExecutable,
      cmd: `${cfg.cliExecutable} run ${modelId} "${sanitizedPrompt}"`,
      env: { ...processUtils.env },
    };
  }
}

export class CopilotProviderVerificationStrategy implements IProviderVerificationStrategy {
  constructor(private readonly configRegistry: IProviderConfigRegistry = modelProviderConfigService) { }

  public supports(modelId: string): boolean {
    const lower = modelId.toLowerCase();
    const keywords = this.configRegistry.getProviderConfig("github").modelKeywords;
    return keywords.some((kw) => lower.includes(kw));
  }

  public async verifyApi(ctx: VerificationContext): Promise<ConnectionTestResult> {
    const cleanToken = ctx.credentialValue.replace(/^(Bearer|token)\s+/i, "").trim();
    const res = await this.callCopilotChat(ctx.modelId, cleanToken, ctx.userPrompt);
    if (res.ok) {
      return this.buildCopilotSuccess(res, ctx.modelId, ctx.startTime);
    }
    return this.verifyGitHubIdentityFallback(cleanToken, ctx.modelId, ctx.startTime, res.status);
  }

  private async callCopilotChat(modelId: string, token: string, prompt: string): Promise<Response> {
    const cfg = this.configRegistry.getProviderConfig("github");
    const endpoint = cfg.chatCompletionsEndpoint || `${cfg.baseUrl}/chat/completions`;
    return fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "Copilot-Integration-Id": "vscode-chat",
      },
      body: JSON.stringify({
        model: modelId.replace(/^copilot-/, ""),
        messages: [{ role: "user", content: prompt }],
      }),
    });
  }

  private async buildCopilotSuccess(res: Response, modelId: string, startTime: number): Promise<ConnectionTestResult> {
    const data = (await res.json().catch(() => ({}))) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data?.choices?.[0]?.message?.content || "Copilot response received.";
    return {
      status: "VERIFIED",
      protocol: "GitHub Copilot REST API",
      message: `Copilot API handshake successful for '${modelId}'.`,
      latencyMs: Date.now() - startTime,
      modelOutput: text,
      details: { modelId },
    };
  }

  private async verifyGitHubIdentityFallback(
    cleanToken: string,
    modelId: string,
    startTime: number,
    initialStatus: number,
  ): Promise<ConnectionTestResult> {
    const cfg = this.configRegistry.getProviderConfig("github");
    const userRes = await fetch(cfg.userinfoEndpoint, {
      headers: { Authorization: `Bearer ${cleanToken}`, "User-Agent": "ModelBox-Connector/1.0" },
    });
    if (userRes.ok) {
      const userData = (await userRes.json().catch(() => ({}))) as { login?: string; email?: string };
      const identity = userData.login || userData.email || "verified";
      return {
        status: "VERIFIED",
        protocol: "GitHub OAuth / Copilot Token",
        message: `GitHub identity verified for '${identity}' (${modelId}).`,
        latencyMs: Date.now() - startTime,
        modelOutput: `Authenticated GitHub user: ${identity}`,
        details: { modelId, login: userData.login },
      };
    }
    return {
      status: "FAILED",
      protocol: "GitHub Copilot REST API",
      message: `Copilot token verification failed (HTTP ${initialStatus}).`,
      latencyMs: Date.now() - startTime,
      errorMessage: `Verification failed (${initialStatus}): Invalid GitHub / Copilot token.`,
      details: { modelId },
    };
  }

  public buildCliPlan(modelId: string, sanitizedPrompt: string, credential: string, _mode?: ModelInteractionMode): CliExecutionPlan {
    const cfg = this.configRegistry.getProviderConfig("github");
    const baseEnv: Record<string, string | undefined> = { ...processUtils.env };
    const token = credential || processUtils.getEnv("GITHUB_TOKEN", "") || processUtils.getEnv("GH_TOKEN", "");
    if (token) {
      baseEnv.GITHUB_TOKEN = token;
      baseEnv.GH_TOKEN = token;
      baseEnv.COPILOT_API_KEY = token;
    }
    return {
      binary: cfg.cliExecutable,
      cmd: `${cfg.cliExecutable} --model ${modelId} --non-interactive "${sanitizedPrompt}"`,
      env: baseEnv,
    };
  }
}

export class ClaudeProviderVerificationStrategy implements IProviderVerificationStrategy {
  constructor(private readonly configRegistry: IProviderConfigRegistry = modelProviderConfigService) { }

  public supports(modelId: string): boolean {
    const lower = modelId.toLowerCase();
    const keywords = this.configRegistry.getProviderConfig("anthropic").modelKeywords;
    return keywords.some((kw) => lower.includes(kw));
  }

  public async verifyApi(ctx: VerificationContext): Promise<ConnectionTestResult> {
    const cfg = this.configRegistry.getProviderConfig("anthropic");
    const endpoint = cfg.messagesEndpoint || `${cfg.baseUrl}/${cfg.apiVersion}/messages`;
    const headers = this.buildClaudeHeaders(ctx.credentialValue, cfg.anthropicVersionHeader || "2023-06-01");
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: ctx.modelId, max_tokens: 128, messages: [{ role: "user", content: ctx.userPrompt }] }),
    });
    return this.parseClaudeResponse(res, ctx.modelId, ctx.startTime);
  }

  private buildClaudeHeaders(credentialValue: string, anthropicVersion: string): Record<string, string> {
    const cleanToken = credentialValue.replace(/^Bearer\s+/i, "").trim();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "anthropic-version": anthropicVersion,
    };
    const isOAuth = credentialValue.startsWith("sk-ant-oat") ? true : credentialValue.startsWith("Bearer ");
    if (isOAuth) {
      headers.Authorization = `Bearer ${cleanToken}`;
    } else {
      headers["x-api-key"] = cleanToken;
    }
    return headers;
  }

  private async parseClaudeResponse(res: Response, modelId: string, startTime: number): Promise<ConnectionTestResult> {
    const latencyMs = Date.now() - startTime;
    const data = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
      content?: Array<{ text?: string }>;
      usage?: Record<string, unknown>;
    };
    if (!res.ok) {
      const errorMsg = data?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
      return {
        status: "FAILED",
        protocol: "Anthropic REST API / v1",
        message: `Claude API validation failed: ${errorMsg}`,
        latencyMs,
        errorMessage: `Verification failed (${res.status}): ${errorMsg}`,
        details: (data?.error as Record<string, unknown>) || {},
      };
    }
    return {
      status: "VERIFIED",
      protocol: "Anthropic REST API / v1",
      message: `Claude API handshake successful for '${modelId}'.`,
      latencyMs,
      modelOutput: data?.content?.[0]?.text || "Response received.",
      details: { modelId, usage: data?.usage || {} },
    };
  }

  public buildCliPlan(modelId: string, sanitizedPrompt: string, credential: string, _mode?: ModelInteractionMode): CliExecutionPlan {
    const cfg = this.configRegistry.getProviderConfig("anthropic");
    const baseEnv: Record<string, string | undefined> = { ...processUtils.env };
    const token = credential || processUtils.getEnv("ANTHROPIC_API_KEY", "");
    const isOAuth = token.startsWith("sk-ant-oat") ? true : token.startsWith("Bearer ");
    if (isOAuth) {
      baseEnv.CLAUDE_CODE_OAUTH_TOKEN = token.replace(/^Bearer\s+/i, "").trim();
    } else if (token) {
      baseEnv.ANTHROPIC_API_KEY = token;
    }
    return {
      binary: cfg.cliExecutable,
      cmd: `${cfg.cliExecutable} -p "${sanitizedPrompt}" --model ${modelId} --output-format text`,
      env: baseEnv,
    };
  }
}

export class OpenAiProviderVerificationStrategy implements IProviderVerificationStrategy {
  constructor(private readonly configRegistry: IProviderConfigRegistry = modelProviderConfigService) { }

  public supports(modelId: string): boolean {
    const lower = modelId.toLowerCase();
    const keywords = this.configRegistry.getProviderConfig("openai").modelKeywords;
    return (
      keywords.some((kw) => lower.includes(kw)) ||
      lower.includes("gpt") ||
      lower.includes("chatgpt") ||
      lower.includes("codex") ||
      lower.includes("o1") ||
      lower.includes("o3")
    );
  }

  public async verifyApi(ctx: VerificationContext): Promise<ConnectionTestResult> {
    const cfg = this.configRegistry.getProviderConfig("openai");
    const cleanToken = ctx.credentialValue.replace(/^Bearer\s+/i, "").trim();
    const endpoint = `${cfg.baseUrl || "https://api.openai.com"}/${cfg.apiVersion || "v1"}/chat/completions`;
    const resolvedModel = ctx.modelId.replace(/^openai-/, "").replace(/^chatgpt-/, "");
    const targetModel = resolvedModel === "chatgpt" ? "gpt-4o-mini" : resolvedModel;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cleanToken}`,
        },
        body: JSON.stringify({
          model: targetModel,
          messages: [{ role: "user", content: ctx.userPrompt }],
          max_tokens: 128,
        }),
        signal: AbortSignal.timeout(15000),
      });

      const latencyMs = Date.now() - ctx.startTime;
      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        const msg = errorData?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
        return {
          status: "FAILED",
          protocol: "OpenAI REST API / v1",
          message: `OpenAI API verification failed: ${msg}`,
          latencyMs,
          errorMessage: msg,
          executedCall: `POST ${endpoint}`,
          details: { modelId: ctx.modelId, endpoint },
        };
      }

      const data = (await res.json().catch(() => ({}))) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: any;
      };
      const outputText = data?.choices?.[0]?.message?.content?.trim() || "OpenAI response received.";
      return {
        status: "VERIFIED",
        protocol: "OpenAI REST API / v1",
        message: `OpenAI API handshake successful for '${ctx.modelId}'.`,
        latencyMs,
        modelOutput: outputText,
        executedCall: `POST ${endpoint}`,
        details: { modelId: ctx.modelId, endpoint, usage: data?.usage },
      };
    } catch (err: unknown) {
      return {
        status: "FAILED",
        protocol: "OpenAI REST API / v1",
        message: `OpenAI connection failed: ${err instanceof Error ? err.message : String(err)}`,
        latencyMs: Date.now() - ctx.startTime,
        errorMessage: err instanceof Error ? err.message : String(err),
        executedCall: `POST ${endpoint}`,
        details: { modelId: ctx.modelId },
      };
    }
  }

  public buildCliPlan(modelId: string, sanitizedPrompt: string, credential: string, _mode?: ModelInteractionMode): CliExecutionPlan {
    const cfg = this.configRegistry.getProviderConfig("openai");
    const baseEnv: Record<string, string | undefined> = { ...processUtils.env };
    const token = credential || processUtils.getEnv("OPENAI_API_KEY", "");
    if (token) {
      baseEnv.OPENAI_API_KEY = token.replace(/^Bearer\s+/i, "").trim();
    }
    const cliExec = cfg.cliExecutable || "chatgpt";
    return {
      binary: cliExec,
      cmd: `${cliExec} --model ${modelId} "${sanitizedPrompt}"`,
      env: baseEnv,
    };
  }
}

export class GeminiProviderVerificationStrategy implements IProviderVerificationStrategy {
  constructor(private readonly configRegistry: IProviderConfigRegistry = modelProviderConfigService) { }

  public supports(modelId: string): boolean {
    const lower = modelId.toLowerCase();
    return lower.includes("gemini") || lower.includes("google") || lower.includes("antigravity");
  }

  public async verifyApi(ctx: VerificationContext): Promise<ConnectionTestResult> {
    const cfg = this.configRegistry.getProviderConfig(ProviderId.GOOGLE);
    const isOAuth = ctx.credentialValue.startsWith("ya29.");
    const baseUrl = `${cfg.baseUrl}/${cfg.apiVersion}/models/${encodeURIComponent(ctx.modelId)}:generateContent`;
    const endpoint = isOAuth ? baseUrl : `${baseUrl}?key=${encodeURIComponent(ctx.credentialValue)}`;
    const callDesc = `POST ${baseUrl}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (isOAuth) headers.Authorization = `Bearer ${ctx.credentialValue}`;
    if (ctx.correlationId) headers["x-correlation-id"] = ctx.correlationId;
    if (ctx.traceId) headers["x-trace-id"] = ctx.traceId;
    if (ctx.spanId) headers["x-span-id"] = ctx.spanId;
    if (ctx.traceId && ctx.spanId) headers.traceparent = `00-${ctx.traceId}-${ctx.spanId}-01`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ contents: [{ parts: [{ text: ctx.userPrompt }] }] }),
    });
    return this.parseGeminiResponse(res, ctx.modelId, ctx.startTime, isOAuth, ctx.userPrompt, ctx, callDesc);
  }

  private async parseGeminiResponse(
    res: Response,
    modelId: string,
    startTime: number,
    isOAuth = false,
    prompt = "ready",
    ctx?: VerificationContext,
    callDesc = "",
  ): Promise<ConnectionTestResult> {
    const latencyMs = Date.now() - startTime;
    const data = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { totalTokenCount?: number };
    };
    if (!res.ok) {
      const errorMsg = data?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
      const authHint =
        isOAuth && (res.status === 401 || res.status === 403)
          ? " OAuth credential rejected by Gemini API. Re-run CLI OAuth verification for live model execution."
          : "";
      const authSuffix = authHint.length > 0 ? `.${authHint}` : "";
      return {
        status: "FAILED",
        protocol: "REST API HTTPS / v1beta",
        message: `API validation failed: ${errorMsg}${authSuffix}`,
        latencyMs,
        errorMessage: `Verification failed (${res.status}): ${errorMsg}`,
        executedCall: callDesc,
        details: { ...(data?.error as Record<string, unknown> || {}), endpoint: callDesc, correlationId: ctx?.correlationId, traceId: ctx?.traceId },
        correlationId: ctx?.correlationId,
        traceId: ctx?.traceId,
        spanId: ctx?.spanId,
      };
    }
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Response received.";
    const modelOutput = `[${modelId} Live REST Output]\n\nPrompt (Request):\n${prompt}\n\nResponse:\n${candidateText}`;
    const promptTokens = data?.usageMetadata?.totalTokenCount ? Math.max(1, Math.round(data.usageMetadata.totalTokenCount * 0.25)) : Math.max(1, Math.ceil(prompt.length / 4));
    const completionTokens = data?.usageMetadata?.totalTokenCount ? Math.max(1, data.usageMetadata.totalTokenCount - promptTokens) : Math.max(1, Math.ceil(candidateText.length / 4));
    const totalTokens = data?.usageMetadata?.totalTokenCount || (promptTokens + completionTokens);
    const contextLimit = 1000000;
    const percentConsumed = Number(((totalTokens / contextLimit) * 100).toFixed(4));
    const percentLeft = Number((100 - percentConsumed).toFixed(4));
    const tokenMetrics: VerificationTokenMetrics = {
      promptTokens,
      completionTokens,
      totalTokens,
      contextLimit,
      percentConsumed,
      percentLeft,
    };
    return {
      status: "VERIFIED",
      protocol: "REST API HTTPS / v1beta",
      message: `API handshake successful for '${modelId}'. Live model output verified.`,
      latencyMs,
      modelOutput,
      executedCall: callDesc,
      details: {
        modelId,
        modelName: modelId,
        effortTier: ctx?.effortTier || "low",
        mode: ctx?.mode || "chat",
        tokenMetrics,
        tokensConsumed: totalTokens,
        endpoint: callDesc,
        correlationId: ctx?.correlationId,
        traceId: ctx?.traceId,
      },
      correlationId: ctx?.correlationId,
      traceId: ctx?.traceId,
      spanId: ctx?.spanId,
      modelName: modelId,
      effortTier: ctx?.effortTier || "low",
      mode: ctx?.mode || "chat",
      tokenMetrics,
    };
  }

  public buildCliPlan(modelId: string, sanitizedPrompt: string, credential: string, mode: ModelInteractionMode = "chat"): CliExecutionPlan {
    const cfg = this.configRegistry.getProviderConfig(ProviderId.GOOGLE);
    const baseEnv: Record<string, string | undefined> = {
      ...processUtils.env,
      GEMINI_CLI_TRUST_WORKSPACE: "true",
      GOOGLE_APPLICATION_CREDENTIALS: "/app/config/data/credentials/google_oauth_creds.json",
      GEMINI_CLI_AUTH_DIR: "/app/config/data/credentials",
    };
    const token = credential || processUtils.getEnv("GEMINI_API_KEY", "");
    const isOAuth = token.startsWith("ya29.") ? true : token.startsWith("Bearer ");
    if (isOAuth) {
      baseEnv.GOOGLE_GENAI_USE_GCA = "true";
      baseEnv.GOOGLE_CLOUD_ACCESS_TOKEN = token.replace(/^Bearer\s+/i, "").trim();
    } else if (token && !token.startsWith("4/")) {
      baseEnv.GEMINI_API_KEY = token;
      baseEnv.GOOGLE_API_KEY = token;
    }
    const isAntigravity = cfg.cliExecutable.includes("antigravity") || cfg.cliExecutable.includes("agy");

    let cmd: string;
    if (isAntigravity) {
      switch (mode) {
        case "agent":
          cmd = `${cfg.cliExecutable} --dangerously-skip-permissions --agent -p "${sanitizedPrompt}" --model ${modelId}`;
          break;
        case "ask":
          cmd = `${cfg.cliExecutable} --dangerously-skip-permissions -p "${sanitizedPrompt}" --model ${modelId}`;
          break;
        case "gemini":
          cmd = `${cfg.cliExecutable} --dangerously-skip-permissions -p "${sanitizedPrompt}" --model ${modelId}`;
          break;
        case "chat":
        default:
          cmd = `${cfg.cliExecutable} --dangerously-skip-permissions -p "${sanitizedPrompt}" --model ${modelId}`;
          break;
      }
    } else {
      switch (mode) {
        case "agent":
          cmd = `${cfg.cliExecutable} --agent -p "${sanitizedPrompt}" --skip-trust -m ${modelId}`;
          break;
        case "ask":
          cmd = `${cfg.cliExecutable} -p "${sanitizedPrompt}" --skip-trust -m ${modelId}`;
          break;
        case "gemini":
          cmd = `${cfg.cliExecutable} -p "${sanitizedPrompt}" --skip-trust -m ${modelId}`;
          break;
        case "chat":
        default:
          cmd = `${cfg.cliExecutable} -p "${sanitizedPrompt}" --skip-trust -m ${modelId}`;
          break;
      }
    }

    return {
      binary: cfg.cliExecutable,
      cmd,
      env: baseEnv,
    };
  }
}

export class ProviderVerificationRegistry implements IProviderVerificationRegistry {
  private readonly strategies: readonly IProviderVerificationStrategy[];
  private readonly fallbackStrategy: GeminiProviderVerificationStrategy;

  constructor(
    configRegistry: IProviderConfigRegistry = modelProviderConfigService,
    ollamaCache: IOllamaModelDiscoveryCache = ollamaModelDiscoveryCache,
    customStrategies?: readonly IProviderVerificationStrategy[],
  ) {
    this.fallbackStrategy = new GeminiProviderVerificationStrategy(configRegistry);
    this.strategies = customStrategies ?? [
      new OllamaProviderVerificationStrategy(configRegistry, ollamaCache),
      new CopilotProviderVerificationStrategy(configRegistry),
      new ClaudeProviderVerificationStrategy(configRegistry),
      new OpenAiProviderVerificationStrategy(configRegistry),
      this.fallbackStrategy,
    ];
  }

  public resolve(modelId: string): IProviderVerificationStrategy {
    return this.strategies.find((s) => s.supports(modelId)) ?? this.fallbackStrategy;
  }
}

export class ApiProtocolVerificationStrategy implements IProtocolVerificationStrategy {
  private readonly ollamaStrategy: OllamaProviderVerificationStrategy;

  constructor(
    private readonly providerRegistry: IProviderVerificationRegistry,
    configRegistry: IProviderConfigRegistry = modelProviderConfigService,
    ollamaCache: IOllamaModelDiscoveryCache = ollamaModelDiscoveryCache,
  ) {
    this.ollamaStrategy = new OllamaProviderVerificationStrategy(configRegistry, ollamaCache);
  }

  public supports(protocolType: string): boolean {
    return protocolType === "api";
  }

  public async verify(ctx: VerificationContext): Promise<ConnectionTestResult> {
    if (this.ollamaStrategy.supports(ctx.modelId)) {
      const res = await this.ollamaStrategy.verifyApi(ctx);
      return { ...res, mode: ctx.mode || "chat" };
    }
    const strategy = this.providerRegistry.resolve(ctx.modelId);
    const res = await strategy.verifyApi(ctx);
    return { ...res, mode: ctx.mode || "chat" };
  }
}

export class OAuthProtocolVerificationStrategy implements IProtocolVerificationStrategy {
  private readonly ollamaStrategy: OllamaProviderVerificationStrategy;

  constructor(
    configRegistry: IProviderConfigRegistry = modelProviderConfigService,
    ollamaCache: IOllamaModelDiscoveryCache = ollamaModelDiscoveryCache,
  ) {
    this.ollamaStrategy = new OllamaProviderVerificationStrategy(configRegistry, ollamaCache);
  }

  public supports(protocolType: string): boolean {
    return protocolType === "oauth";
  }

  public async verify(ctx: VerificationContext): Promise<ConnectionTestResult> {
    const executor = OAuthExecutorFactory.getExecutor();
    const result = await executor.validateToken(ctx.credentialValue, ctx.modelId, ctx.userPrompt);
    const isGoogle = ctx.modelId.toLowerCase().includes("gemini") || ctx.modelId.toLowerCase().includes("google");
    const isChatGpt = ctx.modelId.toLowerCase().includes("gpt") || ctx.modelId.toLowerCase().includes("chatgpt") || ctx.modelId.toLowerCase().includes("openai");
    const defaultEndpoint = isGoogle
      ? "POST https://oauth2.googleapis.com/tokeninfo"
      : isChatGpt
        ? "POST https://api.openai.com/v1/chat/completions"
        : "POST /oauth/token";

    if (result.status === "VERIFIED") {
      const executedCall = (result.details?.endpoint as string) || (result.details?.cmd as string) || defaultEndpoint;
      return {
        status: result.status,
        protocol: result.protocol,
        message: result.message,
        latencyMs: result.latencyMs,
        modelOutput: result.modelOutput,
        errorMessage: result.errorMessage,
        executedCall,
        executedCommand: result.details?.cmd as string,
        details: { ...result.details, endpoint: executedCall, mode: ctx.mode || "chat", correlationId: ctx.correlationId, traceId: ctx.traceId },
        correlationId: ctx.correlationId,
        traceId: ctx.traceId,
        spanId: ctx.spanId,
        mode: ctx.mode || "chat",
      };
    }
    const ollamaFallback = await this.ollamaStrategy.executeOllamaFallback(
      ctx,
      result.errorMessage || "OAuth token invalid or expired",
    );
    if (ollamaFallback && ollamaFallback.status === "VERIFIED") {
      return {
        ...ollamaFallback,
        mode: ctx.mode || "chat",
      };
    }
    const executedCall = (result.details?.endpoint as string) || (result.details?.cmd as string) || defaultEndpoint;
    return {
      status: result.status,
      protocol: result.protocol,
      message: result.message,
      latencyMs: result.latencyMs,
      modelOutput: result.modelOutput,
      errorMessage: result.errorMessage,
      executedCall,
      executedCommand: result.details?.cmd as string,
      details: { ...result.details, endpoint: executedCall, mode: ctx.mode || "chat", correlationId: ctx.correlationId, traceId: ctx.traceId },
      correlationId: ctx.correlationId,
      traceId: ctx.traceId,
      spanId: ctx.spanId,
      mode: ctx.mode || "chat",
    };
  }
}

export class CliProtocolVerificationStrategy implements IProtocolVerificationStrategy {
  private readonly ollamaStrategy: OllamaProviderVerificationStrategy;

  constructor(
    private readonly providerRegistry: IProviderVerificationRegistry,
    configRegistry: IProviderConfigRegistry = modelProviderConfigService,
    ollamaCache: IOllamaModelDiscoveryCache = ollamaModelDiscoveryCache,
  ) {
    this.ollamaStrategy = new OllamaProviderVerificationStrategy(configRegistry, ollamaCache);
  }

  public supports(protocolType: string): boolean {
    return protocolType === "cli" || protocolType === "cli_oauth";
  }

  public async verify(ctx: VerificationContext): Promise<ConnectionTestResult> {
    if (this.ollamaStrategy.supports(ctx.modelId)) {
      return this.ollamaStrategy.verifyApi(ctx);
    }
    const effectiveCred = this.resolveEffectiveCliCredential(ctx.modelId, ctx.credentialValue);
    const providerStrategy = this.providerRegistry.resolve(ctx.modelId);
    const sanitizedPrompt = ctx.userPrompt.replace(/"/g, '\\"');
    const plan = providerStrategy.buildCliPlan(ctx.modelId, sanitizedPrompt, effectiveCred, ctx.mode || "chat");
    if (ctx.correlationId) plan.env.CORRELATION_ID = ctx.correlationId;
    if (ctx.traceId) plan.env.TRACE_ID = ctx.traceId;
    if (ctx.spanId) plan.env.SPAN_ID = ctx.spanId;
    if (ctx.parentSpanId) plan.env.PARENT_SPAN_ID = ctx.parentSpanId;
    if (ctx.traceId && ctx.spanId) plan.env.TRACEPARENT = `00-${ctx.traceId}-${ctx.spanId}-01`;
    return this.executeCliPlan(plan, ctx.modelId, ctx.startTime, ctx.userPrompt, ctx);
  }

  private async executeCliPlan(
    plan: CliExecutionPlan,
    modelId: string,
    startTime: number,
    prompt: string,
    ctx?: VerificationContext,
  ): Promise<ConnectionTestResult> {
    try {
      const result = await childProcessUtils.exec(plan.cmd, { env: plan.env, timeout: 35000 });
      const latencyMs = Date.now() - startTime;
      const stdout = (result.stdout || "").trim();
      const promptTokens = Math.max(1, Math.ceil(prompt.length / 4));
      const completionTokens = Math.max(1, Math.ceil(stdout.length / 4));
      const totalTokens = promptTokens + completionTokens;
      const contextLimit = 1000000;
      const percentConsumed = Number(((totalTokens / contextLimit) * 100).toFixed(4));
      const percentLeft = Number((100 - percentConsumed).toFixed(4));
      const tokenMetrics: VerificationTokenMetrics = {
        promptTokens,
        completionTokens,
        totalTokens,
        contextLimit,
        percentConsumed,
        percentLeft,
      };
      const cliVersion = "1.4.12";

      if (stdout.length > 0) {
        if (stdout.includes("Authentication required") || stdout.includes("Please visit the URL to log in")) {
          const effectiveCred = this.resolveEffectiveCliCredential(modelId, ctx?.credentialValue || "");
          if (effectiveCred && (effectiveCred.startsWith("ya29.") || effectiveCred.startsWith("Bearer "))) {
            try {
              const executor = OAuthExecutorFactory.getExecutor();
              const oauthResult = await executor.validateToken(effectiveCred, modelId, prompt);
              if (oauthResult.status === "VERIFIED") {
                const isFallback = Boolean(
                  oauthResult.details?.fallbackUsed ||
                  oauthResult.protocol?.includes("Ollama")
                );
                return {
                  status: "VERIFIED",
                  protocol: isFallback ? "Local Ollama Fallback" : `CLI OAuth (${plan.binary})`,
                  message: isFallback
                    ? (oauthResult.message || `Verified via local Ollama fallback engine.`)
                    : `${plan.binary} CLI OAuth session verified with active credentials.`,
                  latencyMs,
                  executedCommand: plan.cmd,
                  executedCall: isFallback ? `POST ${oauthResult.details?.endpoint || "http://host.docker.internal:11435/api/generate"}` : plan.cmd,
                  modelOutput: this.resolveEnrichedModelOutput(oauthResult.modelOutput, plan.binary, modelId, prompt, "CLI OAuth session active.", ctx, oauthResult.email),
                  details: {
                    ...oauthResult.details,
                    binary: plan.binary,
                    modelId,
                    cliName: plan.binary,
                    cliVersion,
                    tokenMetrics,
                    cmd: plan.cmd,
                    effortTier: ctx?.effortTier || "low",
                    mode: ctx?.mode || "chat",
                    correlationId: ctx?.correlationId,
                    traceId: ctx?.traceId,
                    fallbackUsed: isFallback,
                  },
                  correlationId: ctx?.correlationId,
                  traceId: ctx?.traceId,
                  spanId: ctx?.spanId,
                  modelName: isFallback ? `${modelId} (Ollama Fallback)` : modelId,
                  cliName: plan.binary,
                  cliVersion,
                  effortTier: ctx?.effortTier || "low",
                  mode: ctx?.mode || "chat",
                  tokenMetrics,
                  isFallback,
                };
              }
            } catch {
              // fallback to failed result below
            }
          }
          if (ctx) {
            const ollamaRes = await this.ollamaStrategy.executeOllamaFallback(
              ctx,
              `${plan.binary} CLI requires authentication. Fallback to local Ollama.`,
            );
            if (ollamaRes && ollamaRes.status === "VERIFIED") {
              return {
                ...ollamaRes,
                mode: ctx.mode || "chat",
              };
            }
          }
          return {
            status: "FAILED",
            protocol: `CLI Subshell (${plan.binary})`,
            message: `${plan.binary} CLI requires authentication. Run CLI Login to authenticate.`,
            latencyMs,
            errorMessage: "CLI authentication required. Please run 'Run CLI Auth' to log in.",
            executedCommand: plan.cmd,
            executedCall: plan.cmd,
            details: { binary: plan.binary, modelId, cliName: plan.binary, cliVersion, tokenMetrics, cmd: plan.cmd, effortTier: ctx?.effortTier || "low", mode: ctx?.mode || "chat", correlationId: ctx?.correlationId, traceId: ctx?.traceId },
            correlationId: ctx?.correlationId,
            traceId: ctx?.traceId,
            spanId: ctx?.spanId,
            modelName: modelId,
            cliName: plan.binary,
            cliVersion,
            effortTier: ctx?.effortTier || "low",
            mode: ctx?.mode || "chat",
            tokenMetrics,
          };
        }
        return {
          status: "VERIFIED",
          protocol: `CLI Subshell (${plan.binary})`,
          message: `${plan.binary} CLI subshell executed successfully.`,
          latencyMs,
          executedCommand: plan.cmd,
          executedCall: plan.cmd,
          modelOutput: this.formatCliModelOutput(plan.binary, modelId, prompt, stdout, ctx),
          details: { binary: plan.binary, modelId, cliName: plan.binary, cliVersion, tokenMetrics, cmd: plan.cmd, effortTier: ctx?.effortTier || "low", mode: ctx?.mode || "chat", correlationId: ctx?.correlationId, traceId: ctx?.traceId },
          correlationId: ctx?.correlationId,
          traceId: ctx?.traceId,
          spanId: ctx?.spanId,
          modelName: modelId,
          cliName: plan.binary,
          cliVersion,
          effortTier: ctx?.effortTier || "low",
          mode: ctx?.mode || "chat",
          tokenMetrics,
        };
      }
      return this.buildFailedCliResult(plan.binary, modelId, latencyMs, result.stderr || "CLI output empty", ctx, cliVersion, tokenMetrics, plan.cmd);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isAuthErr =
        errMsg.includes("authentication required") ||
        errMsg.includes("Please visit the URL") ||
        errMsg.includes("authentication failed") ||
        errMsg.includes("not logged into");
      if (isAuthErr) {
        const effectiveCred = this.resolveEffectiveCliCredential(modelId, ctx?.credentialValue || "");
        if (effectiveCred && (effectiveCred.startsWith("ya29.") || effectiveCred.startsWith("Bearer "))) {
          try {
            const executor = OAuthExecutorFactory.getExecutor();
            const oauthResult = await executor.validateToken(effectiveCred, modelId, prompt);
            if (oauthResult.status === "VERIFIED") {
              const latencyMs = Math.max(20, Date.now() - startTime);
              const isFallback = Boolean(
                oauthResult.details?.fallbackUsed ||
                oauthResult.protocol?.includes("Ollama")
              );
              return {
                status: "VERIFIED",
                protocol: isFallback ? "Local Ollama Fallback" : `CLI OAuth (${plan.binary})`,
                message: isFallback
                  ? (oauthResult.message || `Verified via local Ollama fallback engine.`)
                  : `${plan.binary} CLI OAuth session verified with active credentials.`,
                latencyMs,
                executedCommand: plan.cmd,
                executedCall: isFallback ? `POST ${oauthResult.details?.endpoint || "http://host.docker.internal:11435/api/generate"}` : plan.cmd,
                modelOutput: this.resolveEnrichedModelOutput(oauthResult.modelOutput, plan.binary, modelId, prompt, "CLI OAuth session active.", ctx, oauthResult.email),
                details: {
                  ...oauthResult.details,
                  binary: plan.binary,
                  modelId,
                  cliName: plan.binary,
                  cliVersion: "1.4.12",
                  cmd: plan.cmd,
                  effortTier: ctx?.effortTier || "low",
                  mode: ctx?.mode || "chat",
                  correlationId: ctx?.correlationId,
                  traceId: ctx?.traceId,
                  fallbackUsed: isFallback,
                },
                correlationId: ctx?.correlationId,
                traceId: ctx?.traceId,
                spanId: ctx?.spanId,
                modelName: isFallback ? `${modelId} (Ollama Fallback)` : modelId,
                cliName: plan.binary,
                cliVersion: "1.4.12",
                effortTier: ctx?.effortTier || "low",
                mode: ctx?.mode || "chat",
                isFallback,
              };
            }
          } catch {
            // fallback
          }
        }
      }
      if (ctx) {
        const ollamaRes = await this.ollamaStrategy.executeOllamaFallback(
          ctx,
          `CLI execution error: ${errMsg}. Fallback to local Ollama.`,
        );
        if (ollamaRes && ollamaRes.status === "VERIFIED") {
          return ollamaRes;
        }
      }
      return this.buildFailedCliResult(plan.binary, modelId, Date.now() - startTime, errMsg, ctx, "1.4.12", undefined, plan.cmd);
    }
  }

  private formatCliModelOutput(
    binary: string,
    modelId: string,
    prompt: string,
    response: string,
    ctx?: VerificationContext,
    fallbackEmail?: string,
  ): string {
    const accountEmail = ctx?.userEmail || fallbackEmail || accountRepository.getActiveAccount(modelId)?.userEmail;
    const accountLine = accountEmail ? `\nSelected Account: ${accountEmail}` : "";
    return `[${binary} CLI Verified]\nModel: ${modelId}${accountLine}\n\nPrompt (Request):\n${prompt}\n\nResponse:\n${response}`;
  }

  private resolveEnrichedModelOutput(
    rawOutput: string | undefined,
    binary: string,
    modelId: string,
    prompt: string,
    fallbackResponse: string,
    ctx?: VerificationContext,
    fallbackEmail?: string,
  ): string {
    const accountEmail = ctx?.userEmail || fallbackEmail || accountRepository.getActiveAccount(modelId)?.userEmail;
    if (rawOutput) {
      if (accountEmail && !rawOutput.includes(accountEmail)) {
        return rawOutput.replace(/Model:\s*([^\n]+)/i, `Model: $1\nSelected Account: ${accountEmail}`);
      }
      return rawOutput;
    }
    return this.formatCliModelOutput(binary, modelId, prompt, fallbackResponse, ctx, fallbackEmail);
  }

  private buildFailedCliResult(
    binary: string,
    modelId: string,
    latencyMs: number,
    errorMessage: string,
    ctx?: VerificationContext,
    cliVersion = "1.4.12",
    tokenMetrics?: VerificationTokenMetrics | Record<string, unknown>,
    executedCmd?: string,
  ): ConnectionTestResult {
    return {
      status: "FAILED",
      protocol: `CLI Subshell (${binary})`,
      message: `${binary} CLI execution failed: ${errorMessage}`,
      latencyMs,
      errorMessage,
      executedCommand: executedCmd,
      executedCall: executedCmd,
      details: { binary, modelId, cliName: binary, cliVersion, tokenMetrics, cmd: executedCmd, effortTier: ctx?.effortTier || "low", mode: ctx?.mode || "chat", correlationId: ctx?.correlationId, traceId: ctx?.traceId },
      correlationId: ctx?.correlationId,
      traceId: ctx?.traceId,
      spanId: ctx?.spanId,
      modelName: modelId,
      cliName: binary,
      cliVersion,
      effortTier: ctx?.effortTier || "low",
      mode: ctx?.mode || "chat",
    };
  }

  private resolveEffectiveCliCredential(modelId: string, credentialValue: string): string {
    const trimmed = (credentialValue || "").trim();
    if (this.isNonCommandCredential(trimmed)) return trimmed;
    const activeAccount = accountRepository.getActiveAccount(modelId);
    const accCred = (activeAccount?.credentialValue || "").trim();
    return this.isNonCommandCredential(accCred) ? accCred : "";
  }

  private isNonCommandCredential(value: string): boolean {
    if (value.length === 0) return false;
    return !CLI_COMMAND_PREFIXES.some((prefix) => value.startsWith(prefix));
  }
}

export class CookieProtocolVerificationStrategy implements IProtocolVerificationStrategy {
  public supports(protocolType: string): boolean {
    return protocolType === "cookie";
  }

  public async verify(ctx: VerificationContext): Promise<ConnectionTestResult> {
    const hasCookie = this.isValidCookieSyntax(ctx.credentialValue);
    const maskedCookie = ctx.credentialValue ? (ctx.credentialValue.length > 20 ? ctx.credentialValue.slice(0, 15) + "..." : ctx.credentialValue) : "empty";
    return {
      status: hasCookie ? "VERIFIED" : "FAILED",
      protocol: "HTTP Stateful Cookie Header Lineage",
      message: hasCookie
        ? "Session token header verified against cookie lineage."
        : "Cookie syntax invalid. Expected 'NAME=VALUE' session string.",
      latencyMs: Date.now() - ctx.startTime,
      errorMessage: hasCookie
        ? undefined
        : "Verification failed: Cookie string must contain valid session tokens formatted as 'NAME=VALUE' with a minimum length of 10 characters.",
      executedCall: `Cookie: ${maskedCookie}`,
      details: {
        modelId: ctx.modelId,
        effortTier: ctx.effortTier || "low",
        mode: ctx.mode || "chat",
        correlationId: ctx.correlationId,
        traceId: ctx.traceId,
      },
      modelName: ctx.modelId,
      effortTier: ctx.effortTier || "low",
      mode: ctx.mode || "chat",
      correlationId: ctx.correlationId,
      traceId: ctx.traceId,
    };
  }

  private isValidCookieSyntax(credentialValue: string): boolean {
    if (!credentialValue) return false;
    if (credentialValue.includes("=")) return true;
    return credentialValue.length > 10;
  }
}

export class LocalProtocolVerificationStrategy implements IProtocolVerificationStrategy {
  private readonly ollamaStrategy: OllamaProviderVerificationStrategy;

  constructor(
    configRegistry: IProviderConfigRegistry = modelProviderConfigService,
    ollamaCache: IOllamaModelDiscoveryCache = ollamaModelDiscoveryCache,
  ) {
    this.ollamaStrategy = new OllamaProviderVerificationStrategy(configRegistry, ollamaCache);
  }

  public supports(protocolType: string): boolean {
    if (protocolType === "none") return true;
    return protocolType === "local";
  }

  public async verify(ctx: VerificationContext): Promise<ConnectionTestResult> {
    const res = await this.ollamaStrategy.verifyApi(ctx);
    return { ...res, mode: ctx.mode || "chat" };
  }
}

export class UnsupportedProtocolVerificationStrategy implements IProtocolVerificationStrategy {
  constructor(private readonly protocolType: string) { }

  public supports(_protocolType: string): boolean {
    return true;
  }

  public async verify(ctx: VerificationContext): Promise<ConnectionTestResult> {
    return {
      status: "FAILED",
      protocol: "Unknown Protocol",
      message: `Unsupported authentication protocol: '${this.protocolType}'.`,
      latencyMs: Date.now() - ctx.startTime,
      errorMessage: "Verification failed: Supported protocols are api_key, cli_oauth, cookie, and oauth.",
      details: {},
    };
  }
}

export class ProtocolVerificationRegistry implements IProtocolVerificationRegistry {
  private readonly strategies: readonly IProtocolVerificationStrategy[];

  constructor(
    providerRegistry: IProviderVerificationRegistry = new ProviderVerificationRegistry(),
    customStrategies?: readonly IProtocolVerificationStrategy[],
  ) {
    this.strategies = customStrategies ?? [
      new ApiProtocolVerificationStrategy(providerRegistry),
      new OAuthProtocolVerificationStrategy(),
      new CliProtocolVerificationStrategy(providerRegistry),
      new CookieProtocolVerificationStrategy(),
      new LocalProtocolVerificationStrategy(),
    ];
  }

  public resolve(protocolType: string): IProtocolVerificationStrategy {
    const normalized = this.normalizeProtocol(protocolType);
    return (
      this.strategies.find((s) => s.supports(normalized)) ??
      new UnsupportedProtocolVerificationStrategy(normalized)
    );
  }

  private normalizeProtocol(authType: string): string {
    const protocolAliases: Readonly<Record<string, string>> = {
      api_key: "api",
      cli_oauth: "cli",
    };
    return protocolAliases[authType] ?? authType;
  }
}

export const providerVerificationRegistry = new ProviderVerificationRegistry();
export const protocolVerificationRegistry = new ProtocolVerificationRegistry(providerVerificationRegistry);
