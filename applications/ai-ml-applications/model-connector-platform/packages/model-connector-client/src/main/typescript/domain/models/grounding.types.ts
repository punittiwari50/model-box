import type { ExecutionStrategy } from "@/domain/constants/index.js";

/**
 * Domain types for Grounding and Omni-Auth Mesh.
 * Conforms to:
 * - UC-15 §5.2: Model Connector Client Omni-Authentication & Google Search AI Grounding
 * - STD-COD-007: Clean Code & Immutability by Default
 */

export interface GroundingCitation {
  readonly index: number;
  readonly title: string;
  readonly url: string;
  readonly domain: string;
  readonly snippet: string;
  readonly textOffsetStart: number;
  readonly textOffsetEnd: number;
  readonly confidenceScore: number;
}

export interface GroundingSnippet {
  readonly title: string;
  readonly url: string;
  readonly domain: string;
  readonly snippet: string;
  readonly publicationDate?: string;
}

export interface GroundingEvidence {
  readonly searchQueries: readonly string[];
  readonly snippets: readonly GroundingSnippet[];
  readonly totalResults: number;
  readonly retrievedAtMs: number;
}

export interface GroundedResponse {
  readonly content: string;
  readonly citations: readonly GroundingCitation[];
  readonly searchQueriesUsed: readonly string[];
  readonly groundingStatus: string;
}

export interface DecryptedCredential {
  readonly tenantId: string;
  readonly modelFamily: string;
  readonly authStrategy: ExecutionStrategy;
  readonly apiKey?: string;
  readonly sessionCookies?: Readonly<Record<string, string>>;
  readonly oauthTokens?: {
    readonly accessToken: string;
    readonly refreshToken?: string;
    readonly expiresAtMs: number;
    readonly tokenType: string;
  };
  readonly iamCredentials?: {
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly sessionToken?: string;
    readonly region: string;
  };
  readonly cliPath?: string;
}

export interface ModelChatPayload {
  readonly modelId: string;
  readonly prompt: string;
  readonly systemInstruction?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly strategy?: ExecutionStrategy;
  readonly enableSearchGrounding?: boolean;
  readonly groundingThreshold?: number;
  readonly correlationId?: string;
  readonly requestId?: string;
  readonly taskId?: string;
  readonly userId?: string;
  readonly userEmail?: string;
  readonly accountId?: string;
  readonly tenantId?: string;
  readonly sessionId?: string;
  readonly apiKey?: string;
  readonly oauthToken?: string;
}

export interface ModelChatResponse {
  readonly content: string;
  readonly modelId: string;
  readonly strategyUsed: ExecutionStrategy;
  readonly tokenCount: number;
  readonly latencyMs: number;
  readonly finishReason: string;
  readonly citations?: readonly GroundingCitation[];
  readonly searchQueriesUsed?: readonly string[];
  readonly correlationId: string;
  readonly requestId?: string;
  readonly taskId?: string;
  readonly userId?: string;
  readonly userEmail?: string;
  readonly accountId?: string;
  readonly timestamp: string;
  readonly fallbackOccurred?: boolean;
  readonly fallbackProvider?: string;
}
