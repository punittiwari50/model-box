import { describe, it } from "node:test";
import assert from "node:assert";
import { RequestDeduplicator } from "@/core/resilience/requestDeduplicator.js";

describe("RequestDeduplicator (User Partitioning & Memory Leak Prevention)", () => {
  it("should isolate responses between User A and User B for identical prompts", async () => {
    const dedup = new RequestDeduplicator({ windowMs: 1000 });
    const payload = { prompt: "Hello AI", model: "gemini-3.8-flash" };

    const keyUserA = dedup.generateKey("gemini", payload, "user-A");
    const keyUserB = dedup.generateKey("gemini", payload, "user-B");

    assert.notStrictEqual(
      keyUserA,
      keyUserB,
      "Keys for distinct users must never collide",
    );
    assert.match(keyUserA, /user:user-A:/);
    assert.match(keyUserB, /user:user-B:/);

    let userACalls = 0;
    let userBCalls = 0;

    const [resA, resB] = await Promise.all([
      dedup.execute(keyUserA, async () => {
        userACalls++;
        return { user: "A", data: "Response for user A" };
      }),
      dedup.execute(keyUserB, async () => {
        userBCalls++;
        return { user: "B", data: "Response for user B" };
      }),
    ]);

    assert.strictEqual(resA.user, "A");
    assert.strictEqual(resB.user, "B");
    assert.strictEqual(userACalls, 1);
    assert.strictEqual(userBCalls, 1);
  });

  it("should coalesce concurrent duplicate requests from the same user", async () => {
    const dedup = new RequestDeduplicator({ windowMs: 1000 });
    const payload = { prompt: "Repeat task" };
    const key = dedup.generateKey("gemini", payload, "user-A");

    let taskExecutions = 0;
    const task = async () => {
      taskExecutions++;
      await new Promise((r) => setTimeout(r, 50));
      return { answer: 42 };
    };

    const [res1, res2, res3] = await Promise.all([
      dedup.execute(key, task),
      dedup.execute(key, task),
      dedup.execute(key, task),
    ]);

    assert.strictEqual(
      taskExecutions,
      1,
      "Task should only execute once for coalesced concurrent calls",
    );
    assert.strictEqual(res1.answer, 42);
    assert.strictEqual(res2.answer, 42);
    assert.strictEqual(res3.answer, 42);
  });

  it("should enforce bounded cache size and evict oldest entries without memory leak", async () => {
    const maxEntries = 5;
    const dedup = new RequestDeduplicator({
      windowMs: 5000,
      maxRecentEntries: maxEntries,
    });

    for (let i = 0; i < 15; i++) {
      const key = dedup.generateKey("test", { id: i }, "user-A");
      await dedup.execute(key, async () => `result-${i}`);
    }

    assert.ok(
      dedup.getRecentCount() <= maxEntries,
      `Recent results cache size (${dedup.getRecentCount()}) must not exceed maxRecentEntries (${maxEntries})`,
    );
  });
});
