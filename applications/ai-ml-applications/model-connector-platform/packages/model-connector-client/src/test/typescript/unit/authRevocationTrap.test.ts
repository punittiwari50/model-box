import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AuthRevocationTrap } from "@/security/AuthRevocationTrap.js";
import { ExecutionStrategyType } from "@/domain/constants/index.js";

describe("AuthRevocationTrap Tests (UC-15 §8)", () => {
  it("identifies HTTP 401, 403, and token expiration as auth errors", () => {
    assert.strictEqual(AuthRevocationTrap.isAuthError(new Error("HTTP 401 Unauthorized")), true);
    assert.strictEqual(AuthRevocationTrap.isAuthError(new Error("HTTP 403 Forbidden")), true);
    assert.strictEqual(AuthRevocationTrap.isAuthError(new Error("session expired")), true);
    assert.strictEqual(AuthRevocationTrap.isAuthError(new Error("500 Internal Server Error")), false);
  });

  it("cascades from Cookie strategy to API strategy on auth revocation", () => {
    const resolution = AuthRevocationTrap.interceptError(
      new Error("401 Unauthorized: Cookie session expired"),
      {
        tenantId: "TENANT-1",
        correlationId: "CORR-01",
        modelId: "gemini-3.8-flash",
        currentStrategy: ExecutionStrategyType.COOKIE,
        stepIndex: 2,
      },
    );

    assert.strictEqual(resolution.isAuthRevocation, true);
    assert.strictEqual(resolution.shouldRetry, true);
    assert.strictEqual(resolution.fallbackStrategy, ExecutionStrategyType.API);
    assert.strictEqual(resolution.paused, false);
  });

  it("pauses cleanly and preserves state when all online strategies are exhausted", () => {
    const resolution = AuthRevocationTrap.interceptError(
      new Error("403 Forbidden: CLI token revoked"),
      {
        tenantId: "TENANT-1",
        correlationId: "CORR-02",
        modelId: "gemini-3.8-flash",
        currentStrategy: ExecutionStrategyType.CLI,
        stepIndex: 4,
      },
    );

    assert.strictEqual(resolution.isAuthRevocation, true);
    assert.strictEqual(resolution.shouldRetry, false);
    assert.strictEqual(resolution.paused, true);
    assert.ok(resolution.reason.includes("step 4"));
  });
});
