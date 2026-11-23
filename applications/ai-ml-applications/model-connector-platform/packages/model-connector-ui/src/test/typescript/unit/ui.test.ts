import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  modelFilterStrategy,
  CategoryMetricsCalculator,
  TimeComparisonFormatter,
  CategoryMapper,
} from "@/utils";
import { OllamaUiModelCacheService, ProviderCatalogStore } from "@/utils/services/ollamaUiModelCache";
import { OAuthProviderRegistry } from "@/utils/services/oauthProviderRegistry";
import type { UiModel, UiAuditRecord, UiSession, UiCategory } from "@/types/ui.types";

describe("ModelConnector UI OOP Utilities Unit Tests", () => {
  const sampleModels: readonly UiModel[] = [
    {
      id: "gemini-3.8-flash",
      name: "Gemini 3.8 Flash",
      family: "gemini",
      tier: "free",
      description: "Google multimodal model",
      supportedStrategies: ["api", "cli"],
      enabled: true,
      contextLength: 1048576,
    },
    {
      id: "gpt-4o",
      name: "ChatGPT 4o",
      family: "openai",
      tier: "pro",
      description: "Flagship intelligence",
      supportedStrategies: ["api", "cookie"],
      enabled: true,
      contextLength: 128000,
    },
    {
      id: "llama3.2:latest",
      name: "Llama 3.2 Local",
      family: "ollama",
      tier: "local",
      description: "Lightweight fallback",
      supportedStrategies: ["cli", "api"],
      enabled: true,
      contextLength: 8192,
    },
  ];

  it("ModelFilterStrategy - filters by search query and family aliases", () => {
    // 1. Search by name
    const searchResult = modelFilterStrategy.filter(sampleModels, { searchQuery: "flash" });
    assert.strictEqual(searchResult.length, 1);
    assert.strictEqual(searchResult[0].id, "gemini-3.8-flash");

    // 2. Filter by family
    const geminiResult = modelFilterStrategy.filter(sampleModels, { family: "gemini" });
    assert.strictEqual(geminiResult.length, 1);

    // 3. Filter by alias: 'chatgpt' matches model with family 'openai'
    const chatGptAliasResult = modelFilterStrategy.filter(sampleModels, { family: "chatgpt" });
    assert.strictEqual(chatGptAliasResult.length, 1);
    assert.strictEqual(chatGptAliasResult[0].id, "gpt-4o");

    // 4. Filter by 'all' matches all
    const allResult = modelFilterStrategy.filter(sampleModels, { family: "all" });
    assert.strictEqual(allResult.length, 3);
  });

  it("CategoryMetricsCalculator - calculates token consumption and aggregates category stats", () => {
    const mockSessions: readonly UiSession[] = [
      {
        sessionId: "sess-1",
        title: "Test Session",
        model: "gemini-3.8-flash",
        strategy: "api",
        turnCount: 5,
        createdTimestamp: new Date().toISOString(),
        lastActiveAt: new Date(Date.now() - 30000).toISOString(), // 30s ago
      },
    ];

    const mockLogs: readonly UiAuditRecord[] = [
      {
        id: "log-1",
        action: "INFERENCE",
        modelUsed: "gemini-3.8-flash",
        strategy: "api",
        status: "SUCCESS",
        latencyMs: 120,
        timestamp: new Date().toISOString(),
      },
    ];

    const stats = CategoryMetricsCalculator.calculateStats(
      [sampleModels[0]],
      mockLogs,
      mockSessions,
    );

    assert.strictEqual(stats.modelCount, 1);
    assert.strictEqual(stats.lastUsed, "Just now");
    // totalTurns (5) * 6 + logCount (1) * 4 + baseline (12) = 30 + 4 + 12 = 46%
    assert.strictEqual(stats.tokenConsumptionPct, 46);
  });

  it("TimeComparisonFormatter - calculates relative time diff correctly", () => {
    const now = Date.now();
    assert.strictEqual(TimeComparisonFormatter.formatRelative(null, "Never"), "Never");
    assert.strictEqual(TimeComparisonFormatter.formatRelative(now - 10000), "Just now");
    assert.strictEqual(TimeComparisonFormatter.formatRelative(now - 300000), "5m ago");
  });

  it("CategoryMapper - builds category metadata map and handles aliases", () => {
    const categories: readonly UiCategory[] = [
      {
        categoryId: "gemini",
        label: "Google Gemini",
        icon: "✦",
        accentColor: "#4285f4",
        description: "Google multimodal models",
        sortOrder: 1,
      },
      {
        categoryId: "chatgpt",
        label: "OpenAI ChatGPT",
        icon: "🤖",
        accentColor: "#10a37f",
        description: "OpenAI models",
        sortOrder: 2,
      },
    ];

    const metaMap = CategoryMapper.buildMetadataMap(categories);
    assert.ok(metaMap.gemini, "gemini category mapped");
    assert.ok(metaMap.chatgpt, "chatgpt category mapped");
    // verifies openai alias points to chatgpt
    assert.strictEqual(metaMap.openai?.label, "OpenAI ChatGPT");

    const filterList = CategoryMapper.extractFilterList(categories);
    assert.ok(filterList.includes("all"));
    assert.ok(filterList.includes("gemini"));
    assert.ok(filterList.includes("chatgpt"));
  });

  it("OllamaUiModelCacheService & OAuthProviderRegistry - caches Ollama models for 24h and resolves CLI/API defaults via Strategy Pattern", () => {
    let fakeNow = 1_700_000_000_000;
    const uiCache = new OllamaUiModelCacheService(() => fakeNow);
    const catalogStore = new ProviderCatalogStore();
    const registry = new OAuthProviderRegistry(undefined, catalogStore, uiCache);

    uiCache.updateCache(["lfm3-omni:latest", "customlocal:7b"], ["ollama", "lfm3", "customlocal"]);
    assert.strictEqual(uiCache.isCacheValid(), true);
    assert.strictEqual(uiCache.isOllamaModel("customlocal:7b"), true);

    const ollamaStrategy = registry.findStrategyForModel("lfm3-omni");
    assert.strictEqual(ollamaStrategy.id, "ollama");
    const ollamaDefaults = ollamaStrategy.resolveCliDefaults("lfm3-omni");
    assert.strictEqual(ollamaDefaults.executable, "ollama");
    assert.strictEqual(ollamaDefaults.args, "run lfm3-omni");
    assert.strictEqual(ollamaDefaults.apiBaseUrl, "http://localhost:11435");

    const copilotDefaults = registry.findStrategyForModel("copilot-gpt-4o").resolveCliDefaults("copilot-gpt-4o");
    assert.strictEqual(copilotDefaults.executable, "github-copilot-cli");
    assert.strictEqual(copilotDefaults.apiBaseUrl, "https://api.githubcopilot.com");

    const googleAuthUrl = registry.getStrategy("google").buildAuthorizationUrl({
      clientId: "",
      redirectUri: "http://localhost:8085/oauth2callback",
      modelId: "gemini-3.8-flash",
    });
    assert.strictEqual(googleAuthUrl, "");

    // Advance past 24 hours (86,400,001 ms)
    fakeNow += 24 * 60 * 60 * 1000 + 1;
    assert.strictEqual(uiCache.isCacheValid(), false);
  });
});
