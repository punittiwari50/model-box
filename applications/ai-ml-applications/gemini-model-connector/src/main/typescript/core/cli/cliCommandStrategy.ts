import fs from "node:fs";
import { config } from "@/core/config/index.js";
import {
  ModelCatalog,
  ModelFamily,
  GEMINI_MODELS,
  CLAUDE_MODELS,
  OPENAI_MODELS,
  OLLAMA_MODELS,
  GROK_MODELS,
  isFallbackModel,
} from "@/domain/constants/index.js";
import type { ExecutePromptOptions } from "@/core/cli/modelRunnerInterface.js";

export interface CliParsedOutput {
  readonly content: string;
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly totalTokens?: number;
  readonly sessionId?: string;
}

export interface ICliCommandStrategy {
  readonly family: string;
  supports(model: string, commandPath?: string): boolean;
  resolveBinary(defaultCommand?: string): string;
  buildCommandArgs(
    command: string,
    model: string,
    prompt: string,
    options: ExecutePromptOptions,
  ): string[];
  prepareEnvironment(
    baseEnv: NodeJS.ProcessEnv,
    apiKey?: string,
  ): NodeJS.ProcessEnv;
  parseOutput(
    rawStdout: string,
    rawStderr: string,
    exitCode: number,
  ): CliParsedOutput;
}

/**
 * Google Gemini CLI Execution Strategy.
 */
export class GeminiCliStrategy implements ICliCommandStrategy {
  public readonly family = ModelFamily.GEMINI;
  private readonly supportedKeys = new Set<string>([
    ModelFamily.GEMINI,
    ModelFamily.GOOGLE,
    ModelCatalog.DEFAULT,
    ...GEMINI_MODELS,
  ]);

  public supports(model: string, commandPath?: string): boolean {
    const key = model.toLowerCase();
    const cmd = commandPath?.toLowerCase() || "";
    return this.supportedKeys.has(key) || cmd.includes(ModelFamily.GEMINI);
  }

  public resolveBinary(defaultCommand = ModelFamily.GEMINI): string {
    return config.getCliCommand(ModelFamily.GEMINI) || defaultCommand;
  }

  public buildCommandArgs(
    _command: string,
    model: string,
    prompt: string,
    options: ExecutePromptOptions,
  ): string[] {
    const args: string[] = [];
    if (model) {
      args.push("-m", model);
    }
    args.push("--skip-trust", "-o", "json");

    // Support resuming session via Gemini CLI --resume <sessionId>
    if (options.resume && options.sessionId) {
      args.push("--resume", options.sessionId);
    }

    if (options.contextFiles && options.contextFiles.length > 0) {
      const validFiles = options.contextFiles.filter((f) => fs.existsSync(f));
      if (validFiles.length > 0) {
        args.push("--include-directories", validFiles.join(","));
      }
    }

    let fullPrompt = prompt;
    if (options.systemInstruction && !options.resume) {
      fullPrompt = `System Instruction: ${options.systemInstruction}\n\nUser Request:\n${prompt}`;
    }
    args.push("-p", fullPrompt);
    return args;
  }

  public prepareEnvironment(
    baseEnv: NodeJS.ProcessEnv,
    apiKey?: string,
  ): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      ...baseEnv,
      NO_COLOR: "true",
      GEMINI_CLI_TRUST_WORKSPACE: "true",
    };
    if (apiKey) {
      env.GEMINI_API_KEY = apiKey;
      env.GOOGLE_API_KEY = apiKey;
    }
    return env;
  }

  public parseOutput(rawStdout: string): CliParsedOutput {
    try {
      const jsonStart = rawStdout.indexOf("{");
      const jsonEnd = rawStdout.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        const jsonStr = rawStdout.substring(jsonStart, jsonEnd + 1);
        const parsed = JSON.parse(jsonStr);
        const text =
          parsed.response ||
          parsed.content ||
          parsed.text ||
          parsed.candidates?.[0]?.content?.parts?.[0]?.text;
        const sessionId =
          parsed.sessionId ||
          parsed.session_id ||
          parsed.session?.id ||
          (typeof parsed.session === "string" ? parsed.session : undefined);

        let promptTokens =
          parsed.usage?.prompt_tokens ?? parsed.stats?.tokens?.input;
        let completionTokens =
          parsed.usage?.completion_tokens ??
          parsed.stats?.tokens?.candidates ??
          parsed.stats?.tokens?.output;
        let totalTokens =
          parsed.usage?.total_tokens ?? parsed.stats?.tokens?.total;

        if (parsed.stats?.models) {
          const modelStats = Object.values(parsed.stats.models)[0] as any;
          if (modelStats?.tokens) {
            promptTokens =
              promptTokens ??
              (modelStats.tokens.input || modelStats.tokens.prompt);
            completionTokens =
              completionTokens ??
              (modelStats.tokens.candidates || modelStats.tokens.output);
            totalTokens = totalTokens ?? modelStats.tokens.total;
          }
        }

        if (text) {
          return {
            content: text,
            promptTokens,
            completionTokens,
            totalTokens,
            sessionId,
          };
        }
      }
    } catch {
      // Non-JSON plain text fallback
    }
    return { content: rawStdout.trim() };
  }
}

