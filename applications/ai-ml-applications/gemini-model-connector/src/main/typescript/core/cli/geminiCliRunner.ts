import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { config, environment } from "@/core/config/index.js";
import type { CliExecutionResult, ModelAuth } from "@/domain/index.js";
import { logger } from "@/core/observability/logging/logger.js";
import { tokenResolutionPipeline } from "@/core/config/security/tokenResolver.js";
import { executionStrategyRegistry } from "@/core/cli/executionStrategies.js";
import { requestDeduplicator } from "@/core/resilience/requestDeduplicator.js";
import { circuitBreakerRegistry } from "@/core/resilience/circuitBreaker.js";
import { authorizedFetch } from "@/core/adapters/auth/requestAuthorizer.js";
import {
  AuthScheme,
  ModelFamily,
  AuthType,
  AuthStatusConstant,
  isFallbackModel,
  isCopilotModel,
} from "@/domain/constants/index.js";
import { systemCliLocator } from "@/core/cli/cliLocator.js";
import { modelAuthResolver } from "@/core/adapters/auth/modelAuthResolver.js";
import { authProviderRegistry } from "@/core/adapters/auth/authProvider.js";
import { cliCommandStrategyRegistry } from "@/core/cli/cliCommandStrategy.js";
import { subscriptionManager } from "@/core/subscription/index.js";
import { modelApiStrategyRegistry } from "@/core/api/modelApiStrategy.js";
import { resolveHyperparameters } from "@/core/config/properties/modelProperties.js";

import {
  ExecutePromptOptions,
  IModelRunner,
} from "@/core/cli/modelRunnerInterface.js";

export type { ExecutePromptOptions, IModelRunner };

export class GeminiCliRunner implements IModelRunner {
  private commandPath: string;
  private defaultModel: string;
  private timeoutMs: number;
  private allowMock: boolean;

  constructor(
    commandPath = config.geminiCliCommand,
    defaultModel = config.geminiDefaultModel,
    timeoutMs = config.cliTimeoutMs,
    allowMock = config.allowMockFallback,
  ) {
    this.commandPath = commandPath;
    this.defaultModel = defaultModel;
    this.timeoutMs = timeoutMs;
    this.allowMock = allowMock;
  }

  public isMockAllowed(): boolean {
    return this.allowMock;
  }

  public getDefaultModel(): string {
    return this.defaultModel;
  }

  /**
   * Resolves authentication token using the Chain of Responsibility pipeline.
   * Conforms to STD-COD-005 and resolves model-agnostic API keys dynamically.
   */
  public resolveToken(
    optionsApiKey?: string,
    modelAuth?: ModelAuth | null,
    modelName = this.defaultModel,
  ): string | undefined {
    return tokenResolutionPipeline.resolve({
      explicitApiKey: optionsApiKey,
      modelAuth,
      modelName,
      configApiKey: config.apiKey,
    });
  }

  /**
   * Checks if the CLI binary is available on PATH via Strategy & OOP SystemCliLocator.
   * Conforms to STD-COD-005 and eliminates procedural process.platform checks.
   */
  public isCliAvailable(modelName?: string): boolean {
    const strategy = cliCommandStrategyRegistry.resolve(
      modelName || this.defaultModel,
      this.commandPath,
    );
    const binary = strategy.resolveBinary(this.commandPath);
    return systemCliLocator.isAvailable(binary);
  }

  /**
   * Resolves model-specific auth falling back to default global session via Strategy Pipeline.
   */
  public async getEffectiveModelAuth(
    modelName: string,
  ): Promise<ModelAuth | null> {
    return modelAuthResolver.getEffectiveModelAuth(modelName);
  }

