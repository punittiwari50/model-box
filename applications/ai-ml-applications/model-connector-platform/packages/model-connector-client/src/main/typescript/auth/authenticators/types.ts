/**
 * Model Authentication Architecture Types
 * Conforms to:
 * - STD-COD-002: Zero magic literals
 * - STD-COD-005: Open/Closed & Strategy Pattern
 * - STD-COD-007: Immutability by default
 */

export type RestAuthScheme = "none" | "basic" | "bearer";

export interface ModelAuthContext {
  readonly modelId: string;
  readonly correlationId: string;
  readonly traceId: string;
  readonly spanId?: string;
  readonly parentSpanId?: string;
  readonly userEmail?: string;
  readonly credentialValue?: string;
  readonly authCode?: string;
  readonly accountCategory?: "individual" | "enterprise";
  readonly redirectUri?: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly testPrompt?: string;
}

export interface ModelValidationResult {
  readonly valid: boolean;
  readonly reason?: string;
  readonly errorCode?: string;
}

export interface ModelAuthOutcome {
  readonly success: boolean;
  readonly modelId: string;
  readonly providerId: string;
  readonly authType: string;
  readonly restAuthScheme: RestAuthScheme;
  readonly token: string;
  readonly userEmail?: string;
  readonly session?: Record<string, unknown>;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly correlationId: string;
  readonly traceId: string;
}

export interface ModelPostValidationResult {
  readonly verified: boolean;
  readonly active: boolean;
  readonly modelId: string;
  readonly providerId: string;
  readonly correlationId: string;
  readonly traceId: string;
  readonly latencyMs: number;
  readonly testPromptResponse?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly details?: Record<string, unknown>;
}

export interface IModelAuthenticator {
  readonly providerId: string;
  readonly restAuthScheme: RestAuthScheme;
  supports(modelId: string): boolean;
  preValidate(ctx: ModelAuthContext): ModelValidationResult;
  authenticate(ctx: ModelAuthContext): Promise<ModelAuthOutcome>;
  postValidate(outcome: ModelAuthOutcome, ctx: ModelAuthContext): Promise<ModelPostValidationResult>;
  executeFlow(ctx: ModelAuthContext): Promise<ModelPostValidationResult>;
}
