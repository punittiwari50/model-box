/**
 * Domain Models for AI Model Connectivity.
 * Conforms to STD-COD-004 & STD-COD-005.
 * Contains all 6 model families: Grok, Gemini, Copilot, ChatGPT, Claude, Ollama.
 */

import { ModelFamily } from "@/constants/index.js";
export type ModelFamilyType = (typeof ModelFamily)[keyof typeof ModelFamily];

export interface ModelDescriptor {
  readonly id: string;
  readonly name: string;
  readonly family: ModelFamilyType;
  readonly provider: string;
  readonly contextWindow: number;
  readonly supportedStrategies: readonly string[];
  readonly status: "ACTIVE" | "INACTIVE" | "DEPRECATED";
  readonly description: string;
}

export interface PromptExecutionCommand {
  readonly prompt: string;
  readonly modelId?: string;
  readonly strategy?: "api" | "cli" | "cookie";
  readonly sessionId?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly correlationId?: string;
}

export interface PromptExecutionResult {
  readonly text: string;
  readonly modelId: string;
  readonly strategyUsed: string;
  readonly tokensUsed: number;
  readonly latencyMs: number;
  readonly correlationId: string;
  readonly sessionId?: string;
}
