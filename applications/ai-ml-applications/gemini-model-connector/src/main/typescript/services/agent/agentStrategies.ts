import {
  ModelFamily,
  AgentToolName,
  GEMINI_MODELS,
  CLAUDE_MODELS,
  OPENAI_MODELS,
  COPILOT_MODELS,
  OLLAMA_MODELS,
  GROK_MODELS,
} from '@/domain/constants/index.js';

export interface AgentExecutionContext {
  readonly agentName: string;
  readonly project: string;
  readonly projectDir: string;
  readonly approvalMode: string;
  readonly skills: readonly string[];
  readonly sandbox: boolean;
}

export interface IAgentModelStrategy {
  readonly family: string;
  supports(model: string): boolean;
  getDefaultAgentName(): string;
  getToolName(): string;
  formatSystemInstruction(ctx: AgentExecutionContext): string;
  formatPrompt(task: string, ctx: AgentExecutionContext): string;
  getSupportedSkills(): readonly string[];
}

abstract class BaseAgentModelStrategy implements IAgentModelStrategy {
  public abstract readonly family: string;
  protected abstract readonly supportedKeys: ReadonlySet<string>;

  public supports(model: string): boolean {
    const key = (model || '').toLowerCase();
    return this.supportedKeys.has(key) || key.includes(this.family);
  }

  public abstract getDefaultAgentName(): string;
  public abstract getToolName(): string;
  public abstract getSupportedSkills(): readonly string[];

  public formatSystemInstruction(ctx: AgentExecutionContext): string {
    const skillsList = ctx.skills.length > 0 ? ctx.skills.join(', ') : 'standard-agent-capabilities';
    return (
      `You are ${ctx.agentName}, an autonomous ${this.family.toUpperCase()} engineering agent.\n` +
      `Workspace Scope: ${ctx.project} (Directory: ${ctx.projectDir})\n` +
      `Approval Mode: ${ctx.approvalMode} | Sandbox: ${ctx.sandbox ? 'ENABLED' : 'DISABLED'}\n` +
      `Active Skills: ${skillsList}\n` +
      `Operate autonomously within the workspace. Formulate structured solutions, inspect files, and generate implementation artifacts.`
    );
  }

  public formatPrompt(task: string, ctx: AgentExecutionContext): string {
    return (
      `[Agent Task Execution for Project: ${ctx.project}]\n` +
      `Working Directory: ${ctx.projectDir}\n` +
      `Approval Policy: ${ctx.approvalMode}\n\n` +
      `User Objective:\n${task}\n\n` +
      `Provide step-by-step reasoning, execution details, and actionable engineering deliverables.`
    );
  }
}

/**
 * Google Gemini Autonomous Agent Strategy.
 */
export class GeminiAgentStrategy extends BaseAgentModelStrategy {
  public readonly family = ModelFamily.GEMINI;
  protected readonly supportedKeys = new Set<string>([
    ModelFamily.GEMINI,
    ModelFamily.GOOGLE,
    'default',
    ...GEMINI_MODELS,
  ]);

  public getDefaultAgentName(): string {
    return 'GeminiAutonomousAgent';
  }

  public getToolName(): string {
    return AgentToolName.GEMINI;
  }

  public getSupportedSkills(): readonly string[] {
    return Object.freeze([
      'gemini-code-generation',
      'gemini-workspace-inspector',
      'gemini-artifact-builder',
      'gemini-review-engine',
    ]);
  }
}

/**
 * Anthropic Claude Autonomous Agent Strategy.
 */
export class ClaudeAgentStrategy extends BaseAgentModelStrategy {
  public readonly family = ModelFamily.CLAUDE;
  protected readonly supportedKeys = new Set<string>([
    ModelFamily.CLAUDE,
    ModelFamily.ANTHROPIC,
    ...CLAUDE_MODELS,
  ]);

  public getDefaultAgentName(): string {
    return 'ClaudeAutonomousAgent';
  }

  public getToolName(): string {
    return AgentToolName.CLAUDE;
  }

  public getSupportedSkills(): readonly string[] {
    return Object.freeze([
      'claude-system-architecture',
      'claude-long-context-analysis',
      'claude-safe-tool-use',
      'claude-step-planner',
    ]);
  }
}

/**
 * OpenAI / Codex Autonomous Agent Strategy.
 */
export class CodexAgentStrategy extends BaseAgentModelStrategy {
  public readonly family = ModelFamily.CODEX;
  protected readonly supportedKeys = new Set<string>([
    ModelFamily.CODEX,
    ModelFamily.OPENAI,
    ...OPENAI_MODELS,
  ]);

  public getDefaultAgentName(): string {
    return 'CodexAutonomousAgent';
  }

  public getToolName(): string {
    return AgentToolName.CODEX;
  }

  public getSupportedSkills(): readonly string[] {
    return Object.freeze([
      'codex-python-executor',
      'codex-algorithm-design',
      'codex-security-audit',
      'codex-api-spec',
    ]);
  }
}

/**
 * Cursor IDE Headless Autonomous Agent Strategy.
 */
