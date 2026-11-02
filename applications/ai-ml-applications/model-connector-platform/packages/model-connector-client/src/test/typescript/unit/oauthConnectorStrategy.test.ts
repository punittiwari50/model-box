import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OAuthConnectorStrategy } from "@/strategies/oauth/OAuthConnectorStrategy.js";
import { ExecutionStrategyType } from "@/domain/constants/index.js";

describe("OAuthConnectorStrategy Tests (UC-15 §4.1 / §4.3)", () => {
  it("executes chat requests using OAuth 2.0 Bearer tokens", async () => {
    const strategy = new OAuthConnectorStrategy();
    const res = await strategy.execute({
      prompt: "Execute OAuth inference",
      model: "gemini-3.8-flash",
      strategy: ExecutionStrategyType.OAUTH,
      sessionId: "tenant-session-123",
    });

    assert.strictEqual(res.strategyUsed, ExecutionStrategyType.OAUTH);
    assert.ok(res.content.includes("OAuth 2.0"));
    assert.strictEqual(res.model, "gemini-3.8-flash");
    assert.ok(res.tokenMetrics.totalTokens > 0);
  });

  it("caches and reuses active OAuth tokens before TTL expiry", async () => {
    const strategy = new OAuthConnectorStrategy();
    const token1 = await strategy.resolveOrRefreshToken("tenant-A");
    const token2 = await strategy.resolveOrRefreshToken("tenant-A");

    assert.strictEqual(token1.accessToken, token2.accessToken);
    assert.strictEqual(token1.tokenType, "Bearer");
  });
});
