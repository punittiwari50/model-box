import {
  SubscriptionTierConstant,
  SubscriptionPolicyConstant,
  isFallbackModel,
} from "@/domain/constants/index.js";
import { config } from "@/core/config/index.js";

/**
 * Context payload for evaluating subscription tier execution.
 */
export interface SubscriptionEvaluationContext {
  readonly requestedModel: string;
  readonly isAuthenticated: boolean;
  readonly tokenConsumedPercentage: number;
  readonly circuitBreakerOpen: boolean;
  readonly fallbackThresholdPercentage: number;
  readonly fallbackModel: string;
}

/**
 * Routing decision produced by subscription evaluation.
 */
export interface SubscriptionRoutingDecision {
  readonly targetModel: string;
  readonly executedTier: (typeof SubscriptionTierConstant)[keyof typeof SubscriptionTierConstant];
  readonly initialTier: (typeof SubscriptionTierConstant)[keyof typeof SubscriptionTierConstant];
  readonly isFallback: boolean;
  readonly switchedTier: boolean;
  readonly accountEmail?: string;
  readonly accountName?: string;
  readonly reason?: string;
  readonly policy: string;
}

/**
 * Strategy interface for multi-subscription tier governance.
 * Conforms to STD-COD-005 (Strategy Pattern) and STD-COD-007.
 */
export interface ISubscriptionPolicyStrategy {
  readonly policyName: string;
  decide(context: SubscriptionEvaluationContext): SubscriptionRoutingDecision;
}

/**
 * Paid-First Subscription Strategy:
 * Initially attempts the paid tier for high quality; seamlessly falls back
 * to the free tier (local Ollama / freeware) if unauthenticated, token exhausted (>=90%),
 * or when the circuit breaker is open.
 */
export class PaidFirstSubscriptionStrategy implements ISubscriptionPolicyStrategy {
  public readonly policyName = SubscriptionPolicyConstant.PAID_FIRST;

  public decide(
    context: SubscriptionEvaluationContext,
  ): SubscriptionRoutingDecision {
    const isModelFreeware = isFallbackModel(context.requestedModel);
    const initialTier = isModelFreeware
      ? SubscriptionTierConstant.FREEWARE
      : SubscriptionTierConstant.PAID;

    if (isModelFreeware) {
      return {
        targetModel: context.requestedModel,
        executedTier: SubscriptionTierConstant.FREEWARE,
        initialTier,
        isFallback: false,
        switchedTier: false,
        policy: this.policyName,
      };
    }

    if (!context.isAuthenticated) {
      return {
        targetModel: context.fallbackModel,
        executedTier: SubscriptionTierConstant.FREEWARE,
        initialTier,
        isFallback: true,
        switchedTier: true,
        reason: `Model '${context.requestedModel}' is unauthenticated. Switched to freeware tier '${context.fallbackModel}'.`,
        policy: this.policyName,
      };
    }

    if (context.circuitBreakerOpen) {
      return {
        targetModel: context.fallbackModel,
        executedTier: SubscriptionTierConstant.FREEWARE,
        initialTier,
        isFallback: true,
        switchedTier: true,
        reason: `Paid tier circuit breaker is open for '${context.requestedModel}'. Switched to freeware tier '${context.fallbackModel}'.`,
        policy: this.policyName,
      };
    }

    if (
      context.tokenConsumedPercentage >= context.fallbackThresholdPercentage
    ) {
      return {
        targetModel: context.fallbackModel,
        executedTier: SubscriptionTierConstant.FREEWARE,
        initialTier,
        isFallback: true,
        switchedTier: true,
        reason: `Paid tier tokens consumed (${context.tokenConsumedPercentage}% >= ${context.fallbackThresholdPercentage}%). Switched to freeware tier '${context.fallbackModel}'.`,
        policy: this.policyName,
      };
    }

    return {
      targetModel: context.requestedModel,
      executedTier: SubscriptionTierConstant.PAID,
      initialTier,
      isFallback: false,
      switchedTier: false,
      policy: this.policyName,
    };
  }
}

/**
 * Free-First Subscription Strategy:
 * Prioritizes local freeware execution and only utilizes paid models if freeware fails.
 */
