import { randomUUID } from "@model-box/model-connector-core";
import type {
  ExecutionRequest,
  ExecutionResponse,
  ExecutionStrategy,
  StreamChunk,
} from "@model-box/model-connector-client";
import { modelService } from "@/services/modelService";
import { sessionRepository } from "@/repositories/sessionRepository";
import { accountRepository } from "@/repositories/accountRepository";
import { auditRepository } from "@/repositories/auditRepository";

export class InferenceService {
  public async executeChat(request: ExecutionRequest): Promise<ExecutionResponse> {
    const startTime = Date.now();
    const sessionId = request.sessionId || randomUUID();
    const model = request.model || "gemini-3.8-flash";
    const { effectiveStrategy, effectiveApiKey, effectiveOAuthToken, activeAccount } =
      this.resolveEffectiveCredentials(request, model);

    sessionRepository.getOrCreateSession(sessionId, model, effectiveStrategy);
    sessionRepository.saveMessage({
      sessionId,
      role: "user",
      content: request.prompt,
      model,
      strategy: effectiveStrategy,
    });

    const client = modelService.getClient();
    let response: ExecutionResponse;
    try {
      response = await client.execute({
        ...request,
        model,
        strategy: effectiveStrategy,
        sessionId,
        apiKey: effectiveApiKey,
        oauthToken: effectiveOAuthToken,
        userId: request.userId || activeAccount?.userEmail,
        userEmail: request.userEmail || activeAccount?.userEmail,
        accountId: request.accountId || activeAccount?.accountId,
      });
    } catch (err: unknown) {
      if (this.isUnauthorizedError(err) && activeAccount?.authType !== "cli_oauth") {
        accountRepository.deactivateActiveAccount(model);
      }
      const latencyMs = Date.now() - startTime;
      await auditRepository.saveAuditLog({
        correlationId: request.correlationId || randomUUID(),
        traceId: request.traceId,
        spanId: request.spanId,
        sessionId,
        modelId: model,
        actionName: "CHAT_INFERENCE",
        strategyMode: effectiveStrategy,
        latencyMs,
        executionStatus: "FAILED",
        clientIp: request.clientIp,
        promptMessage: request.prompt,
        errorMessage: (err as any)?.message || String(err),
      });
      throw err;
    }

    sessionRepository.saveMessage({
      sessionId,
      role: "assistant",
      content: response.content,
      model: response.model || model,
      strategy: response.strategyUsed || effectiveStrategy,
      tokenCount: response.tokenMetrics?.totalTokens,
      latencyMs: response.latencyMs,
    });

    sessionRepository.updateSessionOnMessage(
      sessionId,
      response.model || model,
      response.strategyUsed || effectiveStrategy,
      request.prompt,
    );

    const latencyMs = response.latencyMs || Date.now() - startTime;
    await auditRepository.saveAuditLog({
      correlationId: request.correlationId || randomUUID(),
      traceId: request.traceId,
      spanId: request.spanId,
      sessionId,
      modelId: response.model || model,
      actionName: "CHAT_INFERENCE",
      strategyMode: response.strategyUsed || effectiveStrategy,
      latencyMs,
      executionStatus: "SUCCESS",
      clientIp: request.clientIp,
      promptMessage: request.prompt,
    });

    return this.buildExecutionPayload(response, sessionId, model);
  }

