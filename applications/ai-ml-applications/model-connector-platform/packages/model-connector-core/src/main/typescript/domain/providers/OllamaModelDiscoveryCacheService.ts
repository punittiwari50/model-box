import type { Environment } from "@/config/environment/Environment.js";
import { environment as defaultEnvironment } from "@/config/environment/StandardEnvironment.js";

export interface OllamaCacheMetadata {
  readonly cachedAt: number;
  readonly expiresAt: number;
  readonly ttlMs: number;
  readonly isValid: boolean;
  readonly models: readonly string[];
  readonly familyKeywords: readonly string[];
}

export interface IOllamaTagsTransport {
  fetchModelNames(endpointUrl: string): Promise<readonly string[]>;
}

export interface IOllamaModelDiscoveryCache {
  isCacheValid(): boolean;
  isOllamaModel(modelId: string): boolean;
  getCachedModels(): readonly string[];
  getCachedFamilyKeywords(): readonly string[];
  getAvailableModels(forceRefresh?: boolean): Promise<readonly string[]>;
  getCacheMetadata(): OllamaCacheMetadata;
  invalidateCache(): void;
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export class HttpOllamaTagsTransport implements IOllamaTagsTransport {
  public async fetchModelNames(endpointUrl: string): Promise<readonly string[]> {
    const response = await fetch(endpointUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) {
      throw new Error(`Ollama tags endpoint returned HTTP ${response.status}`);
    }
    const payload = (await response.json()) as { models?: Array<{ name?: string; model?: string }> };
    const rawList = Array.isArray(payload.models) ? payload.models : [];
    return Object.freeze(
      rawList
        .map((entry) => (entry.name || entry.model || "").trim())
        .filter(Boolean),
    );
  }
}

/**
 * 24-Hour TTL Cache & Discovery Service for Local Ollama Models.
 * Dynamically queries the Ollama URL configured in application.yml (/api/tags),
 * caches discovered models and family prefixes for 24 hours (86,400,000 ms),
 * and provides polymorphic model matching across Core, Client, Service, and UI.
 */
export class OllamaModelDiscoveryCacheService implements IOllamaModelDiscoveryCache {
  private cachedModels: readonly string[] = Object.freeze([]);
  private cachedKeywords: readonly string[];
  private cachedAt = 0;
  private refreshInFlight: Promise<readonly string[]> | null = null;

  constructor(
    private readonly env: Environment = defaultEnvironment,
    private readonly transport: IOllamaTagsTransport = new HttpOllamaTagsTransport(),
    private readonly clock: () => number = () => Date.now(),
  ) {
    this.cachedKeywords = this.loadSeedKeywordsFromYaml();
  }

  public getTtlMs(): number {
    return this.env.getPropertyAsNumber("providers.ollama.cacheTtlMs", TWENTY_FOUR_HOURS_MS);
  }

  public isCacheValid(): boolean {
    if (this.cachedAt <= 0) return false;
    return this.clock() - this.cachedAt < this.getTtlMs();
  }

  public isOllamaModel(modelId: string): boolean {
    if (!this.isCacheValid()) {
      void this.triggerBackgroundRefresh();
    }
    const normalized = modelId.toLowerCase().trim();
    return this.getCachedFamilyKeywords().some((kw) => normalized.includes(kw));
  }

  public getCachedModels(): readonly string[] {
    if (!this.isCacheValid()) {
      void this.triggerBackgroundRefresh();
    }
    return this.cachedModels;
  }

  public getCachedFamilyKeywords(): readonly string[] {
    if (!this.isCacheValid()) {
      return this.loadSeedKeywordsFromYaml();
    }
    return this.cachedKeywords;
  }

  public async getAvailableModels(forceRefresh = false): Promise<readonly string[]> {
    if (!forceRefresh && this.isCacheValid()) {
      return this.cachedModels;
    }
    return this.refreshFromEndpoints();
  }

  public getCacheMetadata(): OllamaCacheMetadata {
    const ttlMs = this.getTtlMs();
    return Object.freeze({
      cachedAt: this.cachedAt,
      expiresAt: this.cachedAt > 0 ? this.cachedAt + ttlMs : 0,
      ttlMs,
      isValid: this.isCacheValid(),
      models: this.cachedModels,
      familyKeywords: this.getCachedFamilyKeywords(),
    });
  }

  public invalidateCache(): void {
    this.cachedAt = 0;
    this.cachedModels = Object.freeze([]);
    this.cachedKeywords = this.loadSeedKeywordsFromYaml();
  }

  private triggerBackgroundRefresh(): Promise<readonly string[]> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.refreshFromEndpoints().finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  private async refreshFromEndpoints(): Promise<readonly string[]> {
    const endpoints = this.resolveCandidateTagsEndpoints();
    for (const url of endpoints) {
      try {
        const discovered = await this.transport.fetchModelNames(url);
        this.updateCacheState(discovered);
        return this.cachedModels;
      } catch {
        // Try next configured endpoint from application.yml
      }
    }
    this.updateCacheState([]);
    return this.cachedModels;
  }

  private updateCacheState(discoveredModels: readonly string[]): void {
    const seedKeywords = this.loadSeedKeywordsFromYaml();
    const extracted = this.extractKeywordsFromModels(discoveredModels);
    const mergedKeywords = Array.from(new Set([...extracted, ...seedKeywords]));
    this.cachedModels = Object.freeze([...discoveredModels]);
    this.cachedKeywords = Object.freeze(mergedKeywords);
    this.cachedAt = this.clock();
  }

  private extractKeywordsFromModels(models: readonly string[]): readonly string[] {
    const result: string[] = [];
    for (const rawModel of models) {
      const clean = rawModel.toLowerCase().split(":")[0].trim();
      if (clean) {
        result.push(clean);
        const familyPrefix = clean.split("-")[0];
        if (familyPrefix) result.push(familyPrefix);
      }
    }
    return result;
  }

  private resolveCandidateTagsEndpoints(): readonly string[] {
    const primaryBase = this.env.getProperty("providers.ollama.baseUrl", "http://localhost:11435");
    const fallbackCsv = this.env.getProperty("providers.ollama.fallbackBaseUrls", "");
    const tagsPath = this.env.getProperty("providers.ollama.tagsPath", "/api/tags");
    const bases = [primaryBase, ...fallbackCsv.split(",").map((s) => s.trim())].filter(Boolean);
    const uniqueBases = Array.from(new Set(bases));
    return Object.freeze(uniqueBases.map((base) => `${base.replace(/\/$/, "")}${tagsPath}`));
  }

  private loadSeedKeywordsFromYaml(): readonly string[] {
    const raw = this.env.getProperty(
      "providers.ollama.modelKeywords",
      "ollama,llama,lfm3,qwen,phi,gemma,minicpm,nemotron",
    );
    return Object.freeze(
      raw
        .split(",")
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean),
    );
  }
}

export const ollamaModelDiscoveryCache: IOllamaModelDiscoveryCache =
  new OllamaModelDiscoveryCacheService();
