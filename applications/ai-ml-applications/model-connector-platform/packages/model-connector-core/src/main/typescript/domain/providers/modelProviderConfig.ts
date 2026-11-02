import type { Environment } from "@/config/environment/Environment.js";
import { environment as defaultEnvironment } from "@/config/environment/StandardEnvironment.js";
import {
  ollamaModelDiscoveryCache,
  type IOllamaModelDiscoveryCache,
} from "@/domain/providers/OllamaModelDiscoveryCacheService.js";
import {
  distributedProviderModelCache,
  type IDistributedProviderModelCacheRegistry,
  type ProviderDiscoveryDescriptor,
  type ProviderModelCacheEntry,
} from "@/cache/DistributedModelDiscoveryCache.js";
import {
  providerOAuthClientRepository,
  type IProviderOAuthClientRepository,
} from "@/database/ProviderOAuthClientRepository.js";

export interface ProviderCliApiDefaults {
  readonly executable: string;
  readonly args: string;
  readonly apiBaseUrl: string;
  readonly apiVersion: string;
}

/**
 * Enterprise Model Provider Configuration loaded from application.yml + Database OAuth Client Registry.
 * Conforms to:
 * - STD-COD-002: Zero magic literals, centralized configuration
 * - STD-COD-005: Open/Closed Principle, Strategy Pattern & Dependency Injection
 * - STD-COD-007.5: Immutability by Default
 */
export interface IModelProviderConfig {
  readonly providerId: string;
  readonly name: string;
  readonly icon: string;
  readonly authType: "oauth" | "api_key" | "none";
  readonly baseUrl: string;
  readonly oauthBaseUrl?: string;
  readonly apiVersion: string;
  readonly cliExecutable: string;
  readonly cliArgsTemplate: string;
  readonly authEndpoint: string;
  readonly tokenEndpoint: string;
  readonly userinfoEndpoint: string;
  readonly tokeninfoEndpoint: string;
  readonly messagesEndpoint?: string;
  readonly chatCompletionsEndpoint?: string;
  readonly anthropicVersionHeader?: string;
  readonly cliCommand: string;
  readonly defaultRedirectUri: string;
  readonly defaultScopes: readonly string[];
  readonly clientId: string;
  readonly clientSecret: string;
  readonly apiHeader: string;
  readonly apiHeaderPrefix: string;
  readonly docsUrl: string;
  readonly modelKeywords: readonly string[];
  readonly fallbackBaseUrls?: readonly string[];
  readonly tagsPath?: string;
  readonly generatePath?: string;
  readonly cacheTtlMs?: number;
}

export type PlatformUrlKey =
  | "uiBaseUrl"
  | "serviceBaseUrl"
  | "oauthCallbackUrl"
  | "oauthAuthorizeChooserUrl"
  | "ollamaOAuthBaseUrl";

export interface IProviderConfigRegistry {
  getProviderConfig(providerId: string, modelId?: string): IModelProviderConfig;
  getAllProviderConfigs(): readonly IModelProviderConfig[];
  resolveProviderForModel(modelId: string): IModelProviderConfig;
  resolveCliApiDefaults(modelId: string): ProviderCliApiDefaults;
  getPlatformUrl(key: PlatformUrlKey): string;
  getProviderModels(providerId: string, forceRefresh?: boolean, credential?: string): Promise<readonly string[]>;
  getAllProvidersCacheMetadata(): Readonly<Record<string, ProviderModelCacheEntry>>;
}

export interface IModelFamilyMatcher {
  readonly providerId: string;
  matches(normalizedModelId: string): boolean;
}

export class KeywordModelFamilyMatcher implements IModelFamilyMatcher {
  constructor(
    public readonly providerId: string,
    private readonly keywordsResolver: () => readonly string[],
  ) {}

  public matches(normalizedModelId: string): boolean {
    return this.keywordsResolver().some((kw) => normalizedModelId.includes(kw));
  }
}

