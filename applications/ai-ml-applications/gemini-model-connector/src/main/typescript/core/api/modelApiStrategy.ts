import { performance } from 'node:perf_hooks';
import { config } from '@/core/config/index.js';
import { circuitBreakerRegistry } from '@/core/resilience/circuitBreaker.js';
import { logger } from '@/core/observability/logging/logger.js';
import { subscriptionManager } from '@/core/subscription/subscriptionManager.js';
import {
  AuthScheme,
  ModelFamily,
  AuthType,
  AuthStatusConstant,
  isFallbackModel,
} from '@/domain/constants/index.js';
import type { CliExecutionResult } from '@/domain/index.js';
import type { ExecutePromptOptions, IModelRunner } from '@/core/cli/modelRunnerInterface.js';
import type { ModelHyperparameters } from '@/core/config/properties/modelProperties.js';
import { authorizedFetch } from '@/core/adapters/auth/requestAuthorizer.js';

export interface IModelApiStrategy {
  readonly family: string;
  supports(model: string): boolean;
  execute(
    options: ExecutePromptOptions,
    runner: IModelRunner,
    startTime: number,
    hyperparams: ModelHyperparameters
  ): Promise<CliExecutionResult>;
}

function calculateTokenMetrics(
  totalTokens: number | undefined,
  maxTokens: number,
  chosenModel: string,
  options: ExecutePromptOptions
) {
  const tokenConsumedPercentage =
    maxTokens > 0
      ? Math.min(100, Math.round(((totalTokens || 0) / maxTokens) * 10000) / 100)
      : 0;
  const tokenRemainingPercentage = Math.max(
    0,
    Math.round((100 - tokenConsumedPercentage) * 100) / 100
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
    logger.warn('TOKEN_GOVERNANCE', fallbackReason);
  }

  return {
    tokenConsumedPercentage,
    tokenRemainingPercentage,
    switchedModel,
    isFallback,
    fallbackReason,
  };
}

/**
 * Google Gemini Generative Language REST API Strategy.
 */
export class GeminiApiStrategy implements IModelApiStrategy {
  public readonly family = ModelFamily.GEMINI;

  public supports(model: string): boolean {
    const lower = (model || '').toLowerCase();
    return lower.includes(ModelFamily.GEMINI) || lower.includes(ModelFamily.GOOGLE) || lower === 'default';
  }

