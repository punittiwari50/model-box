import type { ExecutionStrategy } from "@/domain/constants/index.js";
import type {
  ExecutionRequest,
  ExecutionResponse,
  StreamChunk,
} from "@/domain/models/execution.types.js";

/**
 * Strategy Pattern Interface for Model Connectivity.
 * Conforms to:
 * - STD-COD-005: OOP Strategy Pattern
 * - STD-COD-007.2: Single Level of Abstraction (SLAP)
 */
export interface IConnectorStrategy {
  readonly strategyType: ExecutionStrategy;

  supports(model: string): boolean;

  execute(request: ExecutionRequest): Promise<ExecutionResponse>;

  stream(
    request: ExecutionRequest,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<ExecutionResponse>;
}
