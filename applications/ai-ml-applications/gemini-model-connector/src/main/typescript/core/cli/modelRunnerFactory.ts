import { config } from '@/core/config/index.js';
import { ModelFamily, ModelCatalog } from '@/domain/constants/index.js';
import type { IModelRunner } from '@/core/cli/modelRunnerInterface.js';
import { GeminiCliRunner } from '@/core/cli/geminiCliRunner.js';

/**
 * Concrete Model Runners per Model Family conforming to:
 * - STD-COD-005: Dependency Inversion Principle (DIP) & Factory Pattern
 * - STD-COD-007: SLAP and immutability by default
 */
export class GeminiModelRunner extends GeminiCliRunner {
  constructor() {
    super(
      config.getCliCommand(ModelFamily.GEMINI) || config.geminiCliCommand || 'gemini',
      config.geminiDefaultModel || ModelCatalog.GEMINI_3_5_FLASH
    );
  }
}

export class ClaudeModelRunner extends GeminiCliRunner {
  constructor() {
    super(
      config.getCliCommand(ModelFamily.CLAUDE) || 'claude',
      ModelCatalog.CLAUDE_3_7_SONNET
    );
  }
}

export class CopilotModelRunner extends GeminiCliRunner {
  constructor() {
    super(
      config.getCliCommand(ModelFamily.COPILOT) || 'copilot',
      ModelCatalog.COPILOT_GPT_4O
    );
  }
}

export class CodexModelRunner extends GeminiCliRunner {
  constructor() {
    super(
      config.getCliCommand(ModelFamily.CODEX) || 'codex',
      ModelCatalog.GPT_4O
    );
  }
}

export class CursorModelRunner extends GeminiCliRunner {
  constructor() {
    super(
      config.getCliCommand(ModelFamily.CURSOR) || 'cursor',
      'cursor-small'
    );
  }
}

export class OllamaModelRunner extends GeminiCliRunner {
  constructor() {
    super(
      config.getCliCommand(ModelFamily.OLLAMA) || 'ollama',
      ModelCatalog.LLAMA_3_2
    );
  }
}

export class GrokModelRunner extends GeminiCliRunner {
  constructor() {
    super(
      config.getCliCommand(ModelFamily.GROK) || 'grok',
      ModelCatalog.GROK_2
    );
  }
}

/**
 * Contract for resolving and instantiating Model Runners polymorphically.
 */
export interface IModelRunnerFactory {
  getRunner(modelOrFamily?: string): IModelRunner;
  getDefaultRunner(): IModelRunner;
  createRunner(modelOrFamily?: string): IModelRunner;
}

/**
 * Factory and Registry for Model Runners.
 * Decouples domain services (AgentService, ConversationService, JobSearchService)
 * completely from concrete runner implementations.
 */
export class ModelRunnerFactory implements IModelRunnerFactory {
  private readonly runners = new Map<string, IModelRunner>();
  private readonly defaultRunner: IModelRunner;

  constructor() {
    this.defaultRunner = new GeminiModelRunner();
    this.registerRunners();
  }

  private registerRunners(): void {
    const geminiRunner = this.defaultRunner;
    const claudeRunner = new ClaudeModelRunner();
    const copilotRunner = new CopilotModelRunner();
    const codexRunner = new CodexModelRunner();
    const cursorRunner = new CursorModelRunner();
    const ollamaRunner = new OllamaModelRunner();
    const grokRunner = new GrokModelRunner();

    this.runners.set(ModelFamily.GEMINI, geminiRunner);
    this.runners.set(ModelFamily.GOOGLE, geminiRunner);
    this.runners.set(ModelFamily.CLAUDE, claudeRunner);
    this.runners.set(ModelFamily.ANTHROPIC, claudeRunner);
    this.runners.set(ModelFamily.COPILOT, copilotRunner);
    this.runners.set(ModelFamily.CODEX, codexRunner);
    this.runners.set(ModelFamily.OPENAI, codexRunner);
    this.runners.set(ModelFamily.CURSOR, cursorRunner);
    this.runners.set(ModelFamily.OLLAMA, ollamaRunner);
    this.runners.set(ModelFamily.GROK, grokRunner);
    this.runners.set(ModelFamily.XAI, grokRunner);
  }

  public getRunner(modelOrFamily?: string): IModelRunner {
    if (!modelOrFamily) {
      return this.defaultRunner;
    }

    const family = config.resolveFamilyKey(modelOrFamily).toLowerCase();
    const runner = this.runners.get(family);
    return runner || this.defaultRunner;
  }

  public getDefaultRunner(): IModelRunner {
    return this.defaultRunner;
  }

  public createRunner(modelOrFamily?: string): IModelRunner {
    if (!modelOrFamily) {
      return new GeminiModelRunner();
    }

    const family = config.resolveFamilyKey(modelOrFamily).toLowerCase();
    switch (family) {
      case ModelFamily.CLAUDE:
      case ModelFamily.ANTHROPIC:
        return new ClaudeModelRunner();
      case ModelFamily.COPILOT:
        return new CopilotModelRunner();
      case ModelFamily.CODEX:
      case ModelFamily.OPENAI:
        return new CodexModelRunner();
      case ModelFamily.CURSOR:
        return new CursorModelRunner();
      case ModelFamily.OLLAMA:
        return new OllamaModelRunner();
      case ModelFamily.GROK:
      case ModelFamily.XAI:
        return new GrokModelRunner();
      case ModelFamily.GEMINI:
      case ModelFamily.GOOGLE:
      default:
        return new GeminiModelRunner();
    }
  }
}

export const modelRunnerFactory: IModelRunnerFactory = new ModelRunnerFactory();
export const defaultModelRunner: IModelRunner = modelRunnerFactory.getDefaultRunner();
