import {
  modelProviderConfigService,
  ProviderId,
  type IModelProviderConfig,
} from "@model-box/model-connector-core";
import { AbstractModelAuthenticator } from "@/auth/authenticators/AbstractModelAuthenticator.js";
import type {
  ModelAuthContext,
  ModelAuthOutcome,
  ModelPostValidationResult,
  ModelValidationResult,
  RestAuthScheme,
} from "@/auth/authenticators/types.js";
import { accountRepository } from "@/auth/ModelAccountRepository.js";

/**
 * Dedicated Anthropic Claude Model Authenticator.
 * Conforms to:
 * - STD-COD-001: Absolute @/ imports exclusively
 * - STD-COD-005: 1 class 1 model provider lifecycle
 * - STD-COD-007: SLAP <= 20 lines per method, immutability by default
 */
export class AnthropicModelAuthenticator extends AbstractModelAuthenticator {
  public readonly providerId: string = ProviderId.ANTHROPIC;
  public readonly restAuthScheme: RestAuthScheme = "bearer";

  public supports(modelId: string): boolean {
    return modelId.toLowerCase().includes("claude");
  }

  public preValidate(ctx: ModelAuthContext): ModelValidationResult {
    const cred = ctx.credentialValue?.trim() || "";
    if (!cred) {
      return Object.freeze({ valid: false, reason: "Claude API key or token cannot be empty.", errorCode: "KEY_EMPTY" });
    }
    return Object.freeze({ valid: true });
  }

  public async authenticate(ctx: ModelAuthContext): Promise<ModelAuthOutcome> {
    const token = ctx.credentialValue?.trim() || "";
    return Object.freeze({
      success: true,
      modelId: ctx.modelId,
      providerId: this.providerId,
      authType: "api_key",
      restAuthScheme: this.restAuthScheme,
      token,
      userEmail: ctx.userEmail || "",
      correlationId: ctx.correlationId,
      traceId: ctx.traceId,
    });
  }

  public async postValidate(
    outcome: ModelAuthOutcome,
    ctx: ModelAuthContext,
  ): Promise<ModelPostValidationResult> {
    const startTime = Date.now();
    const cfg = this.loadConfig(ctx.modelId);
    const probeRes = await this.probeClaudeApi(cfg, outcome.token, ctx.correlationId);
    if (!probeRes.ok) {
      return Object.freeze({
        verified: false,
        active: false,
        modelId: ctx.modelId,
        providerId: this.providerId,
        correlationId: ctx.correlationId,
        traceId: ctx.traceId,
        latencyMs: Date.now() - startTime,
        errorCode: "CLAUDE_VERIFICATION_FAILED",
        errorMessage: probeRes.error || "Claude API verification failed.",
      });
    }

    this.registerAccount(ctx.modelId, outcome.token, ctx.userEmail);
    return this.buildSuccessResult(ctx, "Claude authentication verified.", startTime, probeRes.details);
  }

  private loadConfig(modelId: string): IModelProviderConfig {
    return modelProviderConfigService.getProviderConfig(ProviderId.ANTHROPIC, modelId);
  }

  private async probeClaudeApi(
    cfg: IModelProviderConfig,
    token: string,
    correlationId: string,
  ): Promise<{ ok: boolean; error?: string; details?: Record<string, unknown> }> {
    try {
      const url = cfg.tokeninfoEndpoint || `${cfg.baseUrl}/v1/models`;
      const res = await fetch(url, {
        headers: {
          "x-api-key": token,
          "anthropic-version": cfg.anthropicVersionHeader || "2023-06-01",
          "x-correlation-id": correlationId,
        },
        signal: AbortSignal.timeout(6000),
      });
      return { ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
    } catch (err: unknown) {
      return { ok: false, error: String(err) };
    }
  }

  private registerAccount(modelId: string, token: string, userEmail?: string): void {
    const email = userEmail?.trim() || "";
    const accountName = email ? `Anthropic Claude (${email})` : `Anthropic Claude (${modelId})`;
    accountRepository.createAccount({
      modelId,
      accountName,
      userEmail: email,
      authType: "api_key",
      credentialValue: token,
      isActive: true,
    });
  }
}
