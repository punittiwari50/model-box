import { ExecutionStrategyType } from "@/domain/constants/index.js";
import type { ExecutionStrategy } from "@/domain/constants/index.js";

export interface RevocationContext {
  readonly tenantId: string;
  readonly correlationId: string;
  readonly modelId: string;
  readonly currentStrategy: ExecutionStrategy;
  readonly accumulatedContent?: string;
  readonly stepIndex?: number;
}

export interface RevocationResolution {
  readonly isAuthRevocation: boolean;
  readonly shouldRetry: boolean;
  readonly fallbackStrategy?: ExecutionStrategy;
  readonly fallbackModel?: string;
  readonly paused: boolean;
  readonly reason: string;
}

/**
 * Enterprise Silent Access Revocation Trap & Resilient Recovery Controller.
 * Conforms to:
 * - UC-15 §8.1 & HLD §10.1: Out-of-Band Upstream Revocation Trap
 * - LLD §9.1: Auth Revocation Circuit Breaker & State Machine
 * - STD-COD-007: Resilient Error Handling & State Preservation
 */
export class AuthRevocationTrap {
  public static isAuthError(error: unknown): boolean {
    if (!error) {
      return false;
    }
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return (
      message.includes("401") ||
      message.includes("403") ||
      message.includes("unauthorized") ||
      message.includes("forbidden") ||
      message.includes("auth_revoked") ||
      message.includes("session expired")
    );
  }

  public static interceptError(
    error: unknown,
    context: RevocationContext,
  ): RevocationResolution {
    if (!this.isAuthError(error)) {
      return Object.freeze({
        isAuthRevocation: false,
        shouldRetry: false,
        paused: false,
        reason: error instanceof Error ? error.message : "Non-auth error encountered",
      });
    }

    const fallbackStrategy = this.resolveFallbackStrategy(context.currentStrategy);
    if (fallbackStrategy) {
      return Object.freeze({
        isAuthRevocation: true,
        shouldRetry: true,
        fallbackStrategy,
        paused: false,
        reason: `Strategy ${context.currentStrategy} auth revoked; pivoting to ${fallbackStrategy}`,
      });
    }

    return Object.freeze({
      isAuthRevocation: true,
      shouldRetry: false,
      fallbackModel: "llama3.2",
      paused: true,
      reason: `Auth revoked for ${context.currentStrategy}. Execution state preserved at step ${context.stepIndex ?? 0}.`,
    });
  }

  private static resolveFallbackStrategy(current: ExecutionStrategy): ExecutionStrategy | undefined {
    if (current === ExecutionStrategyType.COOKIE) {
      return ExecutionStrategyType.API;
    }
    if (current === ExecutionStrategyType.API) {
      return ExecutionStrategyType.CLI;
    }
    return undefined;
  }
}