export class CursorAgentStrategy extends BaseAgentModelStrategy {
  public readonly family = ModelFamily.CURSOR;
  protected readonly supportedKeys = new Set<string>([
    ModelFamily.CURSOR,
    'cursor-default',
  ]);

  public getDefaultAgentName(): string {
    return 'CursorAutonomousAgent';
  }

  public getToolName(): string {
    return AgentToolName.CURSOR;
  }

  public getSupportedSkills(): readonly string[] {
    return Object.freeze([
      'cursor-multi-file-edit',
      'cursor-symbol-indexer',
      'cursor-terminal-runner',
      'cursor-diff-patcher',
    ]);
  }
}

/**
 * GitHub Copilot Autonomous Agent Strategy.
 */
export class CopilotAgentStrategy extends BaseAgentModelStrategy {
  public readonly family = ModelFamily.COPILOT;
  protected readonly supportedKeys = new Set<string>([
    ModelFamily.COPILOT,
    ...COPILOT_MODELS,
  ]);

  public getDefaultAgentName(): string {
    return 'CopilotAutonomousAgent';
  }

  public getToolName(): string {
    return AgentToolName.COPILOT;
  }

  public getSupportedSkills(): readonly string[] {
    return Object.freeze([
      'copilot-code-completion',
      'copilot-test-generation',
      'copilot-refactoring',
      'copilot-pr-review',
    ]);
  }
}

/**
 * Ollama Local AI Autonomous Agent Strategy.
 */
export class OllamaAgentStrategy extends BaseAgentModelStrategy {
  public readonly family = ModelFamily.OLLAMA;
  protected readonly supportedKeys = new Set<string>([
    ModelFamily.OLLAMA,
    ...OLLAMA_MODELS,
  ]);

  public override supports(model: string): boolean {
    const key = (model || '').toLowerCase();
    const isLlama = key.includes('llama') || key.includes('qwen') || key.includes('phi');
    const isDeep = key.includes('deepseek') || key.includes('gemma') || key.includes('nemotron');
    return super.supports(model) || isLlama || isDeep;
  }

  public getDefaultAgentName(): string {
    return 'OllamaAutonomousAgent';
  }

  public getToolName(): string {
    return AgentToolName.OLLAMA;
  }

  public getSupportedSkills(): readonly string[] {
    return Object.freeze([
      'ollama-local-code-exec',
      'ollama-file-analysis',
      'ollama-offline-reasoning',
      'ollama-rag-search',
    ]);
  }
}

/**
 * xAI Grok Autonomous Agent Strategy.
 */
export class GrokAgentStrategy extends BaseAgentModelStrategy {
  public readonly family = ModelFamily.GROK;
  protected readonly supportedKeys = new Set<string>([
    ModelFamily.GROK,
    ModelFamily.XAI,
    ...GROK_MODELS,
  ]);

  public getDefaultAgentName(): string {
    return 'GrokAutonomousAgent';
  }

  public getToolName(): string {
    return AgentToolName.GROK;
  }

  public getSupportedSkills(): readonly string[] {
    return Object.freeze([
      'grok-realtime-reasoning',
      'grok-deep-research',
      'grok-architecture-design',
      'grok-code-synthesis',
    ]);
  }
}

/**
 * Generic Fallback Agent Strategy.
 */
export class GenericAgentStrategy extends BaseAgentModelStrategy {
  public readonly family = ModelFamily.GENERIC;
  protected readonly supportedKeys = new Set<string>([ModelFamily.GENERIC]);

  public override supports(): boolean {
    return true;
  }

  public getDefaultAgentName(): string {
    return 'AutonomousEngineeringAgent';
  }

  public getToolName(): string {
    return AgentToolName.GENERIC;
  }

  public getSupportedSkills(): readonly string[] {
    return Object.freeze([
      'general-code-synthesis',
      'general-file-io',
      'general-reasoning',
    ]);
  }
}

/**
 * Autonomous Agent Strategy Registry (STD-COD-005).
 * Dispatches agent execution behavior across all 7 supported AI model families in O(1).
 */
export class AgentStrategyRegistry {
  private readonly strategies: IAgentModelStrategy[] = [];
  private readonly fallback = new GenericAgentStrategy();

  constructor() {
    this.register(new GeminiAgentStrategy());
    this.register(new ClaudeAgentStrategy());
    this.register(new CodexAgentStrategy());
    this.register(new CursorAgentStrategy());
    this.register(new CopilotAgentStrategy());
    this.register(new OllamaAgentStrategy());
    this.register(new GrokAgentStrategy());
  }

  public register(strategy: IAgentModelStrategy): void {
    this.strategies.push(strategy);
  }

  public resolve(model: string): IAgentModelStrategy {
    const matched = this.strategies.find((s) => s.supports(model));
    return matched || this.fallback;
  }

  public getAllSkills(model?: string): readonly string[] {
    if (model) {
      return this.resolve(model).getSupportedSkills();
    }
    const set = new Set<string>();
    for (const s of this.strategies) {
      for (const skill of s.getSupportedSkills()) {
        set.add(skill);
      }
    }
    return Object.freeze(Array.from(set));
  }
}

export const agentStrategyRegistry = new AgentStrategyRegistry();
