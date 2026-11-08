import { environment, timerUtils, randomUUID } from "@model-box/model-connector-core";
import type { IConnectorStrategy } from "@/strategies/IConnectorStrategy.js";
import {
  ExecutionStrategyType,
  DefaultCliCommand,
  ModelCatalogDefaults,
  GoogleAuthConstants,
  ModelFamily,
} from "@/domain/constants/index.js";
import type {
  ExecutionRequest,
  ExecutionResponse,
  StreamChunk,
} from "@/domain/models/execution.types.js";
import type {
  GeminiOAuthCredentialFile,
  ResolvedGeminiAuthLocation,
} from "@/domain/models/geminiOAuth.types.js";
import { CliProcessManager } from "@/strategies/cli/CliProcessManager.js";
import {
  defaultCliExecutionCoordinator,
  type CliExecutionTicket,
  type ICliExecutionCoordinator,
} from "@/strategies/cli/CliExecutionCoordinator.js";
import {
  defaultUserModelCredentialResolver,
  type IUserModelCredentialResolver,
  type ResolvedUserModelCredential,
} from "@/security/UserModelCredentialResolver.js";
import {
  defaultGeminiCliSessionAuthManager,
  type IGeminiCliSessionAuthManager,
} from "@/auth/GeminiCliSessionAuthManager.js";
import {
  defaultOllamaDockerFallbackConnector,
  type IOllamaDockerFallbackConnector,
} from "@/adapters/OllamaDockerFallbackConnector.js";
import { CliExecutionException } from "@/domain/errors/domainExceptions.js";
import type { ISimulationPolicy } from "@/domain/policies/ISimulationPolicy.js";
import { SimulationPolicyFactory } from "@/domain/policies/SimulationPolicyFactory.js";
import type { IModelPropertyResolverRegistry } from "@/domain/resolvers/ModelPropertyResolverRegistry.js";
import { ModelPropertyResolverRegistry } from "@/domain/resolvers/ModelPropertyResolverRegistry.js";

export class CliConnectorStrategy implements IConnectorStrategy {
  public readonly strategyType = ExecutionStrategyType.CLI;

