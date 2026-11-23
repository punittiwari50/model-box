import {
  CENTRALIZED_PROVIDER_CATALOG,
  DEFAULT_OLLAMA_MODEL_FAMILIES,
  DEFAULT_PLATFORM_URLS,
  OLLAMA_CACHE_STORAGE_KEY,
  OLLAMA_CACHE_TTL_MS,
  type PlatformUrlConfig,
  type ProviderEndpointConfig,
} from "@/constants/providerConfigConstants";

export interface OllamaUiCacheSnapshot {
  readonly models: readonly string[];
  readonly families: readonly string[];
  readonly cachedAtTimestamp: number;
  readonly expiresAtTimestamp: number;
  readonly ttlMs: number;
}

export interface IOllamaUiModelCache {
  isOllamaModel(modelId: string): boolean;
  getCachedModels(): readonly string[];
  getCachedFamilies(): readonly string[];
  updateCache(models: readonly string[], families?: readonly string[], cachedAt?: number): OllamaUiCacheSnapshot;
  isCacheValid(): boolean;
  invalidate(): void;
}

/**
 * 24-Hour Ollama Model Discovery Cache for the UI layer.
 * Stores discovered Ollama models and family keywords with a strict 24-hour TTL (86,400,000 ms).
 */
export class OllamaUiModelCacheService implements IOllamaUiModelCache {
  private snapshot: OllamaUiCacheSnapshot | null = null;

  constructor(private readonly clock: () => number = () => Date.now()) {
    this.hydrateFromStorage();
  }

  public isCacheValid(): boolean {
    if (!this.snapshot) {
      return false;
    }
    return this.clock() - this.snapshot.cachedAtTimestamp < OLLAMA_CACHE_TTL_MS;
  }

  public getCachedModels(): readonly string[] {
    if (this.isCacheValid() && this.snapshot) {
      return this.snapshot.models;
    }
    return DEFAULT_OLLAMA_MODEL_FAMILIES;
  }

  public getCachedFamilies(): readonly string[] {
    if (this.isCacheValid() && this.snapshot) {
      return this.snapshot.families;
    }
    return DEFAULT_OLLAMA_MODEL_FAMILIES;
  }

  public isOllamaModel(modelId: string): boolean {
    const normalized = modelId.toLowerCase().trim();
    if (!normalized) {
      return false;
    }
    const models = this.getCachedModels();
    if (models.some((m) => m.toLowerCase() === normalized)) {
      return true;
    }
    return this.getCachedFamilies().some((kw) => normalized.includes(kw.toLowerCase()));
  }

  public updateCache(
    models: readonly string[],
    families: readonly string[] = DEFAULT_OLLAMA_MODEL_FAMILIES,
    cachedAt?: number,
  ): OllamaUiCacheSnapshot {
    const now = cachedAt && cachedAt > 0 ? cachedAt : this.clock();
    const mergedFamilies = Array.from(
      new Set([
        ...DEFAULT_OLLAMA_MODEL_FAMILIES,
        ...families.map((f) => f.toLowerCase().trim()),
        ...models.map((m) => m.toLowerCase().split(":")[0].split("-")[0].trim()),
      ]),
    ).filter(Boolean);

    const nextSnapshot: OllamaUiCacheSnapshot = Object.freeze({
      models: Object.freeze([...models]),
      families: Object.freeze(mergedFamilies),
      cachedAtTimestamp: now,
      expiresAtTimestamp: now + OLLAMA_CACHE_TTL_MS,
      ttlMs: OLLAMA_CACHE_TTL_MS,
    });
    this.snapshot = nextSnapshot;
    this.persistToStorage(nextSnapshot);
    return nextSnapshot;
  }

