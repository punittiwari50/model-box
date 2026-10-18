import { describe, it } from "node:test";
import assert from "node:assert";
import {
  VirtualThreadExecutor,
  StructuredTaskScope,
  ShutdownOnFailureScope,
  ShutdownOnSuccessScope,
  virtualThreadExecutor,
} from "@/core/concurrency/index.js";

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

describe("Virtual Threads & Structured Concurrency Engine (JDK 25 Loom Analogue)", () => {
  it("should run lightweight virtual threads with context propagation and return typed results", async () => {
    const executor = new VirtualThreadExecutor({ maxConcurrency: 10 });
    const taskCount = 20;

    const tasks = Array.from({ length: taskCount }, (_, i) =>
      executor.execute(async () => {
        await delay(10);
        return `task-result-${i}`;
      }),
    );

    const results = await Promise.all(tasks);
    assert.strictEqual(results.length, taskCount);
    assert.strictEqual(results[0], "task-result-0");
    assert.strictEqual(results[19], "task-result-19");
  });

  it("ShutdownOnFailureScope: should complete all subtasks when all succeed", async () => {
    const scope = StructuredTaskScope.open<number>("shutdown-on-failure");

    const subtask1 = scope.fork(async (signal) => {
      await delay(15, signal);
      return 10;
    });

    const subtask2 = scope.fork(async (signal) => {
      await delay(20, signal);
      return 20;
    });

    const subtask3 = scope.fork(async (signal) => {
      await delay(10, signal);
      return 30;
    });

    await scope.join();
    scope.throwIfFailed();

    assert.strictEqual(subtask1.get(), 10);
    assert.strictEqual(subtask2.get(), 20);
    assert.strictEqual(subtask3.get(), 30);
    assert.deepStrictEqual(scope.results(), [10, 20, 30]);

    scope.close();
  });

  it("ShutdownOnFailureScope: should fail fast and cancel remaining subtasks on failure", async () => {
    const scope = new ShutdownOnFailureScope<string>();

    scope.fork(async () => {
      await delay(10);
      throw new Error("Simulated Loom Task Failure");
    });

    let slowTaskCompleted = false;
    scope.fork(async (signal) => {
      await delay(100, signal);
      if (!signal.aborted) {
        slowTaskCompleted = true;
      }
      return "slow-task";
    });

    await scope.join();

    assert.throws(
      () => scope.throwIfFailed(),
      /Simulated Loom Task Failure/,
      "throwIfFailed must throw the first occurring error",
    );
    assert.strictEqual(
      slowTaskCompleted,
      false,
      "Slow subtask should be cancelled upon failure",
    );

    scope.close();
  });

  it("ShutdownOnSuccessScope: should complete on first success and cancel siblings", async () => {
    const scope = new ShutdownOnSuccessScope<string>();

    scope.fork(async () => {
      await delay(15);
      return "fast-winner";
    });

    let slowTaskCompleted = false;
    scope.fork(async (signal) => {
      await delay(150, signal);
      if (!signal.aborted) {
        slowTaskCompleted = true;
      }
      return "slow-loser";
    });

    await scope.join();

    const winner = scope.result();
    assert.strictEqual(winner, "fast-winner");
    assert.strictEqual(slowTaskCompleted, false);

    scope.close();
  });

  it("should support singleton virtualThreadExecutor instance", async () => {
    const res = await virtualThreadExecutor.execute(async () => {
      return 42;
    });
    assert.strictEqual(res, 42);
  });
});