  public async streamChat(
    request: ExecutionRequest,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<ExecutionResponse> {
    const startTime = Date.now();
    const sessionId = request.sessionId || randomUUID();
    const model = request.model || "gemini-3.8-flash";
    const { effectiveStrategy, effectiveApiKey, effectiveOAuthToken, activeAccount } =
      this.resolveEffectiveCredentials(request, model);

    sessionRepository.getOrCreateSession(sessionId, model, effectiveStrategy);
    sessionRepository.saveMessage({
      sessionId,
      role: "user",
      content: request.prompt,
      model,
      strategy: effectiveStrategy,
    });

    const client = modelService.getClient();
    let response: ExecutionResponse;
    try {
      response = await client.stream(
        {
          ...request,
          model,
          strategy: effectiveStrategy,
          sessionId,
          apiKey: effectiveApiKey,
          oauthToken: effectiveOAuthToken,
          userId: request.userId || activeAccount?.userEmail,
          userEmail: request.userEmail || activeAccount?.userEmail,
          accountId: request.accountId || activeAccount?.accountId,
        },
        onChunk,
      );
    } catch (err: unknown) {
      if (this.isUnauthorizedError(err) && activeAccount?.authType !== "cli_oauth") {
        accountRepository.deactivateActiveAccount(model);
      }
      const latencyMs = Date.now() - startTime;
      await auditRepository.saveAuditLog({
        correlationId: request.correlationId || randomUUID(),
        traceId: request.traceId,
        spanId: request.spanId,
        sessionId,
        modelId: model,
        actionName: "STREAM_INFERENCE",
        strategyMode: effectiveStrategy,
        latencyMs,
        executionStatus: "FAILED",
        clientIp: request.clientIp,
        promptMessage: request.prompt,
        errorMessage: (err as any)?.message || String(err),
      });
      throw err;
    }

    sessionRepository.saveMessage({
      sessionId,
      role: "assistant",
      content: response.content,
      model: response.model || model,
      strategy: response.strategyUsed || effectiveStrategy,
      tokenCount: response.tokenMetrics?.totalTokens,
      latencyMs: response.latencyMs,
    });

    sessionRepository.updateSessionOnMessage(
      sessionId,
      response.model || model,
      response.strategyUsed || effectiveStrategy,
      request.prompt,
    );

    const latencyMs = response.latencyMs || Date.now() - startTime;
    await auditRepository.saveAuditLog({
      correlationId: request.correlationId || randomUUID(),
      traceId: request.traceId,
      spanId: request.spanId,
      sessionId,
      modelId: response.model || model,
      actionName: "STREAM_INFERENCE",
      strategyMode: response.strategyUsed || effectiveStrategy,
      latencyMs,
      executionStatus: "SUCCESS",
      clientIp: request.clientIp,
      promptMessage: request.prompt,
    });

    return this.buildExecutionPayload(response, sessionId, model);
  }

  private resolveStrategyFromAuthType(requestStrategy?: ExecutionStrategy, authType?: string): ExecutionStrategy {
    if (requestStrategy && requestStrategy !== "api") {
      return requestStrategy;
    }
    if (authType === "cli") return "cli";
    if (authType === "oauth" || authType === "cli_oauth") return "oauth";
    if (authType === "cookie") return "cookie";
    return requestStrategy || "api";
  }

  private resolveEffectiveCredentials(request: ExecutionRequest, model: string) {
    const activeAccount = accountRepository.getActiveAccount(model);
    const effectiveStrategy = this.resolveStrategyFromAuthType(request.strategy, activeAccount?.authType);
    const isOAuth = effectiveStrategy === "oauth";
    return {
      effectiveStrategy,
      effectiveApiKey: isOAuth ? request.apiKey : (request.apiKey || activeAccount?.credentialValue),
      effectiveOAuthToken: isOAuth ? (activeAccount?.credentialValue || request.oauthToken) : request.oauthToken,
      activeAccount,
    };
  }

  private buildExecutionPayload(
    response: ExecutionResponse,
    sessionId: string,
    model: string,
  ): ExecutionResponse {
    const isFallback = Boolean(response.fallbackOccurred || (response.model && response.model !== model));
    const fallbackReason =
      (response.metadata?.fallbackReason as string) ||
      (isFallback
        ? `Authentication token for '${model}' is expired or rejected by cloud provider. Automatically routed to local ${response.model} (${response.fallbackProvider || "Ollama"}).`
        : undefined);

    return {
      ...response,
      sessionId,
      requestedModel: model,
      fallbackOccurred: isFallback,
      fallbackReason,
      fallbackProvider: response.fallbackProvider || (isFallback ? "ollama" : undefined),
    };
  }

  private isUnauthorizedError(err: unknown): boolean {
    if (!err) return false;
    const anyErr = err as any;
    if (anyErr.status === 401 || anyErr.statusCode === 401 || anyErr.status === 403) return true;
    const msg = (anyErr.message || String(err)).toLowerCase();
    return (
      msg.includes("401") ||
      msg.includes("unauthorized") ||
      msg.includes("unauthenticated") ||
      msg.includes("invalid_grant") ||
      msg.includes("invalid api key") ||
      msg.includes("invalid token") ||
      msg.includes("permission_denied")
    );
  }
}

export const inferenceService = new InferenceService();
