import { describe, it } from "node:test";
import assert from "node:assert";
import { RequestDeduplicator } from "@/core/resilience/requestDeduplicator.js";

describe("Concurrent User Isolation & Anti-Collision Test", () => {
  it("should guarantee 100 concurrent requests across distinct users never cross-deliver responses", async () => {
    const dedup = new RequestDeduplicator({ windowMs: 2000, maxPending: 200 });
    const userCount = 10;
    const requestsPerUser = 10;
    const commonPrompt =
      "Identical shared prompt text for all concurrent users";

    interface UserResult {
      userId: string;
      responsePayload: string;
      uniqueUserSecret: string;
    }

    const tasks: Promise<UserResult>[] = [];

    for (let u = 1; u <= userCount; u++) {
      const userId = `user-${u}`;
      const uniqueSecret = `SECRET-FOR-${userId}-${Math.random().toString(36).slice(2)}`;

      for (let r = 1; r <= requestsPerUser; r++) {
        const key = dedup.generateKey(
          "model",
          { prompt: commonPrompt },
          userId,
        );

        const taskPromise = dedup.execute(key, async () => {
          // Simulate network/model inference latency
          await new Promise((resolve) =>
            setTimeout(resolve, 20 + Math.random() * 30),
          );
          return {
            userId,
            responsePayload: `Result computed strictly for ${userId}`,
            uniqueUserSecret: uniqueSecret,
          };
        });

        tasks.push(taskPromise);
      }
    }

    const allResults = await Promise.all(tasks);
    assert.strictEqual(allResults.length, userCount * requestsPerUser);

    // Verify strict isolation: every single result returned MUST match its requested userId and secret
    for (const result of allResults) {
      assert.ok(result.userId.startsWith("user-"));
      assert.strictEqual(
        result.responsePayload,
        `Result computed strictly for ${result.userId}`,
        `Response payload leaked across users! Expected for ${result.userId} but got ${result.responsePayload}`,
      );
      assert.ok(
        result.uniqueUserSecret.includes(`SECRET-FOR-${result.userId}`),
        `User secret leaked across distinct users!`,
      );
    }
  });
});
