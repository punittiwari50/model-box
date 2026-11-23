import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TokenCompactor } from "@/resilience/TokenCompactor.js";
import type { MessageEntity } from "@/entities/message.entity.js";

describe("TokenCompactor AST & Dialog History Pruning Tests", () => {
  it("estimates token count proportionally to character length", () => {
    assert.strictEqual(TokenCompactor.estimateTokens(""), 0);
    assert.strictEqual(TokenCompactor.estimateTokens("abcd"), 1);
    assert.strictEqual(TokenCompactor.estimateTokens("abcdefghij"), 3);
  });

  it("prunes null, undefined and empty string fields losslessly", () => {
    const rawAst = {
      header: "Resume Data",
      redundantNull: null,
      redundantEmpty: "",
      redundantUndefined: undefined,
      nestedSection: {
        skills: ["TypeScript", "Python"],
        emptyField: null,
      },
    };

    const result = TokenCompactor.pruneAstLossless(rawAst);
    assert.strictEqual(result.compactedAst.header, "Resume Data");
    assert.strictEqual("redundantNull" in result.compactedAst, false);
    assert.strictEqual("redundantEmpty" in result.compactedAst, false);
    const nested = result.compactedAst.nestedSection as Record<string, unknown>;
    assert.strictEqual("emptyField" in nested, false);
    assert.deepStrictEqual(nested.skills, ["TypeScript", "Python"]);
    assert.strictEqual(result.compactedBytes < result.originalBytes, true);
  });

  it("compacts dialog history while retaining system prompt", () => {
    const messages: MessageEntity[] = [
      {
        MESSAGE_ID: "MSG-01",
        SESSION_ID: "SESS-01",
        MESSAGE_ROLE: "system",
        MESSAGE_CONTENT: "You are an AI assistant",
        STRATEGY_MODE: "api",
        TOKEN_COUNT: 10,
        LATENCY_MS: 0,
        CREATED_TIMESTAMP: new Date().toISOString(),
      },
      {
        MESSAGE_ID: "MSG-02",
        SESSION_ID: "SESS-01",
        MESSAGE_ROLE: "user",
        MESSAGE_CONTENT: "Long user turn 1 with lots of data",
        STRATEGY_MODE: "api",
        TOKEN_COUNT: 50,
        LATENCY_MS: 100,
        CREATED_TIMESTAMP: new Date().toISOString(),
      },
      {
        MESSAGE_ID: "MSG-03",
        SESSION_ID: "SESS-01",
        MESSAGE_ROLE: "user",
        MESSAGE_CONTENT: "Recent user turn 2",
        STRATEGY_MODE: "api",
        TOKEN_COUNT: 20,
        LATENCY_MS: 50,
        CREATED_TIMESTAMP: new Date().toISOString(),
      },
    ];

    // Budget of 35 allows system (10) + MSG-03 (20) = 30, but drops MSG-02 (50)
    const result = TokenCompactor.compactDialogHistory(messages, 35);
    assert.strictEqual(result.prunedTurnsCount, 1);
    assert.strictEqual(result.messages.length, 2);
    assert.strictEqual(result.messages[0].MESSAGE_ROLE, "system");
    assert.strictEqual(result.messages[1].MESSAGE_ID, "MSG-03");
  });
});
