import {
  coreRestClient,
  modelProviderConfigService,
  type IRestClient,
  type IProviderConfigRegistry,
} from "@model-box/model-connector-core";
import {
  UnifiedModelExecutionAdapter,
  type ModelConnectorHealth,
} from "@/adapters/UnifiedModelExecutionAdapter.js";
import { ModelFamily, ModelCatalogDefaults } from "@/domain/constants/index.js";

export type OllamaConnectorHealth = ModelConnectorHealth;

export type OllamaAuthMode = "NONE" | "OAUTH";

export interface OllamaExecutionResult {
  readonly authMode: OllamaAuthMode;
  readonly model: string;
  readonly responseText: string;
  readonly endpointUrl: string;
  readonly authenticatedIdentity?: string;
}

/**
 * Strategy interface for Dual Ollama Authentication Modes (Req 4 / STD-COD-005):
 * - Use Case 1: Direct unauthenticated local Ollama daemon (:11435)
 * - Use Case 2: OAuth 2.0 Bearer-authenticated Ollama Gateway (:11436/ollama-oauth)
 */
export interface IOllamaAuthModeStrategy {
  readonly authMode: OllamaAuthMode;
  listAvailableModels(bearerToken?: string): Promise<readonly string[]>;
  generateCompletion(
    model: string,
    prompt: string,
    bearerToken?: string,
  ): Promise<OllamaExecutionResult>;
}

/**
 * Use Case 1 Strategy: Ollama WITHOUT OAuth (Direct Local Daemon).
 */
export class UnauthenticatedOllamaModeStrategy implements IOllamaAuthModeStrategy {
  public readonly authMode: OllamaAuthMode = "NONE";

  constructor(
    private readonly restClient: IRestClient = coreRestClient,
    private readonly configRegistry: IProviderConfigRegistry = modelProviderConfigService,
  ) {}

  public async listAvailableModels(): Promise<readonly string[]> {
    const cfg = this.configRegistry.getProviderConfig("ollama");
    const url = `${cfg.baseUrl.replace(/\/+$/, "")}${cfg.tagsPath ?? "/api/tags"}`;
    const response = await this.restClient.get<{
      readonly models?: readonly { readonly name?: string }[];
    }>(url);
    return Object.freeze(
      (response.data?.models ?? [])
        .map((m: { readonly name?: string }) => m.name ?? "")
        .filter((n: string) => n.length > 0),
    );
  }

  public async generateCompletion(model: string, prompt: string): Promise<OllamaExecutionResult> {
    const cfg = this.configRegistry.getProviderConfig("ollama");
    const url = `${cfg.baseUrl.replace(/\/+$/, "")}${cfg.generatePath ?? "/api/generate"}`;
    const response = await this.restClient.post<{ readonly response?: string }>(url, {
      model,
      prompt,
      stream: false,
    });
    return Object.freeze({
      authMode: "NONE",
      model,
      responseText: response.data?.response ?? "",
      endpointUrl: url,
    });
  }
}

/**
 * Use Case 2 Strategy: Ollama WITH OAuth 2.0 Bearer Authentication.
 */
export class OAuthAuthenticatedOllamaModeStrategy implements IOllamaAuthModeStrategy {
  public readonly authMode: OllamaAuthMode = "OAUTH";

  constructor(
    private readonly restClient: IRestClient = coreRestClient,
    private readonly configRegistry: IProviderConfigRegistry = modelProviderConfigService,
  ) {}

  public async listAvailableModels(bearerToken?: string): Promise<readonly string[]> {
    const token = this.requireBearerToken(bearerToken);
    const baseUrl = this.resolveOAuthBaseUrl();
    const response = await this.restClient.get<{
      readonly models?: readonly { readonly name?: string }[];
    }>(`${baseUrl}/api/tags`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return Object.freeze(
      (response.data?.models ?? [])
        .map((m: { readonly name?: string }) => m.name ?? "")
        .filter((n: string) => n.length > 0),
    );
  }

  public async generateCompletion(
    model: string,
    prompt: string,
    bearerToken?: string,
  ): Promise<OllamaExecutionResult> {
    const token = this.requireBearerToken(bearerToken);
    const url = `${this.resolveOAuthBaseUrl()}/api/generate`;
    const response = await this.restClient.post<{
      readonly response?: string;
      readonly authenticatedEmail?: string;
    }>(
      url,
      { model, prompt, stream: false },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return Object.freeze({
      authMode: "OAUTH",
      model,
      responseText: response.data?.response ?? "",
      endpointUrl: url,
      authenticatedIdentity: response.data?.authenticatedEmail,
    });
  }

  private resolveOAuthBaseUrl(): string {
    const cfg = this.configRegistry.getProviderConfig("ollama");
    const base = cfg.oauthBaseUrl ?? `${this.configRegistry.getPlatformUrl("ollamaOAuthBaseUrl")}/ollama-oauth`;
    return base.replace(/\/+$/, "");
  }

  private requireBearerToken(bearerToken?: string): string {
    const trimmed = bearerToken?.trim() ?? "";
    if (!trimmed) {
      throw new Error("Ollama OAuth Mode (Use Case 2) requires a valid OAuth 2.0 Bearer token");
    }
    return trimmed;
  }
}

/**
 * Dedicated enterprise connector adapter for Local Ollama open-weights models (lfm3-omni, LLaMA 3.2, Phi-4, Gemma)
 * supporting both Use Case 1 (without OAuth) and Use Case 2 (with OAuth 2.0).
 */
export class OllamaConnectorAdapter extends UnifiedModelExecutionAdapter {
  public readonly family = ModelFamily.OLLAMA;
  public readonly defaultModel = ModelCatalogDefaults.DEFAULT_OLLAMA_MODEL;
  private readonly modeStrategies = new Map<OllamaAuthMode, IOllamaAuthModeStrategy>();

  constructor(strategies?: readonly IOllamaAuthModeStrategy[]) {
    super();
    const list = strategies ?? [
      new UnauthenticatedOllamaModeStrategy(),
      new OAuthAuthenticatedOllamaModeStrategy(),
    ];
    for (const strategy of list) {
      this.modeStrategies.set(strategy.authMode, strategy);
    }
  }

  public resolveAuthModeStrategy(authMode: OllamaAuthMode): IOllamaAuthModeStrategy {
    const strategy = this.modeStrategies.get(authMode);
    if (!strategy) {
      throw new Error(`Unsupported Ollama authentication mode: ${authMode}`);
    }
    return strategy;
  }

  public async executeDualModeCompletion(
    authMode: OllamaAuthMode,
    model: string,
    prompt: string,
    bearerToken?: string,
  ): Promise<OllamaExecutionResult> {
    return this.resolveAuthModeStrategy(authMode).generateCompletion(model, prompt, bearerToken);
  }

  public async discoverModelsByAuthMode(
    authMode: OllamaAuthMode,
    bearerToken?: string,
  ): Promise<readonly string[]> {
    return this.resolveAuthModeStrategy(authMode).listAvailableModels(bearerToken);
  }
}