  /**
   * Main execution entry point. Dispatches prompt execution via the Strategy Pattern.
   * Integrates SingleFlight Request Deduplication Queue with User Isolation to guarantee
   * User A's response is NEVER delivered to User B.
   * Conforms to STD-COD-005.
   */
  public async executePrompt(
    options: ExecutePromptOptions,
  ): Promise<CliExecutionResult> {
    const chosenModel = options.model || this.defaultModel;
    const userContext = options.userId || "anonymous";
    const dedupKey = requestDeduplicator.generateKey(
      chosenModel,
      {
        prompt: options.prompt,
        model: chosenModel,
        mode: options.mode,
        systemInstruction: options.systemInstruction,
      },
      userContext,
    );

    return requestDeduplicator.execute(dedupKey, async () => {
      const startTime = performance.now();
      const mode = options.mode || config.geminiExecutionMode || "auto";

      const modelAuth = await this.getEffectiveModelAuth(chosenModel);
      const effectiveToken = this.resolveToken(
        options.apiKey,
        modelAuth,
        chosenModel,
      );

      const strategy = executionStrategyRegistry.get(mode);
      return strategy.execute(this, options, startTime, effectiveToken);
    });
  }

  /**
   * Directly executes prompt against Model REST APIs via ModelApiStrategyRegistry (STD-COD-005).
   * Polymorphic O(1) resolution across Gemini, Copilot, Ollama, Claude, Codex, Cursor without if/else/switch ladders.
   */
  public async executeApi(
    options: ExecutePromptOptions,
    startTime = performance.now(),
  ): Promise<CliExecutionResult> {
    const chosenModel = options.model || this.defaultModel;
    const tier = config.getModelTier(chosenModel);
    const subscription = config.getSubscription(chosenModel, tier);
    const hyperparams = resolveHyperparameters(
      subscription.hyperparameters,
      undefined,
      options.hyperparameters,
    );
    const strategy = modelApiStrategyRegistry.resolve(chosenModel);
    return strategy.execute(options, this, startTime, hyperparams);
  }