  public async execute(
    options: ExecutePromptOptions,
    runner: IModelRunner,
    startTime: number,
    hyperparams: ModelHyperparameters
  ): Promise<CliExecutionResult> {
    const { prompt, model, systemInstruction } = options;
    const chosenModel = model || runner.getDefaultModel();
    const apiTag = `${chosenModel.split(/[-_]/)[0].toUpperCase()}_API`;
    const circuitBreaker = circuitBreakerRegistry.get(ModelFamily.GEMINI);

    const modelAuth = await (runner as any).getEffectiveModelAuth?.(chosenModel);
    const isOAuth = modelAuth?.status === AuthStatusConstant.AUTHENTICATED && modelAuth.auth_type === AuthType.OAUTH_GOOGLE;
    const effectiveToken = (runner as any).resolveToken?.(options.apiKey, modelAuth, chosenModel);

    const routingDecision = subscriptionManager.evaluateRouting(
      chosenModel,
      Boolean(effectiveToken),
      0,
      circuitBreaker.isOpen(),
      options.subscriptionPolicy
    );

    if (routingDecision.switchedTier || routingDecision.isFallback) {
      logger.warn(apiTag, `Subscription tier policy '${routingDecision.policy}': ${routingDecision.reason || 'Fallback triggered'}`);
      return runner.executeFallback(options, startTime, routingDecision.reason || `Model '${chosenModel}' switched to freeware tier`);
    }

    const scheme = isOAuth && effectiveToken && !effectiveToken.startsWith('AIzaSy')
      ? AuthScheme.BEARER
      : AuthScheme.GOOGLE_API_KEY;

    const body: Record<string, any> = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: hyperparams.temperature,
        topP: hyperparams.topP,
        maxOutputTokens: hyperparams.maxOutputTokens,
      },
    };
    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    return circuitBreaker.execute<CliExecutionResult>(
      async (): Promise<CliExecutionResult> => {
        const rawUrl = `${config.geminiApiBaseUrl}/v1beta/models/${chosenModel}:generateContent`;
        const response = await authorizedFetch(
          rawUrl,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(hyperparams.timeoutMs),
          },
          { scheme, tokenOrKey: effectiveToken, model: chosenModel }
        );

        const data = (await response.json()) as any;
        if (!response.ok) {
          throw new Error(`Model API error: ${data?.error?.message || response.statusText}`);
        }

        const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;
        const candidate = data.candidates?.[0];
        const text = candidate?.content?.parts?.map((p: any) => p.text).join('\n') || '';
        const usage = data.usageMetadata || {};
        const promptTokens = usage.promptTokenCount;
        const completionTokens = usage.candidatesTokenCount;
        const totalTokens = usage.totalTokenCount;
        const maxTokens = config.getMaxTokens(chosenModel);

        const metrics = calculateTokenMetrics(totalTokens, maxTokens, chosenModel, options);
        const resolvedModel = metrics.switchedModel || chosenModel;
        const tier = config.getModelTier(resolvedModel);

        return {
          content: text,
          raw_output: JSON.stringify(data),
          stderr: '',
          exit_code: 0,
          latency_ms: latencyMs,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
          max_tokens: maxTokens,
          token_consumed_percentage: metrics.tokenConsumedPercentage,
          token_remaining_percentage: metrics.tokenRemainingPercentage,
          model: chosenModel,
          runner_type: 'api',
          session_id: options.sessionId,
          is_fallback: metrics.isFallback,
          fallback_reason: metrics.fallbackReason,
          switched_model: metrics.switchedModel,
          tier,
          switched_tier: Boolean(metrics.switchedModel && config.getModelTier(metrics.switchedModel) !== config.getModelTier(chosenModel)),
          subscription_policy: options.subscriptionPolicy || config.subscriptionPolicy,
          account_email: config.getSubscription(resolvedModel, tier).accountEmail,
          account_name: config.getSubscription(resolvedModel, tier).accountName,
        };
      },
      async (err: Error): Promise<CliExecutionResult> => {
        logger.warn(apiTag, `Circuit breaker error: ${err.message}. Triggering fallback.`);
        return runner.executeFallback(options, startTime, `Circuit breaker / API failure: ${err.message}`);
      }
    );
  }
}

/**
 * GitHub Copilot REST API Strategy.
 */
export class CopilotApiStrategy implements IModelApiStrategy {
  public readonly family = ModelFamily.COPILOT;

  public supports(model: string): boolean {
    const lower = (model || '').toLowerCase();
    return lower.includes(ModelFamily.COPILOT) || lower.includes('gh-copilot');
  }

  public async execute(
    options: ExecutePromptOptions,
    runner: IModelRunner,
    startTime: number,
    hyperparams: ModelHyperparameters
  ): Promise<CliExecutionResult> {
    const { prompt, model, systemInstruction } = options;
    const chosenModel = model || 'copilot-chat';
    const baseUrl = config.getApiBaseUrl(ModelFamily.COPILOT) || 'https://api.githubcopilot.com';
    const circuitBreaker = circuitBreakerRegistry.get(ModelFamily.COPILOT);

    const modelAuth = await (runner as any).getEffectiveModelAuth?.(chosenModel);
    const effectiveToken = (runner as any).resolveToken?.(options.apiKey, modelAuth, chosenModel);

    const messages: Array<{ role: string; content: string }> = [];
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }
    messages.push({ role: 'user', content: prompt });

    const targetModel = chosenModel.includes('claude') ? 'claude-3.5-sonnet' : 'gpt-4o';
    const body = {
      model: targetModel,
      messages,
      temperature: hyperparams.temperature,
      max_tokens: hyperparams.maxOutputTokens,
      stream: false,
    };

