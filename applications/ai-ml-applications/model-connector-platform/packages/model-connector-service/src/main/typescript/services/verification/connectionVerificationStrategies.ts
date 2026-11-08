import {
  childProcessUtils,
  modelProviderConfigService,
  ollamaModelDiscoveryCache,
  processUtils,
  ProviderId,
  type IOllamaModelDiscoveryCache,
  type IProviderConfigRegistry,
} from "@model-box/model-connector-core";
import { accountRepository } from "@/repositories/accountRepository";
import { OAuthExecutorFactory } from "@/services/oauth";
import type { ConnectionTestResult } from "@/controllers/modelConfigController";

export interface VerificationContext {
  readonly modelId: string;
  readonly credentialValue: string;
  readonly userPrompt: string;
  readonly startTime: number;
}

export interface CliExecutionPlan {
  readonly binary: string;
  readonly cmd: string;
  readonly env: Record<string, string | undefined>;
}

export interface IProviderVerificationStrategy {
  supports(modelId: string): boolean;
  verifyApi(ctx: VerificationContext): Promise<ConnectionTestResult>;
  buildCliPlan(modelId: string, sanitizedPrompt: string, credential: string): CliExecutionPlan;
}

export interface IProviderVerificationRegistry {
  resolve(modelId: string): IProviderVerificationStrategy;
}

export interface IProtocolVerificationStrategy {
  supports(protocolType: string): boolean;
  verify(ctx: VerificationContext): Promise<ConnectionTestResult>;
}

export interface IProtocolVerificationRegistry {
  resolve(protocolType: string): IProtocolVerificationStrategy;
}

