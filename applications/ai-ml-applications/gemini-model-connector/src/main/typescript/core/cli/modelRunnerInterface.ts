import type { CliExecutionResult } from '@/domain/index.js';

/**
 * Options provided to execute a prompt across model runners.
 * Conforms to:
 * - STD-COD-002: Model-Agnostic Interface
 * - User Isolation: Supports explicit userId to guarantee User A's response is never delivered to User B.
 */
export interface ExecutePromptOptions {
  prompt: string;
  model?: string;
  systemInstruction?: string;
  contextFiles?: string[];
  inputStream?: string;
  apiKey?: string;
  mode?: 'auto' | 'api' | 'cli' | 'websocket' | 'mock';
  userId?: string;
  sessionId?: string;
  resume?: boolean;
  isFallback?: boolean;
  subscriptionPolicy?: string;
  hyperparameters?: Partial<import('@/core/config/properties/modelProperties.js').ModelHyperparameters>;
  cwd?: string;
}

/**
 * Model Runner contract decoupling execution strategies and API controllers
 * from any concrete model CLI runner implementation.
 * Conforms to:
 * - STD-COD-005: Dependency Inversion Principle (DIP) & Strategy Pattern
 * - Directive 6: Avoid static GeminiCliRunner coupling in favor of DI and IModelRunner
 */
export interface IModelRunner {
  getDefaultModel(): string;
  isMockAllowed(): boolean;
  executePrompt(options: ExecutePromptOptions): Promise<CliExecutionResult>;
  executeApi(options: ExecutePromptOptions, startTime?: number): Promise<CliExecutionResult>;
  executeCli(options: ExecutePromptOptions, startTime?: number): Promise<CliExecutionResult>;
  executeMock(options: ExecutePromptOptions, startTime?: number): Promise<CliExecutionResult>;
  executeFallback(options: ExecutePromptOptions, startTime?: number, reason?: string): Promise<CliExecutionResult>;
  isCliAvailable(modelName?: string): boolean;
}
