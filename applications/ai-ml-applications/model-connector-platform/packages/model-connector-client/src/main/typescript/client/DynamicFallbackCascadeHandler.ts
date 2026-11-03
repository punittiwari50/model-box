import { ExecutionStrategyType, ModelCatalogDefaults } from "@/domain/constants/index.js";
import type { ExecutionStrategy } from "@/domain/constants/index.js";
import type {
  ExecutionRequest,
  ExecutionResponse,
} from "@/domain/models/execution.types.js";
import { AuthRevocationTrap } from "@/security/AuthRevocationTrap.js";
import type { IConnectorStrategy } from "@/strategies/IConnectorStrategy.js";
import {
  defaultOllamaDockerFallbackConnector,
  type IOllamaDockerFallbackConnector,
} from "@/adapters/OllamaDockerFallbackConnector.js";

/**
 * Enterprise Dynamic Fallback Cascade Handler.
 * Conforms to:
 * - UC-15 §8.1 & §8.2: Dynamic Strategy Fallback & Local Air-Gapped / Ollama Docker Cascade
 * - STD-COD-007: Resilient Error Handling & Zero Unhandled Exceptions
 */
export class DynamicFallbackCascadeHandler {
  public static async executeWithCascade(
    primaryStrategy: IConnectorStrategy,
    request: ExecutionRequest,
    strategyResolver: (strategy: ExecutionStrategy) => IConnectorStrategy | undefined,
    ollamaFallback: IOllamaDockerFallbackConnector = defaultOllamaDockerFallbackConnector,
  ): Promise<{ response: ExecutionResponse; fallbackOccurred: boolean }> {
    try {
      const response = await primaryStrategy.execute(request);
      return { response, fallbackOccurred: Boolean(response.fallbackOccurred) };
    } catch (error) {
      return this.handleFallback(error, request, strategyResolver, ollamaFallback);
    }
  }

  private static async handleFallback(
    error: unknown,
    request: ExecutionRequest,
    strategyResolver: (strategy: ExecutionStrategy) => IConnectorStrategy | undefined,
    ollamaFallback: IOllamaDockerFallbackConnector,
  ): Promise<{ response: ExecutionResponse; fallbackOccurred: boolean }> {
    const secondary = await this.trySecondaryStrategy(error, request, strategyResolver);
    if (secondary) {
      return { response: secondary, fallbackOccurred: true };
    }
    const dockerResponse = await ollamaFallback.executeDockerFallback(request);
    if (dockerResponse) {
      return { response: dockerResponse, fallbackOccurred: true };
    }
    if (ollamaFallback.canAttemptFallback(request)) {
      const cliResponse = await this.tryAirGappedCliFallback(request, strategyResolver);
      if (cliResponse) {
        return { response: cliResponse, fallbackOccurred: true };
      }
    }
    throw error;
  }

  private static async trySecondaryStrategy(
    error: unknown,
    request: ExecutionRequest,
    strategyResolver: (strategy: ExecutionStrategy) => IConnectorStrategy | undefined,
  ): Promise<ExecutionResponse | null> {
    const resolution = AuthRevocationTrap.interceptError(error, {
      tenantId: request.sessionId || "default-tenant",
      correlationId: request.correlationId || "unknown-corr",
      modelId: request.model || ModelCatalogDefaults.DEFAULT_MODEL,
      currentStrategy: request.strategy || ExecutionStrategyType.API,
    });
    if (!resolution.fallbackStrategy || resolution.fallbackStrategy === request.strategy) {
      return null;
    }
    const secondaryStrategy = strategyResolver(resolution.fallbackStrategy);
    if (!secondaryStrategy) {
      return null;
    }
    try {
      return await secondaryStrategy.execute({ ...request, strategy: resolution.fallbackStrategy });
    } catch {
      return null;
    }
  }

  private static async tryAirGappedCliFallback(
    request: ExecutionRequest,
    strategyResolver: (strategy: ExecutionStrategy) => IConnectorStrategy | undefined,
  ): Promise<ExecutionResponse | null> {
    if (request.strategy === ExecutionStrategyType.CLI) {
      return null;
    }
    const fallbackCli = strategyResolver(ExecutionStrategyType.CLI);
    if (!fallbackCli) {
      return null;
    }
    try {
      return await fallbackCli.execute({
        ...request,
        strategy: ExecutionStrategyType.CLI,
        model: ModelCatalogDefaults.DEFAULT_FALLBACK_MODEL,
      });
    } catch {
      return null;
    }
  }
}