  /**
   * Directly executes prompt against GitHub Copilot REST API (https://api.githubcopilot.com/chat/completions).
   * Conforms to GitHub Copilot API specification and OpenAI-compatible chat schema.
   * Protected with Resilience4j-style Circuit Breaker.
   */
  public async executeCopilotApi(
    options: ExecutePromptOptions,
    startTime = performance.now(),
  ): Promise<CliExecutionResult> {
    const { prompt, model, systemInstruction } = options;
    const chosenModel = model || "copilot-chat";
    const apiTag = "COPILOT_API";
    const baseUrl =
      config.getApiBaseUrl("copilot") ||
      config.authEndpoints.copilotApiBaseUrl ||
      "https://api.githubcopilot.com";

    const modelAuth = await this.getEffectiveModelAuth(chosenModel);
    const effectiveToken = this.resolveToken(
      options.apiKey,
      modelAuth,
      chosenModel,
    );
    const circuitBreaker = circuitBreakerRegistry.get(ModelFamily.COPILOT);

    const routingDecision = subscriptionManager.evaluateRouting(
      chosenModel,
      Boolean(effectiveToken),
      0,
      circuitBreaker.isOpen(),
      options.subscriptionPolicy,
    );

    if (routingDecision.switchedTier || routingDecision.isFallback) {
      logger.warn(
        apiTag,
        `Subscription tier policy '${routingDecision.policy}': ${routingDecision.reason || "Fallback triggered"}`,
      );
      return this.executeFallback(
        options,
        startTime,
        routingDecision.reason ||
          `Model '${chosenModel}' switched to freeware tier`,
      );
    }

    const targetModel = chosenModel.includes("gpt-4o")
      ? "gpt-4o"
      : chosenModel.includes("claude")
        ? "claude-3.5-sonnet"
        : chosenModel.includes("o3-mini")
          ? "o3-mini"
          : "gpt-4o";

    const messages: Array<{ role: string; content: string }> = [];
    if (systemInstruction) {
      messages.push({ role: "system", content: systemInstruction });
    }
    messages.push({ role: "user", content: prompt });

    const body = {
      model: targetModel,
      messages,
      temperature: 0.7,
      stream: false,
    };

    logger.api(
      `Invoking GitHub Copilot REST API (model: ${targetModel}, baseUrl: ${baseUrl})`,
      {
        prompt_length: prompt.length,
        has_system_instruction: Boolean(systemInstruction),
      },
      apiTag,
    );

    return circuitBreaker.execute<CliExecutionResult>(
      async (): Promise<CliExecutionResult> => {
        const rawUrl = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
        const res = await fetch(rawUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${effectiveToken}`,
            "Editor-Version": "vscode/1.95.0",
            "Editor-Plugin-Version": "copilot-chat/0.22.0",
            "Openai-Organization": "github-copilot",
            "Copilot-Integration-Id": "vscode-chat",
            "User-Agent": "GitHubCopilotChat/0.22.0",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Copilot API error (${res.status}): ${errorText}`);
        }

        const data = (await res.json()) as any;
        const latencyMs =
          Math.round((performance.now() - startTime) * 100) / 100;
        const text = data.choices?.[0]?.message?.content || "";
        const promptTokens = data.usage?.prompt_tokens || 0;
        const completionTokens = data.usage?.completion_tokens || 0;
        const totalTokens =
          data.usage?.total_tokens || promptTokens + completionTokens;
        const maxTokens = config.getMaxTokens(chosenModel);
        const tokenConsumedPercentage =
          maxTokens > 0
            ? Math.min(
                100,
                Math.round(((totalTokens || 0) / maxTokens) * 10000) / 100,
              )
            : 0;
        const tokenRemainingPercentage = Math.max(
          0,
          Math.round((100 - tokenConsumedPercentage) * 100) / 100,
        );

        let switchedModel: string | undefined;
        let isFallback = options.isFallback || false;
        let fallbackReason: string | undefined;

        if (
          tokenConsumedPercentage >= config.fallbackThresholdPercentage &&
          !isFallbackModel(chosenModel)
        ) {
          switchedModel = config.fallbackModel;
          isFallback = true;
          fallbackReason = `Token consumption reached ${tokenConsumedPercentage}% (threshold: ${config.fallbackThresholdPercentage}%). Switched to fallback model '${config.fallbackModel}' to prevent token exhaustion.`;
          logger.warn("TOKEN_GOVERNANCE", fallbackReason);
        }

        const tier = config.getModelTier(switchedModel || chosenModel);
        logger.info(
          apiTag,
          `Copilot API succeeded in ${latencyMs}ms (model: ${chosenModel}, tier: ${tier}, tokens: ${totalTokens}/${maxTokens} [${tokenConsumedPercentage}%])`,
        );

        return {
          content: text,
          raw_output: JSON.stringify(data),
          stderr: "",
          exit_code: 0,
          latency_ms: latencyMs,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
          max_tokens: maxTokens,
          token_consumed_percentage: tokenConsumedPercentage,
          token_remaining_percentage: tokenRemainingPercentage,
          model: chosenModel,
          runner_type: "api",
          session_id: options.sessionId,
          is_fallback: isFallback,
          fallback_reason: fallbackReason,
          switched_model: switchedModel,
          tier,
          switched_tier: Boolean(
            switchedModel &&
            config.getModelTier(switchedModel) !==
              config.getModelTier(chosenModel),
          ),
          subscription_policy:
            options.subscriptionPolicy || config.subscriptionPolicy,
          account_email: config.getSubscription(
            switchedModel || chosenModel,
            tier,
          ).accountEmail,
          account_name: config.getSubscription(
            switchedModel || chosenModel,
            tier,
          ).accountName,
        };
      },
      async (err: Error): Promise<CliExecutionResult> => {
        logger.warn(
          apiTag,
          `Copilot circuit breaker caught error: ${err.message}. Triggering fallback to local model.`,
        );
        return this.executeFallback(
          options,
          startTime,
          `Copilot circuit breaker / API failure: ${err.message}`,
        );
      },
    );
  }

  /**
   * Directly executes prompt against local fallback model (Ollama) REST API.
   * Leverages Ollama's native /api/generate endpoint with circuit breaker resilience.
   */
  public async executeFallbackApi(
    options: ExecutePromptOptions,
    startTime = performance.now(),
  ): Promise<CliExecutionResult> {
    const { prompt, model, systemInstruction } = options;
    const chosenModel = model || config.fallbackModel || "tinyllama";
    const apiTag = "FALLBACK_API";
    const baseUrl =
      config.getApiBaseUrl(ModelFamily.OLLAMA) ||
      config.getApiBaseUrl(chosenModel) ||
      "http://127.0.0.1:11435";

    const targetModel = chosenModel.startsWith("ollama/")
      ? chosenModel.slice(7)
      : chosenModel;
    const body: Record<string, any> = {
      model: targetModel,
      prompt,
      stream: false,
    };
    if (systemInstruction) {
      body.system = systemInstruction;
    }

    logger.api(
      `Invoking Fallback REST API (model: ${targetModel}, baseUrl: ${baseUrl})`,
      {
        prompt_length: prompt.length,
        has_system_instruction: Boolean(systemInstruction),
      },
      apiTag,
    );

    const circuitBreaker = circuitBreakerRegistry.get(ModelFamily.OLLAMA);

    return circuitBreaker.execute<CliExecutionResult>(
      async (): Promise<CliExecutionResult> => {
        const rawUrl = `${baseUrl}/api/generate`;
        const res = await fetch(rawUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(
            `Fallback model API error (${res.status}): ${errorText}`,
          );
        }

        const data = (await res.json()) as any;
        const latencyMs =
          Math.round((performance.now() - startTime) * 100) / 100;
        const text = data.response || "";
        const promptTokens = data.prompt_eval_count || 0;
        const completionTokens = data.eval_count || 0;
        const totalTokens = promptTokens + completionTokens;
        const maxTokens = config.getMaxTokens(chosenModel);
        const tokenConsumedPercentage =
          maxTokens > 0
            ? Math.min(
                100,
                Math.round(((totalTokens || 0) / maxTokens) * 10000) / 100,
              )
            : 0;
        const tokenRemainingPercentage = Math.max(
          0,
          Math.round((100 - tokenConsumedPercentage) * 100) / 100,
        );

        const tier = config.getModelTier(chosenModel);
        logger.info(
          apiTag,
          `Fallback API succeeded in ${latencyMs}ms (model: ${chosenModel}, tier: ${tier}, tokens: ${totalTokens}/${maxTokens} [${tokenConsumedPercentage}%])`,
        );

        return {
          content: text,
          raw_output: JSON.stringify(data),
          stderr: "",
          exit_code: 0,
          latency_ms: latencyMs,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
          max_tokens: maxTokens,
          token_consumed_percentage: tokenConsumedPercentage,
          token_remaining_percentage: tokenRemainingPercentage,
          model: chosenModel,
          runner_type: "api",
          session_id: options.sessionId,
          is_fallback: options.isFallback || false,
          tier: config.getModelTier(chosenModel),
          account_email: config.getSubscription(
            chosenModel,
            config.getModelTier(chosenModel),
          ).accountEmail,
          account_name: config.getSubscription(
            chosenModel,
            config.getModelTier(chosenModel),
          ).accountName,
        };
      },
      async (err: Error): Promise<CliExecutionResult> => {
        logger.warn(
          apiTag,
          `Fallback Circuit Breaker caught error: ${err.message}`,
        );
        if (this.allowMock) {
          logger.warn(apiTag, "Falling back to simulator for fallback model.");
          return this.executeMock(options, startTime);
        }
        throw err;
      },
    );
  }

  public async executeOllamaApi(
    options: ExecutePromptOptions,
    startTime = performance.now(),
  ): Promise<CliExecutionResult> {
    return this.executeFallbackApi(options, startTime);
  }

  /**
   * Executes a prompt via CLI Command Strategy Pattern.
   * Dynamically supports Gemini, Claude, Codex, Cursor, and Copilot CLI tools.
   */
  public async executeCli(
    options: ExecutePromptOptions,
    startTime = performance.now(),
  ): Promise<CliExecutionResult> {
    const { prompt, model, systemInstruction, contextFiles, inputStream } =
      options;
    const chosenModel = model || this.defaultModel;
    const strategy = cliCommandStrategyRegistry.resolve(
      chosenModel,
      this.commandPath,
    );
    const resolvedBinary = strategy.resolveBinary(this.commandPath);
    const logTag = `${strategy.family.toUpperCase()}_CLI`;

    logger.cli(
      `Invoking ${strategy.family.toUpperCase()} CLI (model: ${chosenModel}, binary: ${resolvedBinary})`,
      {
        prompt_length: prompt.length,
        has_system_instruction: Boolean(systemInstruction),
        context_files: contextFiles?.length || 0,
      },
      logTag,
    );

    // If CLI is not present on the host environment and fallback is allowed
    if (!systemCliLocator.isAvailable(resolvedBinary)) {
      logger.warn(
        logTag,
        `Executable '${resolvedBinary}' not found on PATH. Triggering fallback to local Ollama.`,
      );
      return this.executeFallback(
        options,
        startTime,
        `CLI executable '${resolvedBinary}' not found on PATH`,
      );
    }

    const args = strategy.buildCommandArgs(
      resolvedBinary,
      chosenModel,
      prompt,
      options,
    );

    // Prepare child environment with API keys and workspace trust settings
    const baseEnv: NodeJS.ProcessEnv = {
      ...(environment.getAllProperties() as NodeJS.ProcessEnv),
      NO_COLOR: "true",
    };

    const modelAuth = await this.getEffectiveModelAuth(chosenModel);
    const isOAuth =
      modelAuth?.status === AuthStatusConstant.AUTHENTICATED &&
      modelAuth.auth_type === AuthType.OAUTH_GOOGLE;
    const apiKey = this.resolveToken(options.apiKey, modelAuth, chosenModel);

    if (isOAuth) {
      await authProviderRegistry
        .getProvider(modelAuth.model)
        .syncCredentials(modelAuth);
    }

    const env = strategy.prepareEnvironment(baseEnv, apiKey);

    return new Promise((resolve, reject) => {
      // Spawn without shell to prevent shell injection (CWE-78)
      const child = spawn(resolvedBinary, args, {
        cwd: options.cwd || process.cwd(),
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const cleanup = () => {
        clearTimeout(timer);
        try {
          child.stdout?.removeAllListeners();
          child.stderr?.removeAllListeners();
          child.removeAllListeners();
          child.stdout?.destroy();
          child.stderr?.destroy();
          child.stdin?.destroy();
        } catch {
          // Ignore stream destruction errors
        }
      };

      const timer = setTimeout(() => {
        timedOut = true;
        cleanup();
        child.kill("SIGKILL");
        reject(
          new Error(
            `${strategy.family.toUpperCase()} CLI process exceeded timeout of ${this.timeoutMs}ms`,
          ),
        );
      }, this.timeoutMs);

      if (inputStream && child.stdin) {
        child.stdin.write(inputStream);
        child.stdin.end();
      } else if (child.stdin) {
        child.stdin.end();
      }

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("error", (err) => {
        cleanup();
        logger.warn(
          logTag,
          `Spawn error (${err.message}). Triggering fallback to local Ollama.`,
        );
        resolve(
          this.executeFallback(
            options,
            startTime,
            `Spawn error: ${err.message}`,
          ),
        );
      });

      child.on("close", (code) => {
        cleanup();
        if (timedOut) return;

        const latencyMs =
          Math.round((performance.now() - startTime) * 100) / 100;
        const parsed = strategy.parseOutput(stdout, stderr, code ?? 0);
        let content = parsed.content;
        const promptTokens = parsed.promptTokens;
        const completionTokens = parsed.completionTokens;
        const totalTokens = parsed.totalTokens;
        const isError = (code ?? 0) !== 0;
        const errorMessage = stderr.trim();

        if (isError || !content) {
          if (
            options.resume &&
            (errorMessage.toLowerCase().includes("session") ||
              errorMessage.toLowerCase().includes("not found"))
          ) {
            logger.warn(
              logTag,
              `Session '${options.sessionId}' was not found in CLI cache. Retrying with full prompt.`,
            );
            resolve(this.executeCli({ ...options, resume: false }, startTime));
            return;
          }
          logger.warn(
            logTag,
            `${strategy.family.toUpperCase()} CLI exited with code ${code ?? 0} (${errorMessage || "Empty response"}). Triggering fallback to local Ollama.`,
          );
          resolve(
            this.executeFallback(
              options,
              startTime,
              `CLI exit code ${code}: ${errorMessage || "Empty response"}`,
            ),
          );
          return;
        }

        const maxTokens = config.getMaxTokens(chosenModel);
        const tokenConsumedPercentage =
          maxTokens > 0
            ? Math.min(
                100,
                Math.round(((totalTokens || 0) / maxTokens) * 10000) / 100,
              )
            : 0;
        const tokenRemainingPercentage = Math.max(
          0,
          Math.round((100 - tokenConsumedPercentage) * 100) / 100,
        );

        let switchedModel: string | undefined;
        let isFallback = options.isFallback || false;
        let fallbackReason: string | undefined;

        if (
          tokenConsumedPercentage >= config.fallbackThresholdPercentage &&
          !isFallbackModel(chosenModel)
        ) {
          switchedModel = config.fallbackModel;
          isFallback = true;
          fallbackReason = `Token consumption reached ${tokenConsumedPercentage}% (threshold: ${config.fallbackThresholdPercentage}%). Switched to fallback model '${config.fallbackModel}' to prevent token exhaustion.`;
          logger.warn("TOKEN_GOVERNANCE", fallbackReason);
        }

        const tier = config.getModelTier(switchedModel || chosenModel);
        logger.cli(
          `${strategy.family.toUpperCase()} CLI completed in ${latencyMs}ms (exit code: ${code ?? 0}, tier: ${tier})`,
          {
            model: chosenModel,
            tier,
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: totalTokens,
            token_consumed_percentage: tokenConsumedPercentage,
          },
          logTag,
        );

        resolve({
          content,
          raw_output: stdout,
          stderr: stderr.trim(),
          exit_code: code ?? 0,
          latency_ms: latencyMs,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
          max_tokens: maxTokens,
          token_consumed_percentage: tokenConsumedPercentage,
          token_remaining_percentage: tokenRemainingPercentage,
          model: chosenModel,
          runner_type: "cli",
          session_id: parsed.sessionId || options.sessionId,
          is_fallback: isFallback,
          fallback_reason: fallbackReason,
          switched_model: switchedModel,
          tier: config.getModelTier(switchedModel || chosenModel),
          switched_tier: Boolean(
            switchedModel &&
            config.getModelTier(switchedModel) !==
              config.getModelTier(chosenModel),
          ),
          subscription_policy:
            options.subscriptionPolicy || config.subscriptionPolicy,
          account_email: config.getSubscription(
            switchedModel || chosenModel,
            config.getModelTier(switchedModel || chosenModel),
          ).accountEmail,
          account_name: config.getSubscription(
            switchedModel || chosenModel,
            config.getModelTier(switchedModel || chosenModel),
          ).accountName,
        });
      });
    });
  }

  /**
   * Fallback model execution.
   * Fallback model MUST be Ollama running locally.
   * Eliminates static simulation mock in favor of real local Ollama inference.
   */
  public async executeFallback(
    options: ExecutePromptOptions,
    startTime = performance.now(),
    reason = "Execution failure",
  ): Promise<CliExecutionResult> {
    const fallbackModel = config.fallbackModel || "tinyllama";
    const chosenModel = options.model || this.defaultModel;
    const isAlreadyFallback =
      options.isFallback || isFallbackModel(chosenModel);

    if (isAlreadyFallback) {
      if (this.allowMock) {
        logger.warn(
          "FALLBACK",
          `Local fallback model '${fallbackModel}' already attempted or failed. Falling back to simulator.`,
        );
        return this.executeMock(options, startTime);
      }
      throw new Error(
        `Fallback execution failed for model '${chosenModel}': ${reason}`,
      );
    }

    logger.warn(
      "FALLBACK",
      `Triggering fallback to local model '${fallbackModel}' (Reason: ${reason})`,
    );
    const fallbackResult = await this.executeFallbackApi(
      {
        ...options,
        model: fallbackModel,
        isFallback: true,
      },
      startTime,
    );

    return {
      ...fallbackResult,
      is_fallback: true,
      fallback_reason: reason,
      switched_model: fallbackModel,
      tier: config.getModelTier(fallbackModel),
      switched_tier: true,
      subscription_policy:
        options.subscriptionPolicy || config.subscriptionPolicy,
      account_email: config.getSubscription(
        fallbackModel,
        config.getModelTier(fallbackModel),
      ).accountEmail,
      account_name: config.getSubscription(
        fallbackModel,
        config.getModelTier(fallbackModel),
      ).accountName,
    };
  }

  /**
   * Generative simulation fallback providing realistic responses and token tracking when CLI/API is offline.
   * Strictly permitted only during testcases per architecture directives.
   */
  public async executeMock(
    options: ExecutePromptOptions,
    startTime = performance.now(),
  ): Promise<CliExecutionResult> {
    const isTestEnv = process.env.NODE_ENV === "test";
    if (!isTestEnv && !this.allowMock && options.mode !== "mock") {
      throw new Error(
        "Mock responses are strictly permitted only during test cases.",
      );
    }
    const { prompt, model, systemInstruction } = options;
    const chosenModel = model || this.defaultModel;

    // Simulate realistic processing delay
    await new Promise((r) => setTimeout(r, 60));
    const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;
    const promptTokens =
      prompt.split(/\s+/).length +
      (systemInstruction ? systemInstruction.split(/\s+/).length : 0);

    const pLower = prompt.toLowerCase();
    let content = "";

    if (
      pLower.includes("job search") ||
      pLower.includes("resume") ||
      pLower.includes("requirement") ||
      pLower.includes("json")
    ) {
      const mockAnalysis = {
        job_analysis: {
          job_title: "Senior AI & Full-Stack Systems Engineer",
          company_name: "Cognitive Cloud Dynamics",
          location: "Remote / Hybrid",
          required_skills: [
            "Node.js",
            "TypeScript",
            "FastAPI",
            "Docker",
            "REST APIs",
            "SQLite / PostgreSQL",
          ],
          preferred_skills: [
            "Google Gemini CLI",
            "Google Gemini API",
            "Model Context Protocol (MCP)",
            "LangGraph",
          ],
          key_responsibilities: [
            "Develop high-performance Node.js and Python microservices integrating Google Gemini API & CLI",
            "Design audit-compliant persistence schemas for conversational AI logs and metrics",
            "Implement automated job-search agents and resume alignment algorithms with markdown generation",
          ],
          experience_level: "4+ years",
        },
        resume_match: {
          match_score_percentage: 94.0,
          matched_skills: [
            "Node.js",
            "TypeScript",
            "Docker",
            "REST APIs",
            "SQLite",
            "Gemini Model Connectors",
          ],
          missing_skills: ["Playwright automation workflows"],
          summary_evaluation:
            "Exceptional alignment. Candidate possesses deep hands-on expertise in building production Node.js server connectors, SQLite audit logging, and Gemini API/CLI subprocess automation.",
          tailored_highlights: [
            "Engineered containerized Node.js service communicating with Google Gemini API & CLI with sub-second response times.",
            "Architected immutable SQLite audit logging storing complete API interaction traces, token counts, and conversation contexts.",
            "Constructed dynamic job-search agent transforming HTML, screenshots, and URLs into structured markdown documents.",
          ],
          recommended_modifications: [
            {
              section: "Summary of Qualifications",
              recommendation:
                "Spotlight containerized Node.js architecture and direct Gemini API/CLI integration.",
            },
            {
              section: "Core Technical Competencies",
              recommendation:
                "Add explicit entry for Google Gemini API, Gemini CLI, and ModelBox orchestration.",
            },
          ],
        },
      };
      content = JSON.stringify(mockAnalysis, null, 2);
    } else {
      content = `Hello! I am your Google Gemini assistant running through the Node.js Gemini Model Connector.

I received your prompt using model \`${chosenModel}\`.
All conversation turns, context documents, and tokens are securely persisted to the SQLite database for audit compliance and UI inspection.

How can I assist you with your AI agent workflows, model connectors, or job application alignment today?`;
    }

    const completionTokens = content.split(/\s+/).length;
    const totalTokens = promptTokens + completionTokens;
    const maxTokens = config.getMaxTokens(chosenModel);
    const tokenConsumedPercentage =
      maxTokens > 0
        ? Math.min(
            100,
            Math.round(((totalTokens || 0) / maxTokens) * 10000) / 100,
          )
        : 0;
    const tokenRemainingPercentage = Math.max(
      0,
      Math.round((100 - tokenConsumedPercentage) * 100) / 100,
    );

    return {
      content,
      raw_output: content,
      stderr: "",
      exit_code: 0,
      latency_ms: latencyMs,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      max_tokens: maxTokens,
      token_consumed_percentage: tokenConsumedPercentage,
      token_remaining_percentage: tokenRemainingPercentage,
      model: chosenModel,
      runner_type: "mock",
      session_id: options.sessionId,
      tier: config.getModelTier(chosenModel),
    };
  }
}