  constructor(
    private readonly simulationPolicy: ISimulationPolicy = SimulationPolicyFactory.createPolicy(),
    private readonly resolverRegistry: IModelPropertyResolverRegistry = ModelPropertyResolverRegistry.getInstance(),
    private readonly coordinator: ICliExecutionCoordinator = defaultCliExecutionCoordinator,
    private readonly credentialResolver: IUserModelCredentialResolver = defaultUserModelCredentialResolver,
    private readonly ollamaDockerFallback: IOllamaDockerFallbackConnector = defaultOllamaDockerFallbackConnector,
    private readonly sessionAuthManager: IGeminiCliSessionAuthManager = defaultGeminiCliSessionAuthManager,
  ) {}

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
    const enrichedRequest = this.enrichWithUserDatabaseCredentials(request, model);
    const ticket = this.coordinator.createTicket(enrichedRequest, model, correlationId);
    return this.coordinator.executeIsolated(ticket, (activeTicket) =>
      this.executeTicketProcess(enrichedRequest, model, startTime, activeTicket),
    );
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
      requestId: response.requestId,
      taskId: response.taskId,
      userId: response.userId,
    });
    return response;
  }

  private enrichWithUserDatabaseCredentials(
    request: ExecutionRequest,
    model: string,
  ): ExecutionRequest {
    if (request.apiKey || request.oauthToken) {
      return request;
    }
    const dbCred = this.credentialResolver.resolveUserCredential({
      modelId: model,
      userId: request.userId,
      userEmail: request.userEmail,
      accountId: request.accountId,
    });
    if (!dbCred) {
      return request;
    }
    return Object.freeze({
      ...request,
      apiKey: dbCred.oauthToken || dbCred.apiKey,
      oauthToken: dbCred.oauthToken,
      userEmail: request.userEmail || dbCred.userEmail || undefined,
      accountId: request.accountId || dbCred.accountId || undefined,
    });
  }

  private async executeTicketProcess(
    request: ExecutionRequest,
    model: string,
    startTime: number,
    ticket: CliExecutionTicket,
  ): Promise<ExecutionResponse> {
    const { binary, args, env, authLocation } = this.buildCommand(model, request, ticket);
    try {
      const result = await CliProcessManager.executeCommand(
        binary,
        args,
        request.prompt,
        undefined,
        ticket.correlationId,
        env,
      );
      if (authLocation) {
        this.sessionAuthManager.syncUpdatedFileBackToDatabase(authLocation, ticket.accountId);
      }
      return this.buildSuccessResponse(
        result.stdout,
        model,
        startTime,
        ticket.correlationId,
        ticket.sessionId,
      );
    } catch (err: unknown) {
      return this.executeFallback(request, model, startTime, ticket, err);
    }
  }

  private buildCommand(
    model: string,
    request: ExecutionRequest,
    ticket: CliExecutionTicket,
  ): {
    binary: string;
    args: string[];
    env: Readonly<Record<string, string>>;
    authLocation?: ResolvedGeminiAuthLocation;
  } {
    const resolver = this.resolverRegistry.resolve(model);
    const credential = request.oauthToken || request.apiKey;
    const spec = resolver.resolveCliCommand(model, ticket.sessionId, credential);
    const { location, sessionEnv } = this.prepareSessionAuth(ticket, model);
    const mergedBaseEnv = { ...(spec.env || {}), ...(sessionEnv || {}) };
    const isolatedEnv = this.coordinator.buildIsolatedEnv(ticket, mergedBaseEnv);
    const args = this.injectPromptArgs(spec.args, request.prompt);
    return { binary: spec.binary, args, env: isolatedEnv, authLocation: location };
  }

  private injectPromptArgs(specArgs: readonly string[], prompt: string): string[] {
    const args = [...specArgs];
    const pIdx = args.indexOf("-p") !== -1 ? args.indexOf("-p") : args.indexOf("--prompt");
    if (pIdx !== -1 && (args[pIdx + 1] === "" || args[pIdx + 1] === undefined)) {
      args[pIdx + 1] = prompt;
    }
    return args;
  }

  private prepareSessionAuth(
    ticket: CliExecutionTicket,
    model: string,
  ): { location?: ResolvedGeminiAuthLocation; sessionEnv: Record<string, string> } {
    if (!model.toLowerCase().includes(ModelFamily.GEMINI)) {
      return { sessionEnv: {} };
    }
    const dbCred = this.credentialResolver.resolveUserCredential({
      modelId: model,
      userId: ticket.userId,
      userEmail: ticket.userEmail,
      accountId: ticket.accountId,
    });
    if (!dbCred) return { sessionEnv: {} };
    const location = this.sessionAuthManager.resolveCustomAuthLocation(ticket, dbCred);
    const content = dbCred.credentialsFileContent || this.buildFallbackFileContent(dbCred);
    if (content) {
      this.sessionAuthManager.syncCredentialFileToLocation(location, content);
    }
    const sessionEnv = this.sessionAuthManager.buildSessionCliEnvironment(
      location,
      dbCred.tokens as GeminiOAuthCredentialFile | undefined,
      dbCred.oauthToken || dbCred.apiKey,
    );
    return { location, sessionEnv };
  }

  private buildFallbackFileContent(dbCred: ResolvedUserModelCredential): string | undefined {
    const token = dbCred.oauthToken || dbCred.apiKey;
    if (!token) return undefined;
    return this.sessionAuthManager.formatCredentialFileContent({
      access_token: token,
      token_type: "Bearer",
      scope: GoogleAuthConstants.DEFAULT_SCOPES.join(" "),
      expiry_date: Date.now() + 3600 * 1000,
    });
  }

  private buildSuccessResponse(
    stdout: string,
    model: string,
    startTime: number,
    correlationId: string,
    sessionId?: string,
  ): ExecutionResponse {
    const latencyMs = Math.max(0, Math.round(timerUtils.now() - startTime));
    const parsed = this.parseStdout(stdout);
    return {
      content: parsed.content,
      model,
      strategyUsed: ExecutionStrategyType.CLI,
      latencyMs,
      tokenMetrics: {
        promptTokens: parsed.promptTokens,
        completionTokens: parsed.completionTokens,
        totalTokens: parsed.promptTokens + parsed.completionTokens,
      },
      sessionId: sessionId || randomUUID(),
      correlationId,
      timestamp: new Date().toISOString(),
      metadata: { executionSource: "HEADLESS_CLI" },
    };
  }

  private parseStdout(stdout: string): { content: string; promptTokens: number; completionTokens: number } {
    try {
      const parsed = JSON.parse(stdout);
      const text = parsed.response || parsed.content || parsed.text || stdout;
      return {
        content: typeof text === "string" ? text.trim() : JSON.stringify(text),
        promptTokens: parsed.usage?.promptTokens || Math.ceil(stdout.length / 4),
        completionTokens: parsed.usage?.completionTokens || Math.ceil(stdout.length / 4),
      };
    } catch {
      return {
        content: stdout.trim(),
        promptTokens: 15,
        completionTokens: Math.ceil(stdout.length / 4),
      };
    }
  }

  private isSimulationAllowed(): boolean {
    return this.simulationPolicy.isSimulationAllowed();
  }

  private async executeFallback(
    request: ExecutionRequest,
    model: string,
    startTime: number,
    ticket: CliExecutionTicket,
    originalError?: unknown,
  ): Promise<ExecutionResponse> {
    const cliFallback = await this.tryOllamaCliFallback(request, startTime, ticket);
    if (cliFallback) {
      return cliFallback;
    }
    const dockerFallback = await this.ollamaDockerFallback.executeDockerFallback(
      { ...request, strategy: ExecutionStrategyType.CLI },
      startTime,
      ticket.correlationId,
    );
    if (dockerFallback) {
      return { ...dockerFallback, strategyUsed: ExecutionStrategyType.CLI };
    }
    if (!this.isSimulationAllowed()) {
      this.throwStrictCliFailure(model, ticket.correlationId, originalError);
    }
    return this.executeSimulationFallback(request, model, startTime, ticket.correlationId);
  }

  private async tryOllamaCliFallback(
    request: ExecutionRequest,
    startTime: number,
    ticket: CliExecutionTicket,
  ): Promise<ExecutionResponse | null> {
    try {
      const fallbackCommand = environment.getProperty(
        "fallback.cli.command",
        DefaultCliCommand.FALLBACK,
      );
      const fallbackModel = environment.getProperty(
        "fallback.model",
        ModelCatalogDefaults.DEFAULT_FALLBACK_MODEL,
      );
      const env = this.coordinator.buildIsolatedEnv(ticket);
      const result = await CliProcessManager.executeCommand(
        fallbackCommand,
        ["run", fallbackModel, request.prompt],
        undefined,
        undefined,
        ticket.correlationId,
        env,
      );
      if (!result.stdout || result.stdout.trim().length === 0) {
        return null;
      }
      return this.buildSuccessResponse(
        result.stdout,
        fallbackModel,
        startTime,
        ticket.correlationId,
        ticket.sessionId,
      );
    } catch {
      return null;
    }
  }

  private throwStrictCliFailure(
    model: string,
    correlationId: string,
    originalError?: unknown,
  ): never {
    const errorMsg =
      originalError instanceof Error
        ? originalError.message
        : "CLI binary unavailable or failed";
    throw new CliExecutionException(
      `CLI execution failed for '${model}' and simulation mock is disabled (builder: false). ${errorMsg}`,
      -1,
      undefined,
      correlationId,
    );
  }

  private executeSimulationFallback(
    request: ExecutionRequest,
    model: string,
    startTime: number,
    correlationId: string,
  ): ExecutionResponse {
    const latencyMs = Math.max(0, Math.round(timerUtils.now() - startTime));
    const content = this.formatSimulationContent(request.prompt, model);
    return {
      content,
      model,
      strategyUsed: ExecutionStrategyType.CLI,
      latencyMs,
      tokenMetrics: {
        promptTokens: Math.ceil(request.prompt.length / 4),
        completionTokens: Math.ceil(content.length / 4),
        totalTokens: Math.ceil((request.prompt.length + content.length) / 4),
      },
      sessionId: request.sessionId || randomUUID(),
      correlationId,
      timestamp: new Date().toISOString(),
      metadata: { executionSource: "SIMULATION_FALLBACK" },
    };
  }

  private formatSimulationContent(prompt: string, model: string): string {
    const isDateTimePrompt = /date|time|clock|now/i.test(prompt);
    if (isDateTimePrompt) {
      const now = new Date();
      return `Current Date and Time Information:\n- UTC Time: ${now.toUTCString()}\n- ISO 8601: ${now.toISOString()}\n- Local Time: ${now.toLocaleString()}\n- Unix Timestamp: ${now.getTime()} ms\n- Model: ${model}\n- Protocol: Headless CLI Execution\n- Status: Online & Synchronized`;
    }
    const snippet = `${prompt.slice(0, 80)}${prompt.length > 80 ? "..." : ""}`;
    return `[CLI Simulation Mode - ${model}] Successfully processed prompt: "${snippet}" via CLI emulation pipeline.`;
  }
}