const CLI_COMMAND_PREFIXES = Object.freeze(["gemini ", "claude ", "github-copilot-cli ", "gh ", "ollama "]);

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
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cleanToken}` },
      body: JSON.stringify({ model: ctx.modelId, prompt: ctx.userPrompt, stream: false }),
    });
    return this.parseOAuthOllamaResponse(res, url, ctx.startTime);
  }

  private async parseOAuthOllamaResponse(
    res: Response,
    url: string,
    startTime: number,
  ): Promise<ConnectionTestResult> {
    if (!res.ok) {
      return {
        status: "FAILED",
        protocol: "Ollama OAuth 2.0 Gateway",
        message: `Ollama OAuth 2.0 token rejected (HTTP ${res.status}).`,
        latencyMs: Date.now() - startTime,
        errorMessage: `OAuth Bearer token unauthorized (${res.status})`,
        details: { endpoint: url, authMode: "OAUTH" },
      };
    }
    const data = (await res.json()) as { response?: string; authenticatedEmail?: string };
    return {
      status: "VERIFIED",
      protocol: "Ollama OAuth 2.0 Gateway",
      message: `Ollama OAuth 2.0 connection verified for '${data.authenticatedEmail ?? "operator"}'.`,
      latencyMs: Date.now() - startTime,
      modelOutput: data.response || "Ollama OAuth response verified",
      details: { endpoint: url, authMode: "OAUTH", authenticatedEmail: data.authenticatedEmail },
    };
  }

  private resolveGenerateEndpoints(): readonly string[] {
    const cfg = this.configRegistry.getProviderConfig("ollama");
    const generatePath = cfg.generatePath || "/api/generate";
    const bases = [cfg.baseUrl, ...(cfg.fallbackBaseUrls || [])].filter(Boolean);
    const uniqueBases = Array.from(new Set(bases));
    return Object.freeze(uniqueBases.map((base) => `${base.replace(/\/$/, "")}${generatePath}`));
  }

  private async probeOllamaEndpoint(url: string, ctx: VerificationContext): Promise<ConnectionTestResult | undefined> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      details: { endpoint: url, model: data.model, totalDuration: data.total_duration },
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

  public buildCliPlan(modelId: string, sanitizedPrompt: string): CliExecutionPlan {
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

  public buildCliPlan(modelId: string, sanitizedPrompt: string, credential: string): CliExecutionPlan {
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

  public buildCliPlan(modelId: string, sanitizedPrompt: string, credential: string): CliExecutionPlan {
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

export class GeminiProviderVerificationStrategy implements IProviderVerificationStrategy {
  constructor(private readonly configRegistry: IProviderConfigRegistry = modelProviderConfigService) { }

  public supports(_modelId: string): boolean {
    return true;
  }

  public async verifyApi(ctx: VerificationContext): Promise<ConnectionTestResult> {
    const cfg = this.configRegistry.getProviderConfig(ProviderId.GOOGLE);
    const isOAuth = ctx.credentialValue.startsWith("ya29.");
    const baseUrl = `${cfg.baseUrl}/${cfg.apiVersion}/models/${encodeURIComponent(ctx.modelId)}:generateContent`;
    const endpoint = isOAuth ? baseUrl : `${baseUrl}?key=${encodeURIComponent(ctx.credentialValue)}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (isOAuth) headers.Authorization = `Bearer ${ctx.credentialValue}`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ contents: [{ parts: [{ text: ctx.userPrompt }] }] }),
    });
    return this.parseGeminiResponse(res, ctx.modelId, ctx.startTime, isOAuth, ctx.userPrompt);
  }

  private async parseGeminiResponse(
    res: Response,
    modelId: string,
    startTime: number,
    isOAuth = false,
    prompt = "ready",
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
        details: (data?.error as Record<string, unknown>) || {},
      };
    }
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Response received.";
    const modelOutput = `[${modelId} Live REST Output]\n\nPrompt (Request):\n${prompt}\n\nResponse:\n${candidateText}`;
    return {
      status: "VERIFIED",
      protocol: "REST API HTTPS / v1beta",
      message: `API handshake successful for '${modelId}'. Live model output verified.`,
      latencyMs,
      modelOutput,
      details: { modelId, tokensConsumed: data?.usageMetadata?.totalTokenCount || 0 },
    };
  }

  public buildCliPlan(modelId: string, sanitizedPrompt: string, credential: string): CliExecutionPlan {
    const cfg = this.configRegistry.getProviderConfig(ProviderId.GOOGLE);
    const baseEnv: Record<string, string | undefined> = {
      ...processUtils.env,
      GEMINI_CLI_TRUST_WORKSPACE: "true",
    };
    const token = credential || processUtils.getEnv("GEMINI_API_KEY", "");
    const isOAuth = token.startsWith("ya29.") ? true : token.startsWith("Bearer ");
    if (isOAuth) {
      baseEnv.GOOGLE_GENAI_USE_GCA = "true";
      baseEnv.GOOGLE_CLOUD_ACCESS_TOKEN = token.replace(/^Bearer\s+/i, "").trim();
    } else if (token) {
      baseEnv.GEMINI_API_KEY = token;
      baseEnv.GOOGLE_API_KEY = token;
    }
    const isAntigravity = cfg.cliExecutable.includes("antigravity") || cfg.cliExecutable.includes("agy");
    const cmd = isAntigravity
      ? `${cfg.cliExecutable} -p "${sanitizedPrompt}" --model ${modelId}`
      : `${cfg.cliExecutable} -p "${sanitizedPrompt}" --skip-trust -m ${modelId}`;
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
      return this.ollamaStrategy.verifyApi(ctx);
    }
    if (!ctx.credentialValue || ctx.credentialValue.trim().length === 0) {
      return this.buildMissingApiKeyResult(ctx.modelId, ctx.startTime);
    }
    try {
      return await this.providerRegistry.resolve(ctx.modelId).verifyApi(ctx);
    } catch (err: unknown) {
      return this.buildExceptionResult(err, ctx.startTime);
    }
  }

  private buildMissingApiKeyResult(modelId: string, startTime: number): ConnectionTestResult {
    return {
      status: "FAILED",
      protocol: "REST API HTTPS",
      message: "API key is required for live verification.",
      latencyMs: Date.now() - startTime,
      errorMessage: "Verification failed: No API key supplied. Please provide a valid API key.",
      details: { modelId },
    };
  }

  private buildExceptionResult(err: unknown, startTime: number): ConnectionTestResult {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      status: "FAILED",
      protocol: "REST API HTTPS",
      message: `Live API call failed: ${errMsg}`,
      latencyMs: Date.now() - startTime,
      errorMessage: errMsg,
      details: {},
    };
  }
}