    return circuitBreaker.execute<CliExecutionResult>(
      async (): Promise<CliExecutionResult> => {
        const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${effectiveToken}`,
            'Editor-Version': 'vscode/1.95.0',
            'Editor-Plugin-Version': 'copilot-chat/0.22.0',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(hyperparams.timeoutMs),
        });

        if (!res.ok) {
          throw new Error(`Copilot API error (${res.status}): ${await res.text()}`);
        }

        const data = (await res.json()) as any;
        const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;
        const text = data.choices?.[0]?.message?.content || '';
        const promptTokens = data.usage?.prompt_tokens || 0;
        const completionTokens = data.usage?.completion_tokens || 0;
        const totalTokens = data.usage?.total_tokens || promptTokens + completionTokens;
        const maxTokens = config.getMaxTokens(chosenModel);

        const metrics = calculateTokenMetrics(totalTokens, maxTokens, chosenModel, options);
        const resolvedModel = metrics.switchedModel || chosenModel;
        const tier = config.getModelTier(resolvedModel);

        return {
          content: text,
          raw_output: JSON.stringify(data),
          stderr: '',
          exit_code: 0,
          latency_ms: latencyMs,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
          max_tokens: maxTokens,
          token_consumed_percentage: metrics.tokenConsumedPercentage,
          token_remaining_percentage: metrics.tokenRemainingPercentage,
          model: chosenModel,
          runner_type: 'api',
          session_id: options.sessionId,
          is_fallback: metrics.isFallback,
          fallback_reason: metrics.fallbackReason,
          switched_model: metrics.switchedModel,
          tier,
          switched_tier: Boolean(metrics.switchedModel && config.getModelTier(metrics.switchedModel) !== config.getModelTier(chosenModel)),
          subscription_policy: options.subscriptionPolicy || config.subscriptionPolicy,
          account_email: config.getSubscription(resolvedModel, tier).accountEmail,
          account_name: config.getSubscription(resolvedModel, tier).accountName,
        };
      },
      async (err: Error): Promise<CliExecutionResult> => {
        return runner.executeFallback(options, startTime, `Copilot API failure: ${err.message}`);
      }
    );
  }
}

/**
 * Ollama Local AI REST API Strategy.
 */
export class OllamaApiStrategy implements IModelApiStrategy {
  public readonly family = ModelFamily.OLLAMA;

  public supports(model: string): boolean {
    const lower = (model || '').toLowerCase();
    return isFallbackModel(lower) || lower.includes(ModelFamily.OLLAMA);
  }

  public async execute(
    options: ExecutePromptOptions,
    runner: IModelRunner,
    startTime: number,
    hyperparams: ModelHyperparameters
  ): Promise<CliExecutionResult> {
    const { prompt, model, systemInstruction } = options;
    const chosenModel = model || config.fallbackModel;
    const targetModel = chosenModel.startsWith('ollama/') ? chosenModel.slice(7) : chosenModel;
    const baseUrl = config.getApiBaseUrl(ModelFamily.OLLAMA) || 'http://127.0.0.1:11435';
    const circuitBreaker = circuitBreakerRegistry.get(ModelFamily.OLLAMA);

    const body = {
      model: targetModel,
      prompt,
      system: systemInstruction,
      stream: false,
      options: {
        temperature: hyperparams.temperature,
        top_p: hyperparams.topP,
      },
    };

    return circuitBreaker.execute<CliExecutionResult>(
      async (): Promise<CliExecutionResult> => {
        const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(hyperparams.timeoutMs),
        });

        if (!res.ok) {
          throw new Error(`Ollama API error (${res.status}): ${await res.text()}`);
        }

        const data = (await res.json()) as any;
        const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;
        const text = data.response || '';
        const promptTokens = data.prompt_eval_count || 0;
        const completionTokens = data.eval_count || 0;
        const totalTokens = promptTokens + completionTokens;
        const maxTokens = config.getMaxTokens(chosenModel) || 2048;

        return {
          content: text,
          raw_output: JSON.stringify(data),
          stderr: '',
          exit_code: 0,
          latency_ms: latencyMs,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
          max_tokens: maxTokens,
          token_consumed_percentage: 0,
          token_remaining_percentage: 100,
          model: chosenModel,
          runner_type: 'api',
          session_id: options.sessionId,
          is_fallback: true,
          fallback_reason: 'Executed against local Ollama freeware runtime',
          tier: 'freeware',
          subscription_policy: options.subscriptionPolicy || config.subscriptionPolicy,
          account_email: config.getSubscription(chosenModel, 'freeware').accountEmail,
          account_name: config.getSubscription(chosenModel, 'freeware').accountName,
        };
      },
      async (err: Error): Promise<CliExecutionResult> => {
        throw new Error(`Ollama local runtime failed: ${err.message}`);
      }
    );
  }
}

/**
 * Anthropic Claude REST API Strategy.
 */
export class ClaudeApiStrategy implements IModelApiStrategy {
  public readonly family = ModelFamily.CLAUDE;

  public supports(model: string): boolean {
    const lower = (model || '').toLowerCase();
    return lower.includes(ModelFamily.CLAUDE) || lower.includes(ModelFamily.ANTHROPIC);
  }

  public async execute(
    options: ExecutePromptOptions,
    runner: IModelRunner,
    startTime: number,
    hyperparams: ModelHyperparameters
  ): Promise<CliExecutionResult> {
    const { prompt, model, systemInstruction } = options;
    const chosenModel = model || 'claude-3-7-sonnet';
    const baseUrl = config.getApiBaseUrl(ModelFamily.CLAUDE) || 'https://api.anthropic.com';
    const circuitBreaker = circuitBreakerRegistry.get(ModelFamily.CLAUDE);

    const modelAuth = await (runner as any).getEffectiveModelAuth?.(chosenModel);
    const effectiveToken = (runner as any).resolveToken?.(options.apiKey, modelAuth, chosenModel) || process.env.ANTHROPIC_API_KEY || '';

    const body: Record<string, any> = {
      model: chosenModel,
      max_tokens: hyperparams.maxOutputTokens,
      temperature: hyperparams.temperature,
      messages: [{ role: 'user', content: prompt }],
    };
    if (systemInstruction) {
      body.system = systemInstruction;
    }

    return circuitBreaker.execute<CliExecutionResult>(
      async (): Promise<CliExecutionResult> => {
        const res = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': effectiveToken,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(hyperparams.timeoutMs),
        });

        if (!res.ok) {
          throw new Error(`Claude API error (${res.status}): ${await res.text()}`);
        }

        const data = (await res.json()) as any;
        const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;
        const text = data.content?.[0]?.text || '';
        const promptTokens = data.usage?.input_tokens || 0;
        const completionTokens = data.usage?.output_tokens || 0;
        const totalTokens = promptTokens + completionTokens;
        const maxTokens = config.getMaxTokens(chosenModel) || 200000;

        const metrics = calculateTokenMetrics(totalTokens, maxTokens, chosenModel, options);
        const resolvedModel = metrics.switchedModel || chosenModel;
        const tier = config.getModelTier(resolvedModel);

        return {
          content: text,
          raw_output: JSON.stringify(data),
          stderr: '',
          exit_code: 0,
          latency_ms: latencyMs,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
          max_tokens: maxTokens,
          token_consumed_percentage: metrics.tokenConsumedPercentage,
          token_remaining_percentage: metrics.tokenRemainingPercentage,
          model: chosenModel,
          runner_type: 'api',
          session_id: options.sessionId,
          is_fallback: metrics.isFallback,
          fallback_reason: metrics.fallbackReason,
          switched_model: metrics.switchedModel,
          tier,
          switched_tier: Boolean(metrics.switchedModel && config.getModelTier(metrics.switchedModel) !== config.getModelTier(chosenModel)),
          subscription_policy: options.subscriptionPolicy || config.subscriptionPolicy,
          account_email: config.getSubscription(resolvedModel, tier).accountEmail,
          account_name: config.getSubscription(resolvedModel, tier).accountName,
        };
      },
      async (err: Error): Promise<CliExecutionResult> => {
        return runner.executeFallback(options, startTime, `Claude API failure: ${err.message}`);
      }
    );
  }
}

/**
 * OpenAI / Codex REST API Strategy.
 */
export class CodexApiStrategy implements IModelApiStrategy {
  public readonly family = ModelFamily.CODEX;

  public supports(model: string): boolean {
    const lower = (model || '').toLowerCase();
    return lower.includes(ModelFamily.CODEX) || lower.includes('gpt') || lower.includes(ModelFamily.OPENAI);
  }

  public async execute(
    options: ExecutePromptOptions,
    runner: IModelRunner,
    startTime: number,
    hyperparams: ModelHyperparameters
  ): Promise<CliExecutionResult> {
    const { prompt, model, systemInstruction } = options;
    const chosenModel = model || 'gpt-4o';
    const baseUrl = config.getApiBaseUrl(ModelFamily.CODEX) || 'https://api.openai.com/v1';
    const circuitBreaker = circuitBreakerRegistry.get(ModelFamily.CODEX);

    const modelAuth = await (runner as any).getEffectiveModelAuth?.(chosenModel);
    const effectiveToken = (runner as any).resolveToken?.(options.apiKey, modelAuth, chosenModel) || process.env.OPENAI_API_KEY || '';

    const messages: Array<{ role: string; content: string }> = [];
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }
    messages.push({ role: 'user', content: prompt });

    const body = {
      model: chosenModel,
      messages,
      temperature: hyperparams.temperature,
      max_tokens: hyperparams.maxOutputTokens,
      top_p: hyperparams.topP,
      stream: false,
    };

    return circuitBreaker.execute<CliExecutionResult>(
      async (): Promise<CliExecutionResult> => {
        const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${effectiveToken}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(hyperparams.timeoutMs),
        });

        if (!res.ok) {
          throw new Error(`Codex / OpenAI API error (${res.status}): ${await res.text()}`);
        }

        const data = (await res.json()) as any;
        const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;
        const text = data.choices?.[0]?.message?.content || '';
        const promptTokens = data.usage?.prompt_tokens || 0;
        const completionTokens = data.usage?.completion_tokens || 0;
        const totalTokens = data.usage?.total_tokens || promptTokens + completionTokens;
        const maxTokens = config.getMaxTokens(chosenModel) || 128000;

        const metrics = calculateTokenMetrics(totalTokens, maxTokens, chosenModel, options);
        const resolvedModel = metrics.switchedModel || chosenModel;
        const tier = config.getModelTier(resolvedModel);

        return {
          content: text,
          raw_output: JSON.stringify(data),
          stderr: '',
          exit_code: 0,
          latency_ms: latencyMs,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
          max_tokens: maxTokens,
          token_consumed_percentage: metrics.tokenConsumedPercentage,
          token_remaining_percentage: metrics.tokenRemainingPercentage,
          model: chosenModel,
          runner_type: 'api',
          session_id: options.sessionId,
          is_fallback: metrics.isFallback,
          fallback_reason: metrics.fallbackReason,
          switched_model: metrics.switchedModel,
          tier,
          switched_tier: Boolean(metrics.switchedModel && config.getModelTier(metrics.switchedModel) !== config.getModelTier(chosenModel)),
          subscription_policy: options.subscriptionPolicy || config.subscriptionPolicy,
          account_email: config.getSubscription(resolvedModel, tier).accountEmail,
          account_name: config.getSubscription(resolvedModel, tier).accountName,
        };
      },
      async (err: Error): Promise<CliExecutionResult> => {
        return runner.executeFallback(options, startTime, `Codex API failure: ${err.message}`);
      }
    );
  }
}

/**
 * Cursor IDE / Headless Agent REST API Strategy.
 */
export class CursorApiStrategy implements IModelApiStrategy {
  public readonly family = ModelFamily.CURSOR;

  public supports(model: string): boolean {
    const lower = (model || '').toLowerCase();
    return lower.includes(ModelFamily.CURSOR);
  }

  public async execute(
    options: ExecutePromptOptions,
    runner: IModelRunner,
    startTime: number,
    hyperparams: ModelHyperparameters
  ): Promise<CliExecutionResult> {
    const { prompt, model, systemInstruction } = options;
    const chosenModel = model || 'cursor-default';
    const baseUrl = config.getApiBaseUrl(ModelFamily.CURSOR) || 'http://127.0.0.1:20129/v1';
    const circuitBreaker = circuitBreakerRegistry.get(ModelFamily.CURSOR);

    const modelAuth = await (runner as any).getEffectiveModelAuth?.(chosenModel);
    const effectiveToken = (runner as any).resolveToken?.(options.apiKey, modelAuth, chosenModel) || process.env.CURSOR_API_KEY || '';

    const messages: Array<{ role: string; content: string }> = [];
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }
    messages.push({ role: 'user', content: prompt });

    const body = {
      model: chosenModel,
      messages,
      temperature: hyperparams.temperature,
      max_tokens: hyperparams.maxOutputTokens,
      stream: false,
    };

    return circuitBreaker.execute<CliExecutionResult>(
      async (): Promise<CliExecutionResult> => {
        const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${effectiveToken}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(hyperparams.timeoutMs),
        });

        if (!res.ok) {
          throw new Error(`Cursor API error (${res.status}): ${await res.text()}`);
        }

        const data = (await res.json()) as any;
        const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;
        const text = data.choices?.[0]?.message?.content || '';
        const promptTokens = data.usage?.prompt_tokens || 0;
        const completionTokens = data.usage?.completion_tokens || 0;
        const totalTokens = data.usage?.total_tokens || promptTokens + completionTokens;
        const maxTokens = config.getMaxTokens(chosenModel) || 128000;

        const metrics = calculateTokenMetrics(totalTokens, maxTokens, chosenModel, options);
        const resolvedModel = metrics.switchedModel || chosenModel;
        const tier = config.getModelTier(resolvedModel);

        return {
          content: text,
          raw_output: JSON.stringify(data),
          stderr: '',
          exit_code: 0,
          latency_ms: latencyMs,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
          max_tokens: maxTokens,
          token_consumed_percentage: metrics.tokenConsumedPercentage,
          token_remaining_percentage: metrics.tokenRemainingPercentage,
          model: chosenModel,
          runner_type: 'api',
          session_id: options.sessionId,
          is_fallback: metrics.isFallback,
          fallback_reason: metrics.fallbackReason,
          switched_model: metrics.switchedModel,
          tier,
          switched_tier: Boolean(metrics.switchedModel && config.getModelTier(metrics.switchedModel) !== config.getModelTier(chosenModel)),
          subscription_policy: options.subscriptionPolicy || config.subscriptionPolicy,
          account_email: config.getSubscription(resolvedModel, tier).accountEmail,
          account_name: config.getSubscription(resolvedModel, tier).accountName,
        };
      },
      async (err: Error): Promise<CliExecutionResult> => {
        return runner.executeFallback(options, startTime, `Cursor API failure: ${err.message}`);
      }
    );
  }
}

/**
 * xAI Grok REST API Strategy.
 */
export class GrokApiStrategy implements IModelApiStrategy {
  public readonly family = ModelFamily.GROK;

  public supports(model: string): boolean {
    const lower = (model || '').toLowerCase();
    return lower.includes(ModelFamily.GROK) || lower.includes('xai');
  }

  public async execute(
    options: ExecutePromptOptions,
    runner: IModelRunner,
    startTime: number,
    hyperparams: ModelHyperparameters
  ): Promise<CliExecutionResult> {
    const { prompt, model, systemInstruction } = options;
    const chosenModel = model || 'grok-3';
    const baseUrl = config.getApiBaseUrl(ModelFamily.GROK) || 'https://api.x.ai/v1';
    const circuitBreaker = circuitBreakerRegistry.get(ModelFamily.GROK);

    const modelAuth = await (runner as any).getEffectiveModelAuth?.(chosenModel);
    const effectiveToken = (runner as any).resolveToken?.(options.apiKey, modelAuth, chosenModel) || process.env.XAI_API_KEY || process.env.GROK_API_KEY || '';

    const messages: Array<{ role: string; content: string }> = [];
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }
    messages.push({ role: 'user', content: prompt });

    const body = {
      model: chosenModel,
      messages,
      temperature: hyperparams.temperature,
      max_tokens: hyperparams.maxOutputTokens,
      top_p: hyperparams.topP,
      stream: false,
    };

    return circuitBreaker.execute<CliExecutionResult>(
      async (): Promise<CliExecutionResult> => {
        const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${effectiveToken}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(hyperparams.timeoutMs),
        });

        if (!res.ok) {
          throw new Error(`xAI Grok API error (${res.status}): ${await res.text()}`);
        }

        const data = (await res.json()) as any;
        const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;
        const text = data.choices?.[0]?.message?.content || '';
        const promptTokens = data.usage?.prompt_tokens || 0;
        const completionTokens = data.usage?.completion_tokens || 0;
        const totalTokens = data.usage?.total_tokens || promptTokens + completionTokens;
        const maxTokens = config.getMaxTokens(chosenModel) || 131072;

        const metrics = calculateTokenMetrics(totalTokens, maxTokens, chosenModel, options);
        const resolvedModel = metrics.switchedModel || chosenModel;
        const tier = config.getModelTier(resolvedModel);

        return {
          content: text,
          raw_output: JSON.stringify(data),
          stderr: '',
          exit_code: 0,
          latency_ms: latencyMs,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
          max_tokens: maxTokens,
          token_consumed_percentage: metrics.tokenConsumedPercentage,
          token_remaining_percentage: metrics.tokenRemainingPercentage,
          model: chosenModel,
          runner_type: 'api',
          session_id: options.sessionId,
          is_fallback: metrics.isFallback,
          fallback_reason: metrics.fallbackReason,
          switched_model: metrics.switchedModel,
          tier,
          switched_tier: Boolean(metrics.switchedModel && config.getModelTier(metrics.switchedModel) !== config.getModelTier(chosenModel)),
          subscription_policy: options.subscriptionPolicy || config.subscriptionPolicy,
          account_email: config.getSubscription(resolvedModel, tier).accountEmail,
          account_name: config.getSubscription(resolvedModel, tier).accountName,
        };
      },
      async (err: Error): Promise<CliExecutionResult> => {
        return runner.executeFallback(options, startTime, `Grok API failure: ${err.message}`);
      }
    );
  }
}

/**
 * Model API Strategy Registry (STD-PAT-CORE-TYPESCRIPT #1).
 * Polymorphic O(1) dispatching without procedural if/else or switch ladders.
 */
export class ModelApiStrategyRegistry {
  private readonly strategies: IModelApiStrategy[] = [];
  private readonly defaultStrategy = new GeminiApiStrategy();

  constructor() {
    this.strategies.push(new GeminiApiStrategy());
    this.strategies.push(new CopilotApiStrategy());
    this.strategies.push(new OllamaApiStrategy());
    this.strategies.push(new ClaudeApiStrategy());
    this.strategies.push(new CodexApiStrategy());
    this.strategies.push(new CursorApiStrategy());
    this.strategies.push(new GrokApiStrategy());
  }

  public register(strategy: IModelApiStrategy): void {
    this.strategies.unshift(strategy);
  }

  public resolve(model: string): IModelApiStrategy {
    const matched = this.strategies.find((s) => s.supports(model));
    return matched || this.defaultStrategy;
  }
}

export const modelApiStrategyRegistry = new ModelApiStrategyRegistry();