export class DistributedCachedProviderMatcher implements IModelFamilyMatcher {
  constructor(
    public readonly providerId: string,
    private readonly descriptorResolver: () => ProviderDiscoveryDescriptor,
    private readonly cacheRegistry: IDistributedProviderModelCacheRegistry,
  ) {}

  public matches(normalizedModelId: string): boolean {
    return this.cacheRegistry.matchesProvider(this.descriptorResolver(), normalizedModelId);
  }
}

export class OllamaDynamicModelFamilyMatcher implements IModelFamilyMatcher {
  public readonly providerId = "ollama";

  constructor(private readonly ollamaCache: IOllamaModelDiscoveryCache) {}

  public matches(normalizedModelId: string): boolean {
    return this.ollamaCache.isOllamaModel(normalizedModelId);
  }
}

const KNOWN_PROVIDER_IDS = Object.freeze([
  "github",
  "google",
  "anthropic",
  "openai",
  "xai",
  "ollama",
  "azure",
  "bedrock",
  "groq",
  "mistral",
  "deepseek",
  "together",
  "cerebras",
  "fireworks",
  "sambanova",
  "huggingface",
  "cohere",
  "perplexity",
  "custom",
]);

/**
 * Dynamic Provider Configuration Service.
 * Injected with Spring-style Environment, 24h Distributed Model Cache Registry,
 * and Database OAuth Client Repository (supporting multiple Client IDs & Secrets per provider).
 */
export class ModelProviderConfigService implements IProviderConfigRegistry {
  private readonly configCache = new Map<string, IModelProviderConfig>();
  private readonly matchers: readonly IModelFamilyMatcher[];

  constructor(
    private readonly env: Environment = defaultEnvironment,
    private readonly ollamaCache: IOllamaModelDiscoveryCache = ollamaModelDiscoveryCache,
    customMatchers?: readonly IModelFamilyMatcher[],
    private readonly distributedCache: IDistributedProviderModelCacheRegistry = distributedProviderModelCache,
    private readonly oauthClientRepo: IProviderOAuthClientRepository = providerOAuthClientRepository,
  ) {
    this.loadFromEnvironment();
    this.matchers = customMatchers ?? this.buildDefaultMatchers();
  }

  private buildDefaultMatchers(): readonly IModelFamilyMatcher[] {
    const providerMatchers = KNOWN_PROVIDER_IDS.filter((id) => id !== "custom" && id !== "ollama").map(
      (id) =>
        new DistributedCachedProviderMatcher(
          id,
          () => this.toDiscoveryDescriptor(this.getProviderConfig(id)),
          this.distributedCache,
        ),
    );
    return Object.freeze([
      ...providerMatchers.slice(0, 5),
      new OllamaDynamicModelFamilyMatcher(this.ollamaCache),
      ...providerMatchers.slice(5),
    ]);
  }

  private toDiscoveryDescriptor(cfg: IModelProviderConfig): ProviderDiscoveryDescriptor {
    return Object.freeze({
      providerId: cfg.providerId,
      baseUrl: cfg.baseUrl,
      fallbackBaseUrls: cfg.fallbackBaseUrls,
      apiVersion: cfg.apiVersion,
      tagsPath: cfg.tagsPath,
      tokeninfoEndpoint: cfg.tokeninfoEndpoint,
      apiHeader: cfg.apiHeader,
      apiHeaderPrefix: cfg.apiHeaderPrefix,
      anthropicVersionHeader: cfg.anthropicVersionHeader,
      seedKeywords: cfg.modelKeywords,
    });
  }

  private loadFromEnvironment(): void {
    for (const providerId of KNOWN_PROVIDER_IDS) {
      this.configCache.set(providerId, this.parseProviderFromEnv(providerId));
    }
  }

