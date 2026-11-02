import { randomUUID } from "@model-box/model-connector-core";
import type {
  ExecutionRequest,
  ExecutionResponse,
  StreamChunk,
} from "@model-box/model-connector-client";
import { modelService } from "@/services/modelService";
import { sessionRepository } from "@/repositories/sessionRepository";
import { accountRepository } from "@/repositories/accountRepository";

export class InferenceService {
  public async executeChat(request: ExecutionRequest): Promise<ExecutionResponse> {
    const sessionId = request.sessionId || randomUUID();
    const model = request.model || "gemini-3.8-flash";
    const strategy = request.strategy || "api";

    // 1. Ensure persistent session exists
    sessionRepository.getOrCreateSession(sessionId, model, strategy);

    // 2. Persist incoming user prompt to database
    sessionRepository.saveMessage({
      sessionId,
      role: "user",
      content: request.prompt,
      model,
      strategy,
    });

    // 3. Resolve active account credential for this model if available
    const activeAccount = accountRepository.getActiveAccount(model);
    let effectiveApiKey = request.apiKey;
    if (!effectiveApiKey && activeAccount?.credentialValue) {
      effectiveApiKey = activeAccount.credentialValue;
    }

    const client = modelService.getClient();
    const effectiveRequest: ExecutionRequest = {
      ...request,
      model,
      strategy,
      sessionId,
      apiKey: effectiveApiKey,
      oauthToken: request.oauthToken || (activeAccount?.authType === "cli_oauth" ? activeAccount.credentialValue : undefined),
      userId: request.userId || activeAccount?.userEmail,
      userEmail: request.userEmail || activeAccount?.userEmail,
      accountId: request.accountId || activeAccount?.accountId,
      taskId: request.taskId,
      requestId: request.requestId,
    };

    // 4. Execute inference
    let response: ExecutionResponse;
    try {
      response = await client.execute(effectiveRequest);
    } catch (err: unknown) {
      if (this.isUnauthorizedError(err) && activeAccount?.authType !== "cli_oauth") {
        accountRepository.deactivateActiveAccount(model);
      }
      throw err;
    }

    // 5. Persist assistant response to database
    sessionRepository.saveMessage({
      sessionId,
      role: "assistant",
      content: response.content,
      model: response.model || model,
      strategy: response.strategyUsed || strategy,
      tokenCount: response.tokenMetrics?.totalTokens,
      latencyMs: response.latencyMs,
    });

    // 6. Update session turn count and timestamps
    sessionRepository.updateSessionOnMessage(
      sessionId,
      response.model || model,
      response.strategyUsed || strategy,
      request.prompt,
    );

    return {
      ...response,
      sessionId,
    };
  }

  public async streamChat(
    request: ExecutionRequest,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<ExecutionResponse> {
    const sessionId = request.sessionId || randomUUID();
    const model = request.model || "gemini-3.8-flash";
    const strategy = request.strategy || "api";

    sessionRepository.getOrCreateSession(sessionId, model, strategy);
    sessionRepository.saveMessage({
      sessionId,
      role: "user",
      content: request.prompt,
      model,
      strategy,
    });

    const activeAccount = accountRepository.getActiveAccount(model);
    let effectiveApiKey = request.apiKey;
    if (!effectiveApiKey && activeAccount?.credentialValue) {
      effectiveApiKey = activeAccount.credentialValue;
    }

    const client = modelService.getClient();
    let response: ExecutionResponse;
    try {
      response = await client.stream(
        {
          ...request,
          model,
          strategy,
          sessionId,
          apiKey: effectiveApiKey,
          oauthToken: request.oauthToken || (activeAccount?.authType === "cli_oauth" ? activeAccount.credentialValue : undefined),
          userId: request.userId || activeAccount?.userEmail,
          userEmail: request.userEmail || activeAccount?.userEmail,
          accountId: request.accountId || activeAccount?.accountId,
          taskId: request.taskId,
          requestId: request.requestId,
        },
        onChunk,
      );
    } catch (err: unknown) {
      if (this.isUnauthorizedError(err) && activeAccount?.authType !== "cli_oauth") {
        accountRepository.deactivateActiveAccount(model);
      }
      throw err;
    }

    sessionRepository.saveMessage({
      sessionId,
      role: "assistant",
      content: response.content,
      model: response.model || model,
      strategy: response.strategyUsed || strategy,
      tokenCount: response.tokenMetrics?.totalTokens,
      latencyMs: response.latencyMs,
    });

    sessionRepository.updateSessionOnMessage(
      sessionId,
      response.model || model,
      response.strategyUsed || strategy,
      request.prompt,
    );

    return {
      ...response,
      sessionId,
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
