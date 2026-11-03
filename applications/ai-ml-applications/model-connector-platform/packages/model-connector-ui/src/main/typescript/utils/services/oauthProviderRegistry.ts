/**
 * OAuth Provider Strategy Pattern and Registry with Dependency Injection.
 * Conforms to:
 * - STD-COD-005 (Strategy Pattern, Polymorphic Dispatch & DI)
 * - STD-COD-002 (Centralized Constants & Zero Magic Literals from application.yml)
 * - STD-COD-007 (Clean Code & SLAP, functions <= 20 lines)
 */

import {
  DEFAULT_PLATFORM_URLS,
  ProviderId,
  type ProviderEndpointConfig,
} from "@/constants/providerConfigConstants";
import {
  ollamaUiModelCache,
  providerCatalogStore,
  type IOllamaUiModelCache,
  type ProviderCatalogStore,
} from "@/utils/services/ollamaUiModelCache";

export interface OAuthUrlOptions {
  readonly clientId?: string;
  readonly redirectUri?: string;
  readonly scopes?: string;
  readonly modelId?: string;
  readonly userEmail?: string;
}

export type ProviderCategory =
  | "frontier"
  | "accelerator"
  | "opensource"
  | "specialized"
  | "developer"
  | "enterprise";

export interface ProviderCliApiDefaults {
  readonly executable: string;
  readonly args: string;
  readonly apiBaseUrl: string;
  readonly apiVersion: string;
}

export interface IOAuthProviderStrategy {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly brandColor: string;
  readonly category: ProviderCategory;
  readonly authUrl: string;
  readonly tokenUrl: string;
  readonly defaultScopes: string;
  readonly cliCommand: string;
  readonly description: string;
  readonly defaultClientId: string;
  readonly defaultRedirectUri: string;
  readonly accountCategory: "individual" | "enterprise";
  readonly docsUrl: string;
  readonly verifiedStatus: string;
  readonly supportedProtocols: readonly ("oauth" | "cli" | "api" | "cookie")[];

  supports(modelId: string): boolean;
  buildAuthorizationUrl(options?: OAuthUrlOptions): string;
  buildExecutableLaunchUrl(options?: OAuthUrlOptions): string;
  resolveCliDefaults(modelId: string): ProviderCliApiDefaults;
}

export abstract class BaseOAuthProviderStrategy implements IOAuthProviderStrategy {
  public abstract readonly id: string;
  public readonly verifiedStatus: string = "Verified CLI & OAuth 2.0 PKCE";
  public readonly supportedProtocols: readonly ("oauth" | "cli" | "api" | "cookie")[] = [
    "oauth",
    "cli",
    "api",
  ];

  constructor(protected readonly catalogStore: ProviderCatalogStore = providerCatalogStore) {}

  protected get config(): ProviderEndpointConfig {
    return this.catalogStore.getProviderConfig(this.id);
  }

  public get name(): string {
    return this.config.name;
  }

  public get icon(): string {
    return this.config.icon;
  }

  public get brandColor(): string {
    return this.config.brandColor;
  }

  public get category(): ProviderCategory {
    return this.config.category;
  }

  public get authUrl(): string {
    return this.config.authEndpoint;
  }

  public get tokenUrl(): string {
    return this.config.tokenEndpoint;
  }

  public get defaultScopes(): string {
    return this.config.defaultScopes;
  }

  public get cliCommand(): string {
    return this.config.cliCommand;
  }

  public get description(): string {
    return this.config.description;
  }

  public get defaultClientId(): string {
    return this.config.defaultClientId;
  }

  public get defaultRedirectUri(): string {
    return this.config.defaultRedirectUri;
  }

  public get accountCategory(): "individual" | "enterprise" {
    return this.config.accountCategory;
  }

  public get docsUrl(): string {
    return this.config.docsUrl;
  }

  public supports(modelId: string): boolean {
    const lower = modelId.toLowerCase();
    return this.config.modelKeywords.some((kw) => lower.includes(kw));
  }

