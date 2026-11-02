import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  OllamaModelDiscoveryCacheService,
  type IOllamaTagsTransport,
} from "@/domain/providers/OllamaModelDiscoveryCacheService.js";
import { ModelProviderConfigService } from "@/domain/providers/modelProviderConfig.js";
import { environment } from "@/config/environment/StandardEnvironment.js";
import {
  DistributedProviderModelCacheRegistry,
  DatabaseTieredModelCacheStore,
  type IModelProviderDiscoveryStrategy,
  type ProviderDiscoveryDescriptor,
} from "@/cache/DistributedModelDiscoveryCache.js";
import { ProviderOAuthClientRepository } from "@/database/ProviderOAuthClientRepository.js";
import { CoreDatabaseConnectionManager } from "@/database/CoreDatabaseEngine.js";

class StubOllamaTagsTransport implements IOllamaTagsTransport {
  public callCount = 0;
  public lastRequestedUrls: string[] = [];

  constructor(private readonly mockModels: readonly string[]) {}

  public async fetchModelNames(endpointUrl: string): Promise<readonly string[]> {
    this.callCount += 1;
    this.lastRequestedUrls.push(endpointUrl);
    return this.mockModels;
  }
}

class StubProviderDiscoveryStrategy implements IModelProviderDiscoveryStrategy {
  public callCount = 0;
  constructor(
    public readonly providerId: string,
    private readonly mockModels: readonly string[],
  ) {}

  public async discoverAvailableModels(
    _descriptor: ProviderDiscoveryDescriptor,
  ): Promise<readonly string[]> {
    this.callCount += 1;
    return this.mockModels;
  }
}

