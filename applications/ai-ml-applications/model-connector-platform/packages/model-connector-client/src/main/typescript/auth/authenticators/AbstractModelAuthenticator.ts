import type {
  IModelAuthenticator,
  ModelAuthContext,
  ModelAuthOutcome,
  ModelPostValidationResult,
  ModelValidationResult,
  RestAuthScheme,
} from "@/auth/authenticators/types.js";

/**
 * Template Method Pattern for Model Authentication Lifecycle.
 * Conforms to:
 * - STD-COD-005: Template Method & Strategy Pattern
 * - STD-COD-006: Complexity governance (depth <= 3, cyclomatic <= 10)
 * - STD-COD-007: Clean code, SLAP <= 20 lines, zero null returns
 */
export abstract class AbstractModelAuthenticator implements IModelAuthenticator {
  public abstract readonly providerId: string;
  public abstract readonly restAuthScheme: RestAuthScheme;

  public abstract supports(modelId: string): boolean;
  public abstract preValidate(ctx: ModelAuthContext): ModelValidationResult;
  public abstract authenticate(ctx: ModelAuthContext): Promise<ModelAuthOutcome>;
  public abstract postValidate(
    outcome: ModelAuthOutcome,
    ctx: ModelAuthContext,
  ): Promise<ModelPostValidationResult>;

  public async executeFlow(ctx: ModelAuthContext): Promise<ModelPostValidationResult> {
    const startTime = Date.now();
    const preCheck = this.preValidate(ctx);
    if (!preCheck.valid) {
      return this.buildPreValidationFailure(ctx, preCheck, startTime);
    }

    const outcome = await this.authenticate(ctx);
    if (!outcome.success) {
      return this.buildAuthFailure(ctx, outcome, startTime);
    }

    return this.postValidate(outcome, ctx);
  }

  protected buildPreValidationFailure(
    ctx: ModelAuthContext,
    preCheck: ModelValidationResult,
    startTime: number,
  ): ModelPostValidationResult {
    return Object.freeze({
      verified: false,
      active: false,
      modelId: ctx.modelId,
      providerId: this.providerId,
      correlationId: ctx.correlationId,
      traceId: ctx.traceId,
      latencyMs: Date.now() - startTime,
      errorCode: preCheck.errorCode || "PRE_VALIDATION_FAILED",
      errorMessage: preCheck.reason || "Pre-validation check failed.",
    });
  }

  protected buildAuthFailure(
    ctx: ModelAuthContext,
    outcome: ModelAuthOutcome,
    startTime: number,
  ): ModelPostValidationResult {
    return Object.freeze({
      verified: false,
      active: false,
      modelId: ctx.modelId,
      providerId: this.providerId,
      correlationId: ctx.correlationId,
      traceId: ctx.traceId,
      latencyMs: Date.now() - startTime,
      errorCode: outcome.errorCode || "AUTHENTICATION_FAILED",
      errorMessage: outcome.errorMessage || "Model authentication flow failed.",
    });
  }

  protected buildSuccessResult(
    ctx: ModelAuthContext,
    testPromptResponse: string,
    startTime: number,
    details?: Record<string, unknown>,
  ): ModelPostValidationResult {
    return Object.freeze({
      verified: true,
      active: true,
      modelId: ctx.modelId,
      providerId: this.providerId,
      correlationId: ctx.correlationId,
      traceId: ctx.traceId,
      latencyMs: Date.now() - startTime,
      testPromptResponse,
      details,
    });
  }
}