/**
 * Anthropic Claude CLI Execution Strategy.
 */
export class ClaudeCliStrategy implements ICliCommandStrategy {
  public readonly family = ModelFamily.CLAUDE;
  private readonly supportedKeys = new Set<string>([
    ModelFamily.CLAUDE,
    ModelFamily.ANTHROPIC,
    ...CLAUDE_MODELS,
  ]);

  public supports(model: string, commandPath?: string): boolean {
    const key = model.toLowerCase();
    const cmd = commandPath?.toLowerCase() || "";
    return this.supportedKeys.has(key) || cmd.includes(ModelFamily.CLAUDE);
  }

  public resolveBinary(defaultCommand = ModelFamily.CLAUDE): string {
    return config.getCliCommand(ModelFamily.CLAUDE) || defaultCommand;
  }

  public buildCommandArgs(
    _command: string,
    model: string,
    prompt: string,
    options: ExecutePromptOptions,
  ): string[] {
    const args: string[] = [];
    if (model && model !== ModelFamily.CLAUDE) {
      args.push("--model", model);
    }
    let fullPrompt = prompt;
    if (options.systemInstruction) {
      fullPrompt = `[System: ${options.systemInstruction}]\n\n${prompt}`;
    }
    args.push("-p", fullPrompt);
    return args;
  }

  public prepareEnvironment(
    baseEnv: NodeJS.ProcessEnv,
    apiKey?: string,
  ): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...baseEnv, NO_COLOR: "true" };
    if (apiKey) {
      env.ANTHROPIC_API_KEY = apiKey;
      env.CLAUDE_API_KEY = apiKey;
    }
    return env;
  }

  public parseOutput(rawStdout: string): CliParsedOutput {
    return { content: rawStdout.trim() };
  }
}

/**
 * OpenAI / Codex CLI Execution Strategy.
 */
export class CodexCliStrategy implements ICliCommandStrategy {
  public readonly family = ModelFamily.CODEX;
  private readonly supportedKeys = new Set<string>([
    ModelFamily.CODEX,
    ModelFamily.OPENAI,
    ...OPENAI_MODELS,
  ]);

  public supports(model: string, commandPath?: string): boolean {
    const key = model.toLowerCase();
    const cmd = commandPath?.toLowerCase() || "";
    return this.supportedKeys.has(key) || cmd.includes(ModelFamily.CODEX);
  }

  public resolveBinary(defaultCommand = ModelFamily.CODEX): string {
    return config.getCliCommand(ModelFamily.CODEX) || defaultCommand;
  }

  public buildCommandArgs(
    _command: string,
    model: string,
    prompt: string,
    options: ExecutePromptOptions,
  ): string[] {
    const args: string[] = [];
    if (model) {
      args.push("-m", model);
    }
    let fullPrompt = prompt;
    if (options.systemInstruction) {
      fullPrompt = `System: ${options.systemInstruction}\n\nUser: ${prompt}`;
    }
    args.push("-p", fullPrompt);
    return args;
  }

  public prepareEnvironment(
    baseEnv: NodeJS.ProcessEnv,
    apiKey?: string,
  ): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...baseEnv, NO_COLOR: "true" };
    if (apiKey) {
      env.OPENAI_API_KEY = apiKey;
      env.CODEX_API_KEY = apiKey;
    }
    return env;
  }

  public parseOutput(rawStdout: string): CliParsedOutput {
    return { content: rawStdout.trim() };
  }
}

/**
 * Cursor IDE / Headless Agent Execution Strategy.
 */