  private parseProviderFromEnv(providerId: string): IModelProviderConfig {
    const prefix = `providers.${providerId}`;
    const authTypeRaw = this.env.getProperty(`${prefix}.authType`, "oauth");
    const authType = authTypeRaw === "api_key" || authTypeRaw === "none" ? authTypeRaw : "oauth";
    const scopesRaw = this.env.getProperty(`${prefix}.defaultScopes`, "");
    const keywordsRaw = this.env.getProperty(`${prefix}.modelKeywords`, providerId);
    const fallbackUrlsRaw = this.env.getProperty(`${prefix}.fallbackBaseUrls`, "");

    return Object.freeze({
      providerId,
      name: this.env.getProperty(`${prefix}.name`, providerId.toUpperCase()),
      icon: this.env.getProperty(`${prefix}.icon`, "✨"),
      authType,
      baseUrl: this.env.getProperty(`${prefix}.baseUrl`, ""),
      oauthBaseUrl: this.env.getProperty(`${prefix}.oauthBaseUrl`, "") || undefined,
      apiVersion: this.env.getProperty(`${prefix}.apiVersion`, "v1"),
      cliExecutable: this.env.getProperty(`${prefix}.cliExecutable`, providerId),
      cliArgsTemplate: this.env.getProperty(`${prefix}.cliArgsTemplate`, "--model {model}"),
      authEndpoint: this.env.getProperty(`${prefix}.authEndpoint`, ""),
      tokenEndpoint: this.env.getProperty(`${prefix}.tokenEndpoint`, ""),
      userinfoEndpoint: this.env.getProperty(`${prefix}.userinfoEndpoint`, ""),
      tokeninfoEndpoint: this.env.getProperty(`${prefix}.tokeninfoEndpoint`, ""),
      messagesEndpoint: this.env.getProperty(`${prefix}.messagesEndpoint`, "") || undefined,
      chatCompletionsEndpoint: this.env.getProperty(`${prefix}.chatCompletionsEndpoint`, "") || undefined,
      anthropicVersionHeader: this.env.getProperty(`${prefix}.anthropicVersionHeader`, "") || undefined,
      cliCommand: this.env.getProperty(`${prefix}.cliCommand`, ""),
      defaultRedirectUri: this.env.getProperty(
        `${prefix}.defaultRedirectUri`,
        this.getPlatformUrl("oauthCallbackUrl"),
      ),
      defaultScopes: Object.freeze(scopesRaw.split(" ").filter(Boolean)),
      clientId: "",
      clientSecret: "",
      apiHeader: this.env.getProperty(`${prefix}.apiHeader`, "Authorization"),
      apiHeaderPrefix: this.env.getProperty(`${prefix}.apiHeaderPrefix`, "Bearer"),
      docsUrl: this.env.getProperty(`${prefix}.docsUrl`, ""),
      modelKeywords: Object.freeze(keywordsRaw.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean)),
      fallbackBaseUrls: fallbackUrlsRaw
        ? Object.freeze(fallbackUrlsRaw.split(",").map((u) => u.trim()).filter(Boolean))
        : undefined,
      tagsPath: this.env.getProperty(`${prefix}.tagsPath`, "") || undefined,
      generatePath: this.env.getProperty(`${prefix}.generatePath`, "") || undefined,
      cacheTtlMs: this.env.getPropertyAsNumber(`${prefix}.cacheTtlMs`, 86400000),
    });
  }

  public getPlatformUrl(key: PlatformUrlKey): string {
    const defaults: Readonly<Record<PlatformUrlKey, string>> = {
      uiBaseUrl: "http://localhost:3005",
      serviceBaseUrl: "http://localhost:8095",
      oauthCallbackUrl: "http://localhost:8085/oauth2callback",
      oauthAuthorizeChooserUrl: "http://localhost:8085/oauth2/authorize",
      ollamaOAuthBaseUrl: "http://localhost:11436",
    };
    return this.env.getProperty(`platform.urls.${key}`, defaults[key]);
  }

  public getProviderConfig(providerId: string, modelId?: string): IModelProviderConfig {
    const normalized = providerId.toLowerCase().trim();
    const base = this.configCache.get(normalized) ?? this.createFallbackConfig(normalized);
    const dbClient = this.oauthClientRepo.resolveActiveClient(normalized, modelId);
    if (!dbClient) {
      return base;
    }
    return Object.freeze({
      ...base,
      clientId: dbClient.clientId,
      clientSecret: dbClient.clientSecret,
      defaultRedirectUri: dbClient.redirectUri || base.defaultRedirectUri,
      defaultScopes: dbClient.scopes?.length ? dbClient.scopes : base.defaultScopes,
    });
  }

  public getAllProviderConfigs(): readonly IModelProviderConfig[] {
    return Object.freeze(KNOWN_PROVIDER_IDS.map((id) => this.getProviderConfig(id)));
  }

  public resolveProviderForModel(modelId: string): IModelProviderConfig {
    const normalized = modelId.toLowerCase();
    const matched = this.matchers.find((matcher) => matcher.matches(normalized));
    return this.getProviderConfig(matched ? matched.providerId : "google", modelId);
  }

  public resolveCliApiDefaults(modelId: string): ProviderCliApiDefaults {
    const config = this.resolveProviderForModel(modelId);
    return Object.freeze({
      executable: config.cliExecutable,
      args: config.cliArgsTemplate.replace(/\{model\}/g, modelId),
      apiBaseUrl: config.baseUrl,
      apiVersion: config.apiVersion,
    });
  }

  public async getProviderModels(
    providerId: string,
    forceRefresh = false,
    credential?: string,
  ): Promise<readonly string[]> {
    if (providerId.toLowerCase() === "ollama") {
      return this.ollamaCache.getAvailableModels(forceRefresh);
    }
    const cfg = this.getProviderConfig(providerId);
    return this.distributedCache.getAvailableModels(this.toDiscoveryDescriptor(cfg), forceRefresh, credential);
  }

  public getAllProvidersCacheMetadata(): Readonly<Record<string, ProviderModelCacheEntry>> {
    const result: Record<string, ProviderModelCacheEntry> = {};
    for (const id of KNOWN_PROVIDER_IDS) {
      const cfg = this.getProviderConfig(id);
      if (id === "ollama") {
        const meta = this.ollamaCache.getCacheMetadata();
        result[id] = Object.freeze({
          cacheKey: "provider:models:ollama",
          providerId: "ollama",
          models: meta.models,
          familyKeywords: meta.familyKeywords,
          cachedAt: meta.cachedAt,
          expiresAt: meta.expiresAt,
          ttlMs: meta.ttlMs,
          isValid: meta.isValid,
        });
      } else {
        result[id] = this.distributedCache.getCacheEntry(this.toDiscoveryDescriptor(cfg));
      }
    }
    return Object.freeze(result);
  }

  private createFallbackConfig(providerId: string): IModelProviderConfig {
    return Object.freeze({
      providerId,
      name: `${providerId.charAt(0).toUpperCase()}${providerId.slice(1)}`,
      icon: "🤖",
      authType: "api_key",
      baseUrl: "",
      apiVersion: "v1",
      cliExecutable: providerId,
      cliArgsTemplate: `--model {model}`,
      authEndpoint: "",
      tokenEndpoint: "",
      userinfoEndpoint: "",
      tokeninfoEndpoint: "",
      cliCommand: `${providerId} auth login`,
      defaultRedirectUri: this.getPlatformUrl("oauthCallbackUrl"),
      defaultScopes: Object.freeze([]),
      clientId: "",
      clientSecret: "",
      apiHeader: "Authorization",
      apiHeaderPrefix: "Bearer",
      docsUrl: "",
      modelKeywords: Object.freeze([providerId]),
    });
  }
}

export const modelProviderConfigService: IProviderConfigRegistry = new ModelProviderConfigService();
