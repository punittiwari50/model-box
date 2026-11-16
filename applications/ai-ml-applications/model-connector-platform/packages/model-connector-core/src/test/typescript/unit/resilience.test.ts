import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CircuitBreaker, CircuitBreakerOpenException } from "@/resilience/circuitBreaker.js";
import { RetryPolicy } from "@/resilience/retryPolicy.js";
import { RateLimiter, RateLimiterExceededException } from "@/resilience/rateLimiter.js";
import { Bulkhead } from "@/resilience/bulkhead.js";

describe("Resilience4j Patterns Tests", () => {
  it("trips CircuitBreaker open on consecutive failures", async () => {
    const cb = new CircuitBreaker("test-cb", {
      minimumNumberOfCalls: 2,
      slidingWindowSize: 2,
      failureRateThreshold: 50,
      waitDurationInOpenStateMs: 500,
    });

    try {
      await cb.execute(async () => { throw new Error("fail 1"); });
    } catch {}
    try {
      await cb.execute(async () => { throw new Error("fail 2"); });
    } catch {}

    assert.strictEqual(cb.isOpen(), true);
    await assert.rejects(
      async () => cb.execute(async () => "ok"),
      CircuitBreakerOpenException
    );
  });

  it("retries failed actions up to max attempts with RetryPolicy", async () => {
    const retry = new RetryPolicy({ maxAttempts: 3, initialBackoffMs: 10 });
    let attempts = 0;

    const result = await retry.execute(async (attempt) => {
      attempts = attempt;
      if (attempt < 3) throw new Error("transient");
      return "success";
    });

    assert.strictEqual(attempts, 3);
    assert.strictEqual(result, "success");
  });

  it("enforces rate limits with RateLimiter", () => {
    const limiter = new RateLimiter("test-limiter", 2, 0);
    assert.strictEqual(limiter.tryAcquire(), true);
    assert.strictEqual(limiter.tryAcquire(), true);
    assert.strictEqual(limiter.tryAcquire(), false);
    assert.throws(() => limiter.acquire(), RateLimiterExceededException);
  });

  it("limits concurrent calls with Bulkhead", async () => {
    const bulkhead = new Bulkhead("test-bulkhead", 1);
    const p1 = bulkhead.execute(async () => "job1");
    const res = await p1;
    assert.strictEqual(res, "job1");
    assert.strictEqual(bulkhead.availableSlots, 1);
  });
});
