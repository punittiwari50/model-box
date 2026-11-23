import type { CliExecutionResult } from "@/domain/index.js";
import type {
  ExecutePromptOptions,
  IModelRunner,
} from "@/core/cli/modelRunnerInterface.js";
import { logger } from "@/core/observability/logging/logger.js";
import { isFallbackModel } from "@/domain/constants/index.js";

/**
 * Execution strategy interface for dispatching prompts.
 * Conforms to:
 * - STD-COD-005: Strategy Pattern over procedural if/else ladders
 * - STD-PAT-CORE-TYPESCRIPT #20: First-Class Functional / Object Strategy
 * - Directive 6: Depend on IModelRunner abstraction rather than static GeminiCliRunner
 */
export interface ExecutionStrategy {
  execute(
    runner: IModelRunner,
    options: ExecutePromptOptions,
    startTime: number,
    effectiveToken?: string,
  ): Promise<CliExecutionResult>;
}

/**
 * Simulates response using internal mock engine when explicitly requested.
 * Strictly permitted only during testcases per architecture directives.
 */
export class MockExecutionStrategy implements ExecutionStrategy {
  public async execute(
    runner: IModelRunner,
    options: ExecutePromptOptions,
    startTime: number,
  ): Promise<CliExecutionResult> {
    const isTestEnv =
      process.env.NODE_ENV === "test" ||
      Boolean(process.env.npm_lifecycle_event?.includes("test")) ||
      process.argv.some((arg) => arg.includes("test"));

    if (!isTestEnv || !runner.isMockAllowed()) {
      throw new Error(
        "Mock responses are disabled. Mock execution is strictly permitted only during test cases.",
      );
    }
    logger.info(
      "RUNNER",
      `Mock execution dispatched for model: ${options.model || runner.getDefaultModel()}`,
    );
    return runner.executeMock(options, startTime);
  }
}

/**
 * Dispatches directly to Google Gemini Generative Language REST API.
 */
export class ApiExecutionStrategy implements ExecutionStrategy {
  public async execute(
    runner: IModelRunner,
    options: ExecutePromptOptions,
    startTime: number,
  ): Promise<CliExecutionResult> {
    const chosenModel = options.model || runner.getDefaultModel();
    logger.info(
      "RUNNER",
      `Executing via direct Google Gemini REST API (model: ${chosenModel}).`,
    );
    return runner.executeApi(options, startTime);
  }
}

/**
 * Dispatches to native Google Gemini CLI binary.
 */
export class CliExecutionStrategy implements ExecutionStrategy {
  public async execute(
    runner: IModelRunner,
    options: ExecutePromptOptions,
    startTime: number,
  ): Promise<CliExecutionResult> {
    return runner.executeCli(options, startTime);
  }
}

/**
 * Dispatches via persistent bi-directional WebSocket streaming channel.
 */
export class WebSocketExecutionStrategy implements ExecutionStrategy {
  public async execute(
    runner: IModelRunner,
    options: ExecutePromptOptions,
    startTime: number,
  ): Promise<CliExecutionResult> {
    const chosenModel = options.model || runner.getDefaultModel();
    logger.info(
      "RUNNER",
      `Executing prompt via WebSocket channel (model: ${chosenModel}).`,
    );
    const result = await runner.executeApi(options, startTime);
    return {
      ...result,
      runner_type: "websocket",
    };
  }
}

/**
 * Smart auto-dispatcher: tries low-latency direct REST API if token exists,
 * gracefully falling back to CLI execution on network/auth failure.
 */
export class AutoExecutionStrategy implements ExecutionStrategy {
  public async execute(
    runner: IModelRunner,
    options: ExecutePromptOptions,
    startTime: number,
    effectiveToken?: string,
  ): Promise<CliExecutionResult> {
    const chosenModel = options.model || runner.getDefaultModel();
    if (isFallbackModel(chosenModel) || effectiveToken) {
      try {
        return await runner.executeApi(options, startTime);
      } catch (apiErr: any) {
        logger.warn(
          "RUNNER",
          `Direct API attempt failed (${apiErr.message}). Trying CLI fallback.`,
        );
      }
    }
    return runner.executeCli(options, startTime);
  }
}

/**
 * Strategy Registry mapping execution modes to their concrete strategy implementations.
 * Conforms to STD-PAT-CORE-TYPESCRIPT #1 (Type-Safe Registry Map).
 */
export class ExecutionStrategyRegistry {
  private readonly strategies = new Map<string, ExecutionStrategy>();

  constructor() {
    this.strategies.set("mock", new MockExecutionStrategy());
    this.strategies.set("api", new ApiExecutionStrategy());
    this.strategies.set("cli", new CliExecutionStrategy());
    this.strategies.set("websocket", new WebSocketExecutionStrategy());
    this.strategies.set("ws", new WebSocketExecutionStrategy());
    this.strategies.set("auto", new AutoExecutionStrategy());
  }

  public get(mode: string): ExecutionStrategy {
    return this.strategies.get(mode) || this.strategies.get("auto")!;
  }
}

export const executionStrategyRegistry = new ExecutionStrategyRegistry();
