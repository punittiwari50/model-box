import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GoogleSearchAiGroundingEngine,
  type IGoogleSearchProvider,
} from "@/grounding/GoogleSearchAiGroundingEngine.js";
import { GroundingStatus } from "@/domain/constants/index.js";

describe("GoogleSearchAiGroundingEngine Tests (UC-15)", () => {
  it("decomposes prompt into clean search query phrases", async () => {
    const engine = new GoogleSearchAiGroundingEngine();
    const queries = await engine.decomposePrompt("What are the 2026 AI model benchmark records?!");
    assert.strictEqual(queries.length, 1);
    assert.strictEqual(queries[0], "What are the 2026 AI model benchmark records");
  });

  it("grounds prompt with citations and structured source evidence", async () => {
    const mockProvider: IGoogleSearchProvider = {
      async search(query: string) {
        return [
          {
            title: `Article about ${query}`,
            url: "https://example.com/article",
            domain: "example.com",
            snippet: "Groundbreaking benchmark achieved in 2026",
          },
        ];
      },
    };

    const engine = new GoogleSearchAiGroundingEngine(mockProvider);
    const result = await engine.groundPrompt("2026 AI model", "The model scores high.");

    assert.strictEqual(result.groundingStatus, GroundingStatus.GROUNDED);
    assert.strictEqual(result.citations.length, 1);
    assert.strictEqual(result.citations[0].url, "https://example.com/article");
    assert.strictEqual(result.citations[0].domain, "example.com");
    assert.strictEqual(result.citations[0].confidenceScore >= 0.75, true);
  });

  it("falls back to parametric memory when search provider exceeds SLA timeout", async () => {
    const slowProvider: IGoogleSearchProvider = {
      async search() {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return [];
      },
    };

    // Watchdog set to 50ms (well under 200ms)
    const engine = new GoogleSearchAiGroundingEngine(slowProvider, 50);
    const result = await engine.groundPrompt("slow query", "Model parametric response.");

    assert.strictEqual(result.groundingStatus, GroundingStatus.FALLBACK_PARAMETRIC);
    assert.strictEqual(result.citations.length, 0);
    assert.strictEqual(result.content, "Model parametric response.");
  });
});