describe("OllamaModelDiscoveryCacheService & DistributedProviderModelCacheRegistry (24h Cache & Multi-Client OAuth DB)", () => {
  it("fetches available Ollama models from application.yml URL and caches them for 24 hours (86,400,000 ms)", async () => {
    let fakeNow = 1_700_000_000_000;
    const transport = new StubOllamaTagsTransport([
      "lfm3-omni:latest",
      "llama3.2:latest",
      "qwen2.5-coder:7b",
    ]);

    const cacheService = new OllamaModelDiscoveryCacheService(environment, transport, () => fakeNow);

    const firstFetch = await cacheService.getAvailableModels();
    assert.equal(transport.callCount, 1);
    assert.ok(transport.lastRequestedUrls[0]?.endsWith("/api/tags"));
    assert.ok(firstFetch.includes("lfm3-omni:latest"));
    assert.equal(cacheService.isOllamaModel("lfm3-omni:latest"), true);
    assert.equal(cacheService.isOllamaModel("qwen2.5-coder:7b"), true);

    const metadata = cacheService.getCacheMetadata();
    assert.equal(metadata.ttlMs, 86_400_000);
    assert.equal(metadata.isValid, true);

    fakeNow += 23 * 60 * 60 * 1000 + 59 * 60 * 1000;
    await cacheService.getAvailableModels();
    assert.equal(transport.callCount, 1, "Must serve from 24h cache without re-fetching before 24 hours");

    fakeNow += 2 * 60 * 1000;
    assert.equal(cacheService.getCacheMetadata().isValid, false);

    await cacheService.getAvailableModels();
    assert.equal(transport.callCount, 2, "Must re-fetch from Ollama URL after 24-hour cache TTL expires");
  });

  it("caches available models across multiple providers and applications in L1 + L2 Flyway DB for 24 hours", async () => {
    const dbManager = new CoreDatabaseConnectionManager(":memory:");
    let fakeNow = 1_710_000_000_000;

    const googleStrategy = new StubProviderDiscoveryStrategy("google", [
      "gemini-3.8-flash",
      "gemini-3.5-flash",
    ]);
    const openaiStrategy = new StubProviderDiscoveryStrategy("openai", ["gpt-4o", "o3-mini"]);
    const store = new DatabaseTieredModelCacheStore(dbManager);
    const registry = new DistributedProviderModelCacheRegistry(
      environment,
      store,
      () => fakeNow,
      [googleStrategy, openaiStrategy],
    );

    const googleDescriptor: ProviderDiscoveryDescriptor = {
      providerId: "google",
      baseUrl: "https://generativelanguage.googleapis.com",
      apiVersion: "v1beta",
      seedKeywords: ["gemini-3.8-flash"],
    };

    const googleModels = await registry.getAvailableModels(googleDescriptor);
    assert.deepEqual(googleModels, ["gemini-3.8-flash", "gemini-3.5-flash"]);
    assert.equal(googleStrategy.callCount, 1);

    // Within 24h TTL -> served from cache without calling strategy again
    fakeNow += 12 * 60 * 60 * 1000;
    await registry.getAvailableModels(googleDescriptor);
    assert.equal(googleStrategy.callCount, 1);

    // Past 24h TTL -> re-discovers
    fakeNow += 13 * 60 * 60 * 1000;
    await registry.getAvailableModels(googleDescriptor);
    assert.equal(googleStrategy.callCount, 2);
  });

  it("resolves multiple OAuth clientId and clientSecret entries per provider and model via database (Req 7)", () => {
    const dbManager = new CoreDatabaseConnectionManager(":memory:");
    const oauthRepo = new ProviderOAuthClientRepository(dbManager);
    const googleDefaultClientId = `oauth-ref-${Date.now()}-google-default`;
    const googleDefaultClientSecret = `secret-ref-${Date.now()}-google-default`;
    const googleModelClientId = `oauth-ref-${Date.now()}-google-model`;
    const googleModelClientSecret = `secret-ref-${Date.now()}-google-model`;
    const githubClientId = `oauth-ref-${Date.now()}-github-default`;
    const githubClientSecret = `secret-ref-${Date.now()}-github-default`;

    oauthRepo.upsertClient({
      providerId: "google",
      modelId: "*",
      clientAlias: "Google Default OAuth Client",
      clientId: googleDefaultClientId,
      clientSecret: googleDefaultClientSecret,
      isDefault: true,
    });
    oauthRepo.upsertClient({
      providerId: "google",
      modelId: "gemini-3.8-flash",
      clientAlias: "Gemini 3.8 Dedicated OAuth Client",
      clientId: googleModelClientId,
      clientSecret: googleModelClientSecret,
      isDefault: false,
    });
    oauthRepo.upsertClient({
      providerId: "github",
      modelId: "*",
      clientAlias: "GitHub Copilot Enterprise Client",
      clientId: githubClientId,
      clientSecret: githubClientSecret,
      isDefault: true,
    });

    const service = new ModelProviderConfigService(
      environment,
      undefined,
      undefined,
      undefined,
      oauthRepo,
    );

    const googleDefault = service.getProviderConfig("google", "gemini-3.5-flash");
    assert.equal(googleDefault.clientId, googleDefaultClientId);
    assert.equal(googleDefault.clientSecret, googleDefaultClientSecret);

    const googleModelSpecific = service.getProviderConfig("google", "gemini-3.8-flash");
    assert.equal(googleModelSpecific.clientId, googleModelClientId);
    assert.equal(googleModelSpecific.clientSecret, googleModelClientSecret);

    const githubConfig = service.getProviderConfig("github");
    assert.equal(githubConfig.clientId, githubClientId);
    assert.equal(githubConfig.clientSecret, githubClientSecret);
  });

  it("does not leak oauthClientId across providers when resolving from MODEL_ACCOUNTS fallback", () => {
    const dbManager = new CoreDatabaseConnectionManager(":memory:");
    const db = dbManager.getDatabase();
    const ollamaClientRef = `oauth-ref-${Date.now()}-ollama`;
    db.prepare(
      `INSERT INTO MODEL_ACCOUNTS (
        ACCOUNT_ID, MODEL_ID, ACCOUNT_NAME, USER_EMAIL, AUTH_TYPE, CREDENTIAL_VALUE, IS_ACTIVE, CONFIG_JSON
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "acct-ollama-1",
      "lfm3-omni",
      "Ollama OAuth Account",
      "ollama.operator@model-connector.local",
      "cli_oauth",
      "oat_ollama_token",
      1,
      JSON.stringify({
        provider: "ollama",
        oauthClientId: ollamaClientRef,
      }),
    );

    const oauthRepo = new ProviderOAuthClientRepository(dbManager);
    const service = new ModelProviderConfigService(
      environment,
      undefined,
      undefined,
      undefined,
      oauthRepo,
    );

    const googleConfig = service.getProviderConfig("google", "gemini-3.8-flash");
    assert.equal(googleConfig.clientId, "");

    const ollamaConfig = service.getProviderConfig("ollama", "lfm3-omni");
    assert.equal(ollamaConfig.clientId, ollamaClientRef);
  });

  it("loads all provider URLs and CLI/API defaults from application.yml via ModelProviderConfigService", () => {
    const service = new ModelProviderConfigService(environment);

    const googleDefaults = service.resolveCliApiDefaults("gemini-3.8-flash");
    assert.equal(googleDefaults.executable, "gemini");
    assert.equal(googleDefaults.apiBaseUrl, "https://generativelanguage.googleapis.com");
    assert.equal(googleDefaults.apiVersion, "v1beta");

    const copilotDefaults = service.resolveCliApiDefaults("copilot-gpt-4o");
    assert.equal(copilotDefaults.executable, "github-copilot-cli");
    assert.equal(copilotDefaults.apiBaseUrl, "https://api.githubcopilot.com");
    assert.equal(copilotDefaults.apiVersion, "v1");

    const claudeDefaults = service.resolveCliApiDefaults("claude-3-7-sonnet");
    assert.equal(claudeDefaults.executable, "claude");
    assert.equal(claudeDefaults.apiBaseUrl, "https://api.anthropic.com");
    assert.equal(claudeDefaults.apiVersion, "v1");

    const ollamaDefaults = service.resolveCliApiDefaults("lfm3-omni");
    assert.equal(ollamaDefaults.executable, "ollama");
    assert.equal(ollamaDefaults.apiBaseUrl, "http://localhost:11435");
    assert.equal(ollamaDefaults.apiVersion, "v1");

    assert.equal(service.getPlatformUrl("uiBaseUrl"), "http://localhost:3005");
    assert.equal(service.getPlatformUrl("oauthCallbackUrl"), "http://localhost:8085/oauth2callback");
    assert.equal(service.getPlatformUrl("ollamaOAuthBaseUrl"), "http://localhost:11436");
  });
});