export class CursorCliStrategy implements ICliCommandStrategy {
  public readonly family = ModelFamily.CURSOR;

  public supports(model: string, commandPath?: string): boolean {
    const key = model.toLowerCase();
    const cmd = commandPath?.toLowerCase() || "";
    return key.includes(ModelFamily.CURSOR) || cmd.includes(ModelFamily.CURSOR);
  }

  public resolveBinary(defaultCommand = ModelFamily.CURSOR): string {
    return config.getCliCommand(ModelFamily.CURSOR) || defaultCommand;
  }

  public buildCommandArgs(
    _command: string,
    _model: string,
    prompt: string,
    _options?: ExecutePromptOptions,
  ): string[] {
    return ["--prompt", prompt];
  }

  public prepareEnvironment(
    baseEnv: NodeJS.ProcessEnv,
    apiKey?: string,
  ): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...baseEnv };
    if (apiKey) {
      env.CURSOR_API_KEY = apiKey;
    }
    return env;
  }

  public parseOutput(rawStdout: string): CliParsedOutput {
    return { content: rawStdout.trim() };
  }
}

/**
 * GitHub Copilot CLI Execution Strategy.
 */
export class CopilotCliStrategy implements ICliCommandStrategy {
  public readonly family = ModelFamily.COPILOT;

  public supports(model: string, commandPath?: string): boolean {
    const key = model.toLowerCase();
    const cmd = commandPath?.toLowerCase() || "";
    return (
      key.includes(ModelFamily.COPILOT) ||
      cmd.includes(ModelFamily.COPILOT) ||
      cmd.includes("gh-copilot")
    );
  }

  public resolveBinary(defaultCommand = ModelFamily.COPILOT): string {
    return config.getCliCommand(ModelFamily.COPILOT) || defaultCommand;
  }

  public buildCommandArgs(
    _command: string,
    model: string,
    prompt: string,
    options?: ExecutePromptOptions,
  ): string[] {
    const args: string[] = [];
    if (model && model !== ModelFamily.COPILOT) {
      args.push("--model", model);
    }
    let fullPrompt = prompt;
    if (options?.systemInstruction && !options?.resume) {
      fullPrompt = `[System: ${options.systemInstruction}]\n\n${prompt}`;
    }
    args.push("-p", fullPrompt);
    return args;
  }

  public prepareEnvironment(
    baseEnv: NodeJS.ProcessEnv,
    apiKey?: string,
  ): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...baseEnv };
    if (apiKey) {
      env.GITHUB_TOKEN = apiKey;
      env.GH_TOKEN = apiKey;
      env.COPILOT_API_KEY = apiKey;
    }
    return env;
  }

  public parseOutput(rawStdout: string): CliParsedOutput {
    const trimmed = rawStdout.trim();
    try {
      const jsonStart = trimmed.indexOf("{");
      const jsonEnd = trimmed.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        const parsed = JSON.parse(trimmed.substring(jsonStart, jsonEnd + 1));
        const content =
          parsed.content ||
          parsed.response ||
          parsed.message?.content ||
          parsed.choices?.[0]?.message?.content ||
          trimmed;
        const promptTokens = parsed.usage?.prompt_tokens;
        const completionTokens = parsed.usage?.completion_tokens;
        const totalTokens = parsed.usage?.total_tokens;
        return { content, promptTokens, completionTokens, totalTokens };
      }
    } catch {
      // Non-JSON plain text
    }
    return { content: trimmed };
  }
}

/**
 * Generic Fallback CLI Execution Strategy.
 */
export class GenericCliStrategy implements ICliCommandStrategy {
  public readonly family = ModelFamily.GENERIC;

  public supports(): boolean {
    return true; // Fallback matches all unrecognized models
  }

  public resolveBinary(defaultCommand = "model-cli"): string {
    return defaultCommand;
  }

  public buildCommandArgs(
    _command: string,
    _model: string,
    prompt: string,
    _options?: ExecutePromptOptions,
  ): string[] {
    return ["-p", prompt];
  }

  public prepareEnvironment(
    baseEnv: NodeJS.ProcessEnv,
    apiKey?: string,
  ): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...baseEnv };
    if (apiKey) {
      env.MODEL_API_KEY = apiKey;
      env.API_KEY = apiKey;
    }
    return env;
  }

  public parseOutput(rawStdout: string): CliParsedOutput {
    return { content: rawStdout.trim() };
  }
}

