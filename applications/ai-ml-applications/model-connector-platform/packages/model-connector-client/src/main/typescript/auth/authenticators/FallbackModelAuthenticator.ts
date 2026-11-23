import {
  environment,
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
 * Dedicated Fallback Model Authenticator (Local Ollama / Zero-Credential Execution).
 * Conforms to:
 * - STD-COD-001: Absolute @/ imports exclusively
 * - STD-COD-002: Centralized naming in application.yml (fallback.endpointUrl, fallback.executable)
 * - STD-COD-005: 1 class 1 model provider lifecycle
 * - STD-COD-007: SLAP <= 20 lines per method, immutability by default
 */
export class FallbackModelAuthenticator extends AbstractModelAuthenticator {
  public readonly providerId: string = ProviderId.OLLAMA;
  public readonly restAuthScheme: RestAuthScheme = "none";

  public supports(modelId: string): boolean {
    const norm = modelId.toLowerCase();
    return norm.includes("ollama") || norm.includes("llama") || norm.includes("fallback") || norm.includes("qwen") || norm.includes("phi");
  }

  public preValidate(_ctx: ModelAuthContext): ModelValidationResult {
    return Object.freeze({ valid: true });
  }

  public async authenticate(ctx: ModelAuthContext): Promise<ModelAuthOutcome> {
    return Object.freeze({
      success: true,
      modelId: ctx.modelId,
      providerId: this.providerId,
      authType: "none",
      restAuthScheme: this.restAuthScheme,
      token: "none",
      userEmail: ctx.userEmail || "",
      correlationId: ctx.correlationId,
      traceId: ctx.traceId,
    });
  }

  public async postValidate(
    _outcome: ModelAuthOutcome,
    ctx: ModelAuthContext,
  ): Promise<ModelPostValidationResult> {
    const startTime = Date.now();
    const endpoint = this.resolveEndpointUrl();
    const isOnline = await this.probeEndpoint(endpoint);
    this.registerLocalAccount(ctx.modelId, endpoint, ctx.userEmail);
    return Object.freeze({
      verified: true,
      active: true,
      modelId: ctx.modelId,
      providerId: this.providerId,
      correlationId: ctx.correlationId,
      traceId: ctx.traceId,
      latencyMs: Date.now() - startTime,
      testPromptResponse: isOnline ? "Local fallback endpoint responded OK." : "Fallback registered for offline queueing.",
      details: { endpoint, offlineAvailable: true },
    });
  }

  private resolveEndpointUrl(): string {
    const fallbackUrl = environment.getProperty("fallback.endpointUrl", "");
    if (fallbackUrl) return fallbackUrl;
    const cfg: IModelProviderConfig = modelProviderConfigService.getProviderConfig(ProviderId.OLLAMA);
    return cfg.baseUrl || "http://localhost:11435";
  }

  private async probeEndpoint(endpoint: string): Promise<boolean> {
    try {
      const res = await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  private registerLocalAccount(modelId: string, endpoint: string, userEmail?: string): void {
    const email = userEmail?.trim() || "";
    accountRepository.createAccount({
      modelId,
      accountName: email ? `Fallback Local (${modelId} - ${email})` : `Fallback Local (${modelId})`,
      userEmail: email,
      authType: "api",
      credentialValue: endpoint,
      isActive: true,
    });
  }
}
