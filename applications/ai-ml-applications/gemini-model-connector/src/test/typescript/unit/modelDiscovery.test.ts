import { describe, it } from "node:test";
import assert from "node:assert";
import {
  modelDiscoveryService,
  ModelDiscoveryService,
  OllamaModelDiscoveryStrategy,
  GeminiModelDiscoveryStrategy,
  CopilotModelDiscoveryStrategy,
} from "@/services/model/modelDiscoveryService.js";
import {
  ModelFamily,
  SubscriptionTierConstant,
  ModelDiscoverySource,
} from "@/domain/constants/index.js";

describe("Dynamic Model Discovery Service (Live CLI & API Integration)", () => {
  it("should discover models dynamically from registered live providers", async () => {
    const models = await modelDiscoveryService.listAvailableModels(true);
    assert.ok(Array.isArray(models));
    assert.ok(models.length > 0);

    // Verify Ollama freeware model exists
    const ollamaModel = models.find((m) => m.family === ModelFamily.OLLAMA);
    assert.ok(ollamaModel);
    assert.strictEqual(ollamaModel.tier, SubscriptionTierConstant.FREEWARE);
    assert.ok(
      ollamaModel.source === ModelDiscoverySource.API ||
        ollamaModel.source === ModelDiscoverySource.CLI,
    );

    // Verify Gemini paid model exists
    const geminiModel = models.find((m) => m.family === ModelFamily.GEMINI);
    assert.ok(geminiModel);
    assert.strictEqual(geminiModel.tier, SubscriptionTierConstant.PAID);

    // Verify Copilot paid model exists
    const copilotModel = models.find((m) => m.family === ModelFamily.COPILOT);
    assert.ok(copilotModel);
    assert.strictEqual(copilotModel.tier, SubscriptionTierConstant.PAID);
  });

  it("should retrieve a specific model by name from discovered models", async () => {
    const model = await modelDiscoveryService.getModel("tinyllama");
    assert.ok(model);
    assert.strictEqual(model?.family, ModelFamily.OLLAMA);
    assert.strictEqual(model?.tier, SubscriptionTierConstant.FREEWARE);
  });

  it("should support custom discovery strategy registration and execution", async () => {
    const service = new ModelDiscoveryService();
    service.registerStrategy({
      family: "custom-provider",
      discover: async () => [
        {
          name: "custom-model-v1",
          family: "custom-provider",
          tier: SubscriptionTierConstant.FREEWARE,
          source: ModelDiscoverySource.API,
          status: "available",
          discovered_at: new Date().toISOString(),
        },
      ],
    });

    const models = await service.listAvailableModels(true);
    const custom = models.find((m) => m.name === "custom-model-v1");
    assert.ok(custom);
    assert.strictEqual(custom?.family, "custom-provider");
  });

  it("should respect TTL caching when forceRefresh is false", async () => {
    let callCount = 0;
    const service = new ModelDiscoveryService();
    service.registerStrategy({
      family: "mock",
      discover: async () => {
        callCount++;
        return [
          {
            name: "mock-model",
            family: "mock",
            tier: SubscriptionTierConstant.PAID,
            source: ModelDiscoverySource.CLI,
            status: "available",
            discovered_at: new Date().toISOString(),
          },
        ];
      },
    });

    await service.listAvailableModels(false);
    assert.strictEqual(callCount, 1);

    // Second call without forceRefresh should use cache
    await service.listAvailableModels(false);
    assert.strictEqual(callCount, 1);

    // Third call with forceRefresh should query live provider again
    await service.listAvailableModels(true);
    assert.strictEqual(callCount, 2);
  });
});