export class FreeFirstSubscriptionStrategy implements ISubscriptionPolicyStrategy {
  public readonly policyName = SubscriptionPolicyConstant.FREE_FIRST;

  public decide(
    context: SubscriptionEvaluationContext,
  ): SubscriptionRoutingDecision {
    return {
      targetModel: context.fallbackModel,
      executedTier: SubscriptionTierConstant.FREEWARE,
      initialTier: SubscriptionTierConstant.FREEWARE,
      isFallback: false,
      switchedTier: false,
      policy: this.policyName,
    };
  }
}

/**
 * Paid-Only Subscription Strategy:
 * Restricts execution exclusively to paid models without falling back to freeware.
 */
export class PaidOnlySubscriptionStrategy implements ISubscriptionPolicyStrategy {
  public readonly policyName = SubscriptionPolicyConstant.PAID_ONLY;

  public decide(
    context: SubscriptionEvaluationContext,
  ): SubscriptionRoutingDecision {
    return {
      targetModel: context.requestedModel,
      executedTier: SubscriptionTierConstant.PAID,
      initialTier: SubscriptionTierConstant.PAID,
      isFallback: false,
      switchedTier: false,
      policy: this.policyName,
    };
  }
}

/**
 * Free-Only Subscription Strategy:
 * Restricts execution exclusively to freeware local models.
 */
export class FreeOnlySubscriptionStrategy implements ISubscriptionPolicyStrategy {
  public readonly policyName = SubscriptionPolicyConstant.FREE_ONLY;

  public decide(
    context: SubscriptionEvaluationContext,
  ): SubscriptionRoutingDecision {
    return {
      targetModel: context.fallbackModel,
      executedTier: SubscriptionTierConstant.FREEWARE,
      initialTier: SubscriptionTierConstant.FREEWARE,
      isFallback: false,
      switchedTier: false,
      policy: this.policyName,
    };
  }
}

/**
 * Centralized Multi-Subscription Combination Manager.
 * Orchestrates paid-first, free-first, and tier governance across all models.
 * Conforms to:
 * - STD-COD-005: Strategy Pattern & Polymorphic Dispatch
 * - STD-COD-006: Complexity <= 3 per method
 * - STD-COD-007: SLAP & Immutability by Default
 */
export class SubscriptionManager {
  private readonly strategies: Map<string, ISubscriptionPolicyStrategy> =
    new Map();
  private activePolicy: string = SubscriptionPolicyConstant.PAID_FIRST;

  constructor() {
    this.registerStrategy(new PaidFirstSubscriptionStrategy());
    this.registerStrategy(new FreeFirstSubscriptionStrategy());
    this.registerStrategy(new PaidOnlySubscriptionStrategy());
    this.registerStrategy(new FreeOnlySubscriptionStrategy());
  }

  public registerStrategy(strategy: ISubscriptionPolicyStrategy): void {
    this.strategies.set(strategy.policyName.toLowerCase(), strategy);
  }

  public setPolicy(policy: string): void {
    const key = policy.toLowerCase();
    if (this.strategies.has(key)) {
      this.activePolicy = key;
    }
  }

  public getPolicy(): string {
    return this.activePolicy;
  }

  public evaluateRouting(
    requestedModel: string,
    isAuthenticated: boolean,
    tokenConsumedPercentage = 0,
    circuitBreakerOpen = false,
    policyOverride?: string,
  ): SubscriptionRoutingDecision {
    const policyKey = (policyOverride || this.activePolicy).toLowerCase();
    const strategy =
      this.strategies.get(policyKey) ||
      this.strategies.get(SubscriptionPolicyConstant.PAID_FIRST)!;

    const evalContext: SubscriptionEvaluationContext = {
      requestedModel,
      isAuthenticated,
      tokenConsumedPercentage,
      circuitBreakerOpen,
      fallbackThresholdPercentage: config.fallbackThresholdPercentage,
      fallbackModel: config.fallbackModel,
    };

    const decision = strategy.decide(evalContext);
    const sub = config.getSubscription(
      decision.targetModel,
      decision.executedTier,
    );
    return {
      ...decision,
      accountEmail: sub.accountEmail,
      accountName: sub.accountName,
    };
  }
}

export const subscriptionManager = new SubscriptionManager();
