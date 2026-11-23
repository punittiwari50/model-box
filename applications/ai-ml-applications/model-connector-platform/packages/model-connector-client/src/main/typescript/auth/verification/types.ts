export interface VerificationTokenMetrics {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  readonly contextLimit: number;
  readonly percentConsumed: number;
  readonly percentLeft: number;
}

export type ModelInteractionMode = "chat" | "ask" | "agent";

export interface ConnectionTestResult {
  readonly status: "VERIFIED" | "FAILED" | "DEGRADED";
  readonly protocol: string;
  readonly message: string;
  readonly latencyMs: number;
  readonly modelOutput?: string;
  readonly errorMessage?: string;
  readonly details: Record<string, unknown>;
  readonly correlationId?: string;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly modelName?: string;
  readonly cliName?: string;
  readonly cliVersion?: string;
  readonly effortTier?: "low" | "medium" | "high";
  readonly mode?: ModelInteractionMode;
  readonly tokenMetrics?: VerificationTokenMetrics;
  readonly executedCall?: string;
  readonly executedCommand?: string;
  readonly isFallback?: boolean;
}

export interface VerificationContext {
  readonly modelId: string;
  readonly credentialValue: string;
  readonly userPrompt: string;
  readonly startTime: number;
  readonly correlationId?: string;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly parentSpanId?: string;
  readonly effortTier?: "low" | "medium" | "high";
  readonly userEmail?: string;
  readonly mode?: ModelInteractionMode;
}

export interface CliExecutionPlan {
  readonly binary: string;
  readonly cmd: string;
  readonly env: Record<string, string | undefined>;
}

export interface IProviderVerificationStrategy {
  supports(modelId: string): boolean;
  verifyApi(ctx: VerificationContext): Promise<ConnectionTestResult>;
  buildCliPlan(modelId: string, sanitizedPrompt: string, credential: string, mode?: ModelInteractionMode): CliExecutionPlan;
}

export interface IProviderVerificationRegistry {
  resolve(modelId: string): IProviderVerificationStrategy;
}

export interface IProtocolVerificationStrategy {
  supports(protocolType: string): boolean;
  verify(ctx: VerificationContext): Promise<ConnectionTestResult>;
}

export interface IProtocolVerificationRegistry {
  resolve(protocolType: string): IProtocolVerificationStrategy;
}