  public invalidate(): void {
    this.snapshot = null;
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(OLLAMA_CACHE_STORAGE_KEY);
      }
    } catch {
      // Ignore storage access errors in headless/SSR contexts
    }
  }

  private hydrateFromStorage(): void {
    try {
      if (typeof window === "undefined" || !window.localStorage) {
        return;
      }
      const raw = window.localStorage.getItem(OLLAMA_CACHE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as OllamaUiCacheSnapshot;
      if (parsed && this.clock() - parsed.cachedAtTimestamp < OLLAMA_CACHE_TTL_MS) {
        this.snapshot = Object.freeze({
          models: Object.freeze(parsed.models || []),
          families: Object.freeze(parsed.families || DEFAULT_OLLAMA_MODEL_FAMILIES),
          cachedAtTimestamp: parsed.cachedAtTimestamp,
          expiresAtTimestamp: parsed.expiresAtTimestamp,
          ttlMs: OLLAMA_CACHE_TTL_MS,
        });
      }
    } catch {
      // Ignore corrupted local storage
    }
  }

  private persistToStorage(snapshot: OllamaUiCacheSnapshot): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(OLLAMA_CACHE_STORAGE_KEY, JSON.stringify(snapshot));
      }
    } catch {
      // Ignore storage quota errors
    }
  }
}

export class ProviderCatalogStore {
  private platformUrls: PlatformUrlConfig = DEFAULT_PLATFORM_URLS;
  private readonly providers = new Map<string, ProviderEndpointConfig>(
    Object.entries(CENTRALIZED_PROVIDER_CATALOG),
  );

  public getPlatformUrls(): PlatformUrlConfig {
    return this.platformUrls;
  }

  public getProviderConfig(providerId: string): ProviderEndpointConfig {
    const key = providerId.toLowerCase().trim();
    return this.providers.get(key) ?? CENTRALIZED_PROVIDER_CATALOG.custom;
  }

  public applyBackendCatalog(payload: {
    platformUrls?: Partial<PlatformUrlConfig>;
    providers?: readonly Partial<ProviderEndpointConfig>[];
  }): void {
    if (payload.platformUrls) {
      this.platformUrls = Object.freeze({
        ...this.platformUrls,
        ...payload.platformUrls,
      });
    }
    if (!payload.providers) return;
    for (const remote of payload.providers) {
      if (!remote.providerId) continue;
      const key = remote.providerId.toLowerCase();
      const existing = this.providers.get(key) ?? CENTRALIZED_PROVIDER_CATALOG.custom;
      this.providers.set(key, this.mergeProviderConfig(existing, remote));
    }
  }

  private mergeProviderConfig(
    existing: ProviderEndpointConfig,
    remote: Partial<ProviderEndpointConfig>,
  ): ProviderEndpointConfig {
    const scopes = Array.isArray(remote.defaultScopes)
      ? remote.defaultScopes.join(" ")
      : remote.defaultScopes || existing.defaultScopes;
    return Object.freeze({
      ...existing,
      name: remote.name || existing.name,
      icon: remote.icon || existing.icon,
      brandColor: remote.brandColor || existing.brandColor,
      category: remote.category || existing.category,
      accountCategory: remote.accountCategory || existing.accountCategory,
      baseUrl: remote.baseUrl || existing.baseUrl,
      apiVersion: remote.apiVersion || existing.apiVersion,
      cliExecutable: remote.cliExecutable || existing.cliExecutable,
      cliArgsTemplate: remote.cliArgsTemplate || existing.cliArgsTemplate,
      cliCommand: remote.cliCommand || existing.cliCommand,
      authEndpoint: remote.authEndpoint || existing.authEndpoint,
      tokenEndpoint: remote.tokenEndpoint || existing.tokenEndpoint,
      defaultRedirectUri: remote.defaultRedirectUri || existing.defaultRedirectUri,
      defaultScopes: scopes,
      defaultClientId: remote.defaultClientId ?? existing.defaultClientId,
      docsUrl: remote.docsUrl || existing.docsUrl,
      description: remote.description || existing.description,
      modelKeywords: remote.modelKeywords?.length ? remote.modelKeywords : existing.modelKeywords,
    });
  }
}

export const ollamaUiModelCache = new OllamaUiModelCacheService();
export const providerCatalogStore = new ProviderCatalogStore();