/**
 * Ollama Local AI CLI Execution Strategy.
 */
export class OllamaCliStrategy implements ICliCommandStrategy {
  public readonly family = ModelFamily.OLLAMA;
  private readonly supportedKeys = new Set<string>([
    ModelFamily.OLLAMA,
    ...OLLAMA_MODELS,
  ]);

  public supports(model: string, commandPath?: string): boolean {
    const key = model.toLowerCase();
    const cmd = commandPath?.toLowerCase() || "";
    return (
      this.supportedKeys.has(key) ||
      isFallbackModel(key) ||
      cmd.includes(ModelFamily.OLLAMA)
    );
  }

  public resolveBinary(defaultCommand = "ollama"): string {
    return config.getCliCommand(ModelFamily.OLLAMA) || defaultCommand;
  }

  public buildCommandArgs(
    _command: string,
    model: string,
    prompt: string,
    _options?: ExecutePromptOptions,
  ): string[] {
    const targetModel = model.startsWith("ollama/") ? model.slice(7) : model;
    return ["run", targetModel, prompt];
  }

  public prepareEnvironment(baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...baseEnv };
    env.OLLAMA_HOST =
      config.getApiBaseUrl(ModelFamily.OLLAMA) || "127.0.0.1:11435";
    return env;
  }

  public parseOutput(rawStdout: string): CliParsedOutput {
    return { content: rawStdout.trim() };
  }
}

/**
 * xAI Grok CLI Execution Strategy.
 */
export class GrokCliStrategy implements ICliCommandStrategy {
  public readonly family = ModelFamily.GROK;
  private readonly supportedKeys = new Set<string>([
    ModelFamily.GROK,
    ModelFamily.XAI,
    ...GROK_MODELS,
  ]);

  public supports(model: string, commandPath?: string): boolean {
    const key = model.toLowerCase();
    const cmd = commandPath?.toLowerCase() || "";
    return (
      this.supportedKeys.has(key) ||
      key.includes(ModelFamily.GROK) ||
      cmd.includes(ModelFamily.GROK)
    );
  }

  public resolveBinary(defaultCommand = ModelFamily.GROK): string {
    return config.getCliCommand(ModelFamily.GROK) || defaultCommand;
  }

  public buildCommandArgs(
    _command: string,
    model: string,
    prompt: string,
    options: ExecutePromptOptions,
  ): string[] {
    const args: string[] = [];
    if (model) {
      args.push("-m", model);
    }
    let fullPrompt = prompt;
    if (options.systemInstruction) {
      fullPrompt = `[System: ${options.systemInstruction}]\n\n${prompt}`;
    }
    args.push("-p", fullPrompt);
    return args;
  }

  public prepareEnvironment(
    baseEnv: NodeJS.ProcessEnv,
    apiKey?: string,
  ): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...baseEnv, NO_COLOR: "true" };
    if (apiKey) {
      env.XAI_API_KEY = apiKey;
      env.GROK_API_KEY = apiKey;
    }
    return env;
  }

  public parseOutput(rawStdout: string): CliParsedOutput {
    return { content: rawStdout.trim() };
  }
}

/**
 * Extensible CLI Command Strategy Registry (STD-COD-005).
 * Dispatches CLI binary invocations across Gemini, Claude, Codex, Cursor, Copilot, Ollama, and Grok in O(1).
 */
export class CliCommandStrategyRegistry {
  private readonly strategies: ICliCommandStrategy[] = [];
  private readonly fallback = new GenericCliStrategy();

  constructor() {
    this.register(new GeminiCliStrategy());
    this.register(new ClaudeCliStrategy());
    this.register(new CodexCliStrategy());
    this.register(new CursorCliStrategy());
    this.register(new CopilotCliStrategy());
    this.register(new OllamaCliStrategy());
    this.register(new GrokCliStrategy());
    this.register(this.fallback);
  }

  public register(strategy: ICliCommandStrategy): void {
    this.strategies.push(strategy);
  }

  public resolve(
    model: string = ModelCatalog.DEFAULT,
    commandPath?: string,
  ): ICliCommandStrategy {
    const matched = this.strategies.find((s) => s.supports(model, commandPath));
    return matched || this.fallback;
  }
}

export const cliCommandStrategyRegistry = new CliCommandStrategyRegistry();
