import type { ExecutionStrategy } from "@/domain/constants/index.js";

/**
 * Structured user-specific & task-specific execution envelope.
 * Ensures strict 1-to-1 binding between a user/task request and its response
 * across concurrent CLI and distributed API/OAuth executions.
 */
export interface StructuredExecutionEnvelope {
  readonly requestId: string;
  readonly taskId: string;
  readonly userId: string;
  readonly userEmail?: string;
  readonly accountId?: string;
  readonly tenantId?: string;
  readonly sessionId: string;
  readonly correlationId: string;
  readonly model: string;
  readonly strategyUsed: ExecutionStrategy;
  readonly fallbackOccurred: boolean;
  readonly fallbackProvider?: string;
  readonly dispatchedAt: string;
  readonly completedAt: string;
}

/**
 * Execution input payload.
 * Conforms to STD-COD-007.5: Immutability by Default.
 */
export interface ExecutionRequest {
  readonly prompt: string;
  readonly model?: string;
  readonly strategy?: ExecutionStrategy;
  readonly systemInstruction?: string;
  readonly sessionId?: string;
  readonly correlationId?: string;
  readonly requestId?: string;
  readonly taskId?: string;
  readonly userId?: string;
  readonly userEmail?: string;
  readonly accountId?: string;
  readonly tenantId?: string;
  readonly apiKey?: string;
  readonly oauthToken?: string;
  readonly clientId?: string;
  readonly redirectUri?: string;
  readonly cookieHeader?: string;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly clientIp?: string;
  readonly effortTier?: "low" | "medium" | "high";
  readonly hyperparameters?: {
    readonly temperature?: number;
    readonly topP?: number;
    readonly maxOutputTokens?: number;
  };
}

export interface TokenMetrics {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  readonly tokenConsumedPercentage?: number;
}

export interface ExecutionResponse {
  readonly content: string;
  readonly model: string;
  readonly strategyUsed: ExecutionStrategy;
  readonly latencyMs: number;
  readonly tokenMetrics: TokenMetrics;
  readonly sessionId?: string;
  readonly correlationId: string;
  readonly requestId?: string;
  readonly taskId?: string;
  readonly userId?: string;
  readonly userEmail?: string;
  readonly accountId?: string;
  readonly fallbackOccurred?: boolean;
  readonly fallbackProvider?: string;
  readonly fallbackReason?: string;
  readonly requestedModel?: string;
  readonly envelope?: StructuredExecutionEnvelope;
  readonly timestamp: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface StreamChunk {
  readonly delta: string;
  readonly accumulatedText: string;
  readonly isComplete: boolean;
  readonly tokenMetrics?: TokenMetrics;
  readonly correlationId: string;
  readonly requestId?: string;
  readonly taskId?: string;
  readonly userId?: string;
}
