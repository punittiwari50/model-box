import { environment, timerUtils, randomUUID } from "@model-box/model-connector-core";
import type { IConnectorStrategy } from "@/strategies/IConnectorStrategy.js";
import {
  ExecutionStrategyType,
  ModelCatalogDefaults,
} from "@/domain/constants/index.js";
import type {
  ExecutionRequest,
  ExecutionResponse,
  StreamChunk,
} from "@/domain/models/execution.types.js";
import { SessionLineageManager } from "@/strategies/cookie/SessionLineageManager.js";

export class CookieConnectorStrategy implements IConnectorStrategy {
  public readonly strategyType = ExecutionStrategyType.COOKIE;
  private readonly sessionManager: SessionLineageManager;

  constructor(sessionManager?: SessionLineageManager) {
    this.sessionManager = sessionManager || new SessionLineageManager();
  }

  public supports(_model: string): boolean {
    return true;
  }

  public async execute(request: ExecutionRequest): Promise<ExecutionResponse> {
    const startTime = timerUtils.now();
    const correlationId = request.correlationId || randomUUID();
    const defaultModel = environment.getProperty(
      "default.model",
      ModelCatalogDefaults.DEFAULT_MODEL,
    );
    const model = request.model || defaultModel;
    const session = this.sessionManager.getOrCreateSession(request.sessionId, model);
    const cookieHeader = request.cookieHeader || this.sessionManager.formatCookieHeader(session);

    const latencyMs = Math.round(performance.now() - startTime);
    const content = `[Cookie-Authenticated Session: ${session.sessionId.slice(0, 8)}] (Turn #${session.turnCount}) Response for: "${request.prompt.slice(0, 70)}${request.prompt.length > 70 ? "..." : ""}". Lineage maintained via session cookie.`;

    return {
      content,
      model,
      strategyUsed: ExecutionStrategyType.COOKIE,
      latencyMs,
      tokenMetrics: {
        promptTokens: Math.ceil(request.prompt.length / 4),
        completionTokens: Math.ceil(content.length / 4),
        totalTokens: Math.ceil((request.prompt.length + content.length) / 4),
      },
      sessionId: session.sessionId,
      correlationId,
      timestamp: new Date().toISOString(),
      metadata: {
        cookieHeaderApplied: Boolean(cookieHeader),
        turnCount: session.turnCount,
        sessionCreatedAt: session.createdAt,
      },
    };
  }

  public async stream(
    request: ExecutionRequest,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<ExecutionResponse> {
    const response = await this.execute(request);
    onChunk({
      delta: response.content,
      accumulatedText: response.content,
      isComplete: true,
      tokenMetrics: response.tokenMetrics,
      correlationId: response.correlationId,
    });
    return response;
  }

  public getSessionManager(): SessionLineageManager {
    return this.sessionManager;
  }
}
