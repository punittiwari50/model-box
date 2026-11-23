import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { processUtils } from "@/utils/process/processUtils.js";
import { ArgParser } from "@/utils/args/argParser.js";
import { CryptoUtils, randomUUID } from "@/utils/crypto/cryptoUtils.js";
import { timerUtils } from "@/utils/timer/timerUtils.js";
import { pathUtils } from "@/utils/file/pathUtils.js";
import { delay, AsyncSemaphore } from "@/utils/concurrency/concurrencyUtils.js";

describe("Utils Package Encapsulation Tests", () => {
  it("verifies processUtils encapsulates process correctly", () => {
    assert.strictEqual(typeof processUtils.pid, "number");
    assert.strictEqual(typeof processUtils.platform, "string");
    assert.strictEqual(typeof processUtils.cwd(), "string");
    assert.strictEqual(Array.isArray(processUtils.argv), true);
  });

  it("parses CLI arguments accurately with ArgParser", () => {
    const parsed = ArgParser.parse(["--port=9090", "--verbose", "-d", "input.txt"]);
    assert.strictEqual(parsed.flags["port"], "9090");
    assert.strictEqual(parsed.flags["verbose"], true);
    assert.strictEqual(parsed.flags["d"], true);
    assert.deepStrictEqual(parsed.positional, ["input.txt"]);
  });

  it("masks secrets, generates UUIDs, and computes hash with CryptoUtils", () => {
    const masked = CryptoUtils.maskSecret("abcdef1234567890xyz", 3);
    assert.strictEqual(masked, "abc...xyz");
    const hash = CryptoUtils.sha256("test-payload");
    assert.strictEqual(typeof hash, "string");
    assert.strictEqual(hash.length, 64);
    const uuid = randomUUID();
    assert.strictEqual(typeof uuid, "string");
    assert.strictEqual(uuid.length, 36);
  });

  it("measures performance with timerUtils", async () => {
    const now = timerUtils.now();
    assert.strictEqual(typeof now, "number");
    const { result, durationMs } = await timerUtils.measure(async () => {
      await delay(5);
      return 42;
    });
    assert.strictEqual(result, 42);
    assert.strictEqual(durationMs >= 0, true);
  });

  it("resolves paths accurately with pathUtils", () => {
    const joined = pathUtils.join("foo", "bar", "baz.txt");
    assert.strictEqual(typeof joined, "string");
    assert.strictEqual(pathUtils.basename("foo/bar/baz.txt"), "baz.txt");
    assert.strictEqual(pathUtils.extname("baz.txt"), ".txt");
  });

  it("enforces concurrency limits with AsyncSemaphore", async () => {
    const sem = new AsyncSemaphore(2);
    let currentConcurrent = 0;
    let maxObserved = 0;

    const worker = async () => {
      const release = await sem.acquire();
      currentConcurrent++;
      maxObserved = Math.max(maxObserved, currentConcurrent);
      await delay(10);
      currentConcurrent--;
      release();
    };

    await Promise.all([worker(), worker(), worker(), worker()]);
    assert.strictEqual(maxObserved <= 2, true);
  });
});
