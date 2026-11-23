import { describe, it } from "node:test";
import assert from "node:assert";
import {
  subscriptionManager,
  SubscriptionManager,
  PaidFirstSubscriptionStrategy,
  FreeFirstSubscriptionStrategy,
  PaidOnlySubscriptionStrategy,
  FreeOnlySubscriptionStrategy,
} from "@/core/subscription/subscriptionManager.js";
import {
  SubscriptionTierConstant,
  SubscriptionPolicyConstant,
  ModelCatalog,
} from "@/domain/constants/index.js";

describe("Multi-Subscription Tier Combination & Governance Architecture", () => {
  it("should evaluate PaidFirst strategy: stay on paid tier when authenticated and below threshold", () => {
    const decision = subscriptionManager.evaluateRouting(
      ModelCatalog.GEMINI_3_8_FLASH,
      true, // isAuthenticated
      25, // tokenConsumedPercentage (below 90%)
      false, // circuitBreakerOpen
    );

    assert.strictEqual(decision.targetModel, ModelCatalog.GEMINI_3_8_FLASH);
    assert.strictEqual(decision.executedTier, SubscriptionTierConstant.PAID);
    assert.strictEqual(decision.initialTier, SubscriptionTierConstant.PAID);
    assert.strictEqual(decision.isFallback, false);
    assert.strictEqual(decision.switchedTier, false);
    assert.strictEqual(decision.policy, SubscriptionPolicyConstant.PAID_FIRST);
  });

  it("should evaluate PaidFirst strategy: switch to freeware tier when unauthenticated", () => {
    const decision = subscriptionManager.evaluateRouting(
      ModelCatalog.COPILOT,
      false, // unauthenticated
      0,
      false,
    );

    assert.strictEqual(decision.targetModel, "tinyllama");
    assert.strictEqual(
      decision.executedTier,
      SubscriptionTierConstant.FREEWARE,
    );
    assert.strictEqual(decision.initialTier, SubscriptionTierConstant.PAID);
    assert.strictEqual(decision.isFallback, true);
    assert.strictEqual(decision.switchedTier, true);
    assert.ok(decision.reason?.includes("unauthenticated"));
  });

  it("should evaluate PaidFirst strategy: switch to freeware tier when token consumption exceeds threshold", () => {
    const decision = subscriptionManager.evaluateRouting(
      ModelCatalog.GEMINI_3_8_FLASH,
      true,
      92, // Exceeds 90% threshold
      false,
    );

    assert.strictEqual(decision.targetModel, "tinyllama");
    assert.strictEqual(
      decision.executedTier,
      SubscriptionTierConstant.FREEWARE,
    );
    assert.strictEqual(decision.isFallback, true);
    assert.strictEqual(decision.switchedTier, true);
    assert.ok(decision.reason?.includes("tokens consumed"));
  });

  it("should evaluate PaidFirst strategy: switch to freeware tier when circuit breaker is open", () => {
    const decision = subscriptionManager.evaluateRouting(
      ModelCatalog.GEMINI_3_8_FLASH,
      true,
      10,
      true, // Circuit breaker open
    );

    assert.strictEqual(decision.targetModel, "tinyllama");
    assert.strictEqual(
      decision.executedTier,
      SubscriptionTierConstant.FREEWARE,
    );
    assert.strictEqual(decision.isFallback, true);
    assert.strictEqual(decision.switchedTier, true);
    assert.ok(decision.reason?.includes("circuit breaker is open"));
  });

  it("should evaluate PaidFirst strategy: stay on freeware without fallback when freeware is explicitly requested", () => {
    const decision = subscriptionManager.evaluateRouting(
      ModelCatalog.TINYLLAMA,
      false,
      0,
      false,
    );

    assert.strictEqual(decision.targetModel, ModelCatalog.TINYLLAMA);
    assert.strictEqual(
      decision.executedTier,
      SubscriptionTierConstant.FREEWARE,
    );
    assert.strictEqual(decision.initialTier, SubscriptionTierConstant.FREEWARE);
    assert.strictEqual(decision.isFallback, false);
    assert.strictEqual(decision.switchedTier, false);
  });

  it("should support FreeFirst, PaidOnly, and FreeOnly subscription policies", () => {
    const mgr = new SubscriptionManager();

    // Free-first
    mgr.setPolicy(SubscriptionPolicyConstant.FREE_FIRST);
    assert.strictEqual(mgr.getPolicy(), SubscriptionPolicyConstant.FREE_FIRST);
    const freeFirstDecision = mgr.evaluateRouting(
      ModelCatalog.GEMINI_3_8_FLASH,
      true,
    );
    assert.strictEqual(
      freeFirstDecision.executedTier,
      SubscriptionTierConstant.FREEWARE,
    );

    // Paid-only
    mgr.setPolicy(SubscriptionPolicyConstant.PAID_ONLY);
    const paidOnlyDecision = mgr.evaluateRouting(
      ModelCatalog.GEMINI_3_8_FLASH,
      true,
    );
    assert.strictEqual(
      paidOnlyDecision.executedTier,
      SubscriptionTierConstant.PAID,
    );

    // Free-only
    mgr.setPolicy(SubscriptionPolicyConstant.FREE_ONLY);
    const freeOnlyDecision = mgr.evaluateRouting(
      ModelCatalog.GEMINI_3_8_FLASH,
      true,
    );
    assert.strictEqual(
      freeOnlyDecision.executedTier,
      SubscriptionTierConstant.FREEWARE,
    );
  });
});