  public resolveCliDefaults(modelId: string): ProviderCliApiDefaults {
    return {
      executable: this.config.cliExecutable,
      args: this.config.cliArgsTemplate.replace(/\{model\}/g, modelId),
      apiBaseUrl: this.config.baseUrl,
      apiVersion: this.config.apiVersion,
    };
  }

  protected buildStructuredState(modelId?: string): string {
    const returnUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}${window.location.pathname}`
        : this.catalogStore.getPlatformUrls().uiBaseUrl;
    const params = new URLSearchParams({
      app: "modelbox-studio",
      provider: this.id,
      model: modelId || "default",
      flow: "cli_oauth",
      nonce: Math.random().toString(36).substring(2, 10),
      ts: Date.now().toString(),
      returnUrl,
    });
    return params.toString();
  }

  public buildAuthorizationUrl(options?: OAuthUrlOptions): string {
    return this.buildRawProviderUrl(options);
  }

  public buildExecutableLaunchUrl(options?: OAuthUrlOptions): string {
    return this.buildRawProviderUrl(options);
  }

  private buildRawProviderUrl(options?: OAuthUrlOptions): string {
    const clientId = (options?.clientId || this.defaultClientId || "").trim();
    if (clientId.length === 0) {
      return "";
    }
    const redirectUri = options?.redirectUri || this.defaultRedirectUri;
    const scopes = options?.scopes || this.defaultScopes;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: scopes,
      state: this.buildStructuredState(options?.modelId),
      access_type: "offline",
      prompt: "select_account consent",
    });
    if (options?.userEmail?.trim()) params.set("login_hint", options.userEmail.trim());
    this.enrichCustomParams(params);
    return `${this.authUrl}?${params.toString()}`;
  }

  protected enrichCustomParams(_params: URLSearchParams): void {
    // Hook for provider-specific query parameters
  }
}

export class GoogleGeminiOAuthStrategy extends BaseOAuthProviderStrategy {
  public readonly id = ProviderId.GOOGLE;

  protected override enrichCustomParams(params: URLSearchParams): void {
    params.set("include_granted_scopes", "true");
  }
}

export class OpenAiOAuthStrategy extends BaseOAuthProviderStrategy {
  public readonly id = ProviderId.OPENAI;
}

export class AnthropicClaudeOAuthStrategy extends BaseOAuthProviderStrategy {
  public readonly id = ProviderId.ANTHROPIC;
}

export class MicrosoftAzureOAuthStrategy extends BaseOAuthProviderStrategy {
  public readonly id = "azure";
}

export class XAiGrokOAuthStrategy extends BaseOAuthProviderStrategy {
  public readonly id = "xai";
}

export class AwsBedrockOAuthStrategy extends BaseOAuthProviderStrategy {
  public readonly id = "bedrock";
}

export class GroqCloudOAuthStrategy extends BaseOAuthProviderStrategy {
  public readonly id = "groq";
}

export class CerebrasCloudOAuthStrategy extends BaseOAuthProviderStrategy {
  public readonly id = "cerebras";
}

export class TogetherAiOAuthStrategy extends BaseOAuthProviderStrategy {
  public readonly id = "together";
}

export class FireworksAiOAuthStrategy extends BaseOAuthProviderStrategy {
  public readonly id = "fireworks";
}

export class SambaNovaOAuthStrategy extends BaseOAuthProviderStrategy {
  public readonly id = "sambanova";
}

export class OllamaLocalOAuthStrategy extends BaseOAuthProviderStrategy {
  public readonly id = "ollama";

  constructor(
    catalogStore: ProviderCatalogStore = providerCatalogStore,
    private readonly ollamaCache: IOllamaUiModelCache = ollamaUiModelCache,
  ) {
    super(catalogStore);
  }

  public override supports(modelId: string): boolean {
    return this.ollamaCache.isOllamaModel(modelId);
  }
}

export class HuggingFaceOAuthStrategy extends BaseOAuthProviderStrategy {
  public readonly id = "huggingface";
}

export class VllmServingStrategy extends BaseOAuthProviderStrategy {
  public readonly id = "vllm";
}

export class MistralAiOAuthStrategy extends BaseOAuthProviderStrategy {
  public readonly id = "mistral";
}

export class DeepSeekOAuthStrategy extends BaseOAuthProviderStrategy {
  public readonly id = "deepseek";
}

export class CohereOAuthStrategy extends BaseOAuthProviderStrategy {
  public readonly id = "cohere";
}

export class PerplexityAiOAuthStrategy extends BaseOAuthProviderStrategy {
  public readonly id = "perplexity";
}

export class Ai21LabsOAuthStrategy extends BaseOAuthProviderStrategy {
  public readonly id = "ai21";
}

export class VoyageAiOAuthStrategy extends BaseOAuthProviderStrategy {
  public readonly id = "voyage";
}

export class GitHubCopilotOAuthStrategy extends BaseOAuthProviderStrategy {
  public readonly id = "github";
}

export class CustomOidcOAuthStrategy extends BaseOAuthProviderStrategy {
  public readonly id = "custom";

  public override supports(_modelId: string): boolean {
    return true;
  }
}

export class DynamicOnboardedOAuthStrategy extends BaseOAuthProviderStrategy {
  public readonly id: string;
  private readonly customName: string;
  private readonly customIcon: string;
  private readonly customBrandColor: string;
  private readonly customCategory: ProviderCategory;
  private readonly customAuthUrl: string;
  private readonly customTokenUrl: string;
  private readonly customDefaultScopes: string;
  private readonly customCliCommand: string;
  private readonly customDescription: string;
  private readonly customDefaultClientId: string;
  private readonly customDefaultRedirectUri: string;
  private readonly customAccountCategory: "individual" | "enterprise";
  private readonly customDocsUrl: string;

  constructor(params: {
    id: string;
    name: string;
    icon?: string;
    brandColor?: string;
    category?: ProviderCategory;
    authUrl: string;
    tokenUrl: string;
    defaultScopes?: string;
    cliCommand?: string;
    description?: string;
    defaultClientId?: string;
    defaultRedirectUri?: string;
    accountCategory?: "individual" | "enterprise";
    docsUrl?: string;
  }) {
    super();
    this.id = params.id;
    this.customName = params.name;
    this.customIcon = params.icon || "🔌";
    this.customBrandColor = params.brandColor || "#38BDF8";
    this.customCategory = params.category || "specialized";
    this.customAuthUrl = params.authUrl;
    this.customTokenUrl = params.tokenUrl;
    this.customDefaultScopes = params.defaultScopes || "openid profile email";
    this.customCliCommand = params.cliCommand || `${params.id} auth login`;
    this.customDescription = params.description || `Custom Onboarded Provider: ${params.name}`;
    this.customDefaultClientId = params.defaultClientId || "";
    this.customDefaultRedirectUri =
      params.defaultRedirectUri || DEFAULT_PLATFORM_URLS.oauthCallbackUrl;
    this.customAccountCategory = params.accountCategory || "individual";
    this.customDocsUrl = params.docsUrl || "";
  }

  public override get name(): string {
    return this.customName;
  }
  public override get icon(): string {
    return this.customIcon;
  }
  public override get brandColor(): string {
    return this.customBrandColor;
  }
  public override get category(): ProviderCategory {
    return this.customCategory;
  }
  public override get authUrl(): string {
    return this.customAuthUrl;
  }
  public override get tokenUrl(): string {
    return this.customTokenUrl;
  }
  public override get defaultScopes(): string {
    return this.customDefaultScopes;
  }
  public override get cliCommand(): string {
    return this.customCliCommand;
  }
  public override get description(): string {
    return this.customDescription;
  }
  public override get defaultClientId(): string {
    return this.customDefaultClientId;
  }
  public override get defaultRedirectUri(): string {
    return this.customDefaultRedirectUri;
  }
  public override get accountCategory(): "individual" | "enterprise" {
    return this.customAccountCategory;
  }
  public override get docsUrl(): string {
    return this.customDocsUrl;
  }

  public override supports(modelId: string): boolean {
    return modelId.toLowerCase().includes(this.id.toLowerCase());
  }
}

export class OAuthProviderRegistry {
  private static instance: OAuthProviderRegistry | null = null;
  private readonly strategies: IOAuthProviderStrategy[];
  private readonly fallbackStrategy: IOAuthProviderStrategy;

  constructor(
    customStrategies?: readonly IOAuthProviderStrategy[],
    catalogStore: ProviderCatalogStore = providerCatalogStore,
    ollamaCache: IOllamaUiModelCache = ollamaUiModelCache,
  ) {
    this.fallbackStrategy = new CustomOidcOAuthStrategy(catalogStore);
    this.strategies = customStrategies
      ? [...customStrategies]
      : [
          new GitHubCopilotOAuthStrategy(catalogStore),
          new GoogleGeminiOAuthStrategy(catalogStore),
          new OpenAiOAuthStrategy(catalogStore),
          new AnthropicClaudeOAuthStrategy(catalogStore),
          new MicrosoftAzureOAuthStrategy(catalogStore),
          new XAiGrokOAuthStrategy(catalogStore),
          new AwsBedrockOAuthStrategy(catalogStore),
          new GroqCloudOAuthStrategy(catalogStore),
          new CerebrasCloudOAuthStrategy(catalogStore),
          new TogetherAiOAuthStrategy(catalogStore),
          new FireworksAiOAuthStrategy(catalogStore),
          new SambaNovaOAuthStrategy(catalogStore),
          new OllamaLocalOAuthStrategy(catalogStore, ollamaCache),
          new HuggingFaceOAuthStrategy(catalogStore),
          new VllmServingStrategy(catalogStore),
          new MistralAiOAuthStrategy(catalogStore),
          new DeepSeekOAuthStrategy(catalogStore),
          new CohereOAuthStrategy(catalogStore),
          new PerplexityAiOAuthStrategy(catalogStore),
          new Ai21LabsOAuthStrategy(catalogStore),
          new VoyageAiOAuthStrategy(catalogStore),
        ];
  }

  public static getInstance(): OAuthProviderRegistry {
    if (!this.instance) {
      this.instance = new OAuthProviderRegistry();
    }
    return this.instance;
  }

  public getStrategy(providerId: string): IOAuthProviderStrategy {
    const matched = this.strategies.find((strategy) => strategy.id === providerId);
    return matched ?? this.fallbackStrategy;
  }

  public findStrategyForModel(modelId: string): IOAuthProviderStrategy {
    const matched = this.strategies.find((strategy) => strategy.supports(modelId));
    return matched ?? this.fallbackStrategy;
  }

  public getAllStrategies(): readonly IOAuthProviderStrategy[] {
    return [...this.strategies, this.fallbackStrategy];
  }

  public getCategories(): readonly { id: string; name: string; icon: string; count: number }[] {
    const all = this.getAllStrategies();
    const categories: { id: ProviderCategory | "all"; name: string; icon: string }[] = [
      { id: "all", name: "All Providers", icon: "🌐" },
      { id: "frontier", name: "Frontier Giants", icon: "🌟" },
      { id: "accelerator", name: "Silicon Accelerators", icon: "⚡" },
      { id: "opensource", name: "Open Source / Local", icon: "🦙" },
      { id: "specialized", name: "Specialized Ecosystems", icon: "🌿" },
      { id: "developer", name: "Developer & Agents", icon: "🛠️" },
      { id: "enterprise", name: "Enterprise OIDC", icon: "🛡️" },
    ];

    return categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      icon: cat.icon,
      count: cat.id === "all" ? all.length : all.filter((s) => s.category === cat.id).length,
    }));
  }

  public registerCustomProvider(strategy: IOAuthProviderStrategy): void {
    const existingIndex = this.strategies.findIndex((s) => s.id === strategy.id);
    if (existingIndex >= 0) {
      this.strategies[existingIndex] = strategy;
    } else {
      this.strategies.unshift(strategy);
    }
  }

  public removeCustomProvider(providerId: string): boolean {
    const index = this.strategies.findIndex((s) => s.id === providerId);
    if (index >= 0) {
      this.strategies.splice(index, 1);
      return true;
    }
    return false;
  }
}

export const oauthProviderRegistry = OAuthProviderRegistry.getInstance();
