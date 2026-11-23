import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ModelConnectorClient } from "@/client/ModelConnectorClient.js";
import { ExecutionStrategyType } from "@/domain/constants/index.js";

describe("ModelConnectorClient Chat & Grounding Tests (UC-15)", () => {
  it("executes chat with Google Search AI Grounding enabled", async () => {
    const client = new ModelConnectorClient();
    const response = await client.executeChat({
      modelId: "gemini-3.8-flash",
      prompt: "Latest multi-agent orchestration patterns 2026",
      strategy: ExecutionStrategyType.API,
      enableSearchGrounding: true,
    });

    assert.strictEqual(response.modelId, "gemini-3.8-flash");
    assert.strictEqual(response.strategyUsed, ExecutionStrategyType.API);
    assert.ok(response.citations !== undefined);
    assert.ok(response.citations.length > 0);
    assert.ok(response.searchQueriesUsed !== undefined);
    assert.ok(response.searchQueriesUsed.length > 0);
    assert.ok(response.latencyMs >= 0);
  });

  it("executes chat stream with real-time token accumulation", async () => {
    const client = new ModelConnectorClient();
    const chunks: string[] = [];

    const response = await client.executeChatStream(
      {
        modelId: "gemini-3.8-flash",
        prompt: "Summarize distributed tracing",
        strategy: ExecutionStrategyType.API,
      },
      (chunk) => {
        chunks.push(chunk.delta);
      },
    );

    assert.ok(chunks.length > 0);
    assert.strictEqual(response.finishReason, "COMPLETE");
    assert.ok(response.content.length > 0);
  });

  it("supports OAuth strategy dispatch through executeChat", async () => {
    const client = new ModelConnectorClient();
    const response = await client.executeChat({
      modelId: "gemini-3.8-flash",
      prompt: "Execute with OAuth",
      strategy: ExecutionStrategyType.OAUTH,
    });

    assert.strictEqual(response.strategyUsed, ExecutionStrategyType.OAUTH);
    assert.ok(response.content.includes("OAuth 2.0"));
  });
});