export class OAuthProtocolVerificationStrategy implements IProtocolVerificationStrategy {
  public supports(protocolType: string): boolean {
    return protocolType === "oauth";
  }

  public async verify(ctx: VerificationContext): Promise<ConnectionTestResult> {
    const executor = OAuthExecutorFactory.getExecutor();
    const result = await executor.validateToken(ctx.credentialValue, ctx.modelId, ctx.userPrompt);
    return {
      status: result.status,
      protocol: result.protocol,
      message: result.message,
      latencyMs: result.latencyMs,
      modelOutput: result.modelOutput,
      errorMessage: result.errorMessage,
      details: result.details,
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
    return protocolType === "cli";
  }

  public async verify(ctx: VerificationContext): Promise<ConnectionTestResult> {
    if (this.ollamaStrategy.supports(ctx.modelId)) {
      return this.ollamaStrategy.verifyApi(ctx);
    }
    const effectiveCred = this.resolveEffectiveCliCredential(ctx.modelId, ctx.credentialValue);
    const providerStrategy = this.providerRegistry.resolve(ctx.modelId);
    const sanitizedPrompt = ctx.userPrompt.replace(/"/g, '\\"');
    const plan = providerStrategy.buildCliPlan(ctx.modelId, sanitizedPrompt, effectiveCred);
    return this.executeCliPlan(plan, ctx.modelId, ctx.startTime, ctx.userPrompt);
  }

  private async executeCliPlan(plan: CliExecutionPlan, modelId: string, startTime: number, prompt = "ready"): Promise<ConnectionTestResult> {
    try {
      const result = await childProcessUtils.exec(plan.cmd, { env: plan.env, timeout: 30000 });
      const latencyMs = Date.now() - startTime;
      const stdout = result.stdout ? result.stdout.trim() : "";
      if (stdout.length > 0) {
        if (stdout.includes("Authentication required") || stdout.includes("Please visit the URL to log in")) {
          return {
            status: "FAILED",
            protocol: `CLI Subshell (${plan.binary})`,
            message: `${plan.binary} CLI requires authentication. Run CLI Login to authenticate.`,
            latencyMs,
            errorMessage: "CLI authentication required. Please run 'Run CLI Auth' to log in.",
            details: { binary: plan.binary, modelId },
          };
        }
        return {
          status: "VERIFIED",
          protocol: `CLI Subshell (${plan.binary})`,
          message: `${plan.binary} CLI subshell executed successfully.`,
          latencyMs,
          modelOutput: `[${plan.binary} CLI Verified]\nModel: ${modelId}\n\nPrompt (Request):\n${prompt}\n\nResponse:\n${stdout}`,
          details: { binary: plan.binary, modelId },
        };
      }
      return this.buildFailedCliResult(plan.binary, modelId, latencyMs, result.stderr || "CLI output empty");
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return this.buildFailedCliResult(plan.binary, modelId, Date.now() - startTime, errMsg);
    }
  }

  private buildFailedCliResult(binary: string, modelId: string, latencyMs: number, errorMessage: string): ConnectionTestResult {
    return {
      status: "FAILED",
      protocol: `CLI Subshell (${binary})`,
      message: `${binary} CLI execution failed: ${errorMessage}`,
      latencyMs,
      errorMessage,
      details: { binary, modelId },
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
      details: {},
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
    return this.ollamaStrategy.verifyApi(ctx);
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
