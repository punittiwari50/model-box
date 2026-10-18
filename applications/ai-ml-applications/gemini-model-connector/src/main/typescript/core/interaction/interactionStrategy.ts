import { conversationService, type ConversationService } from '@/services/conversation/conversationService.js';
import { agentService, type AgentService } from '@/services/agent/agentService.js';
import type { CliExecutionResult } from '@/domain/index.js';
import type { AgentExecution } from '@/domain/dto/agent.dto.js';

/**
 * Supported Interaction Modes.
 */
export const InteractionMode = Object.freeze({
  CONVERSATION: 'conversation',
  AGENT: 'agent',
});

export interface InteractionRequest {
  readonly mode?: 'conversation' | 'agent' | string;
  readonly prompt: string;
  readonly model?: string;
  readonly sessionId?: string;
  readonly systemInstruction?: string;
  readonly contextFiles?: string[];
  readonly apiKey?: string;
  readonly executionMode?: 'auto' | 'api' | 'cli' | 'websocket' | 'mock';
  readonly approvalMode?: 'default' | 'yolo' | 'plan-only';
  readonly sandbox?: boolean;
  readonly skills?: string[];
  readonly agentName?: string;
  readonly subscriptionPolicy?: string;
  readonly hyperparameters?: Record<string, any>;
  readonly [key: string]: any;
}

export interface InteractionResponse {
  readonly mode: 'conversation' | 'agent';
  readonly success: boolean;
  readonly conversationResult?: CliExecutionResult;
  readonly agentResult?: AgentExecution;
  readonly content?: string;
  readonly sessionId?: string;
  readonly agentId?: string;
  readonly [key: string]: any;
}

/**
 * Strategy interface for polymorphic interaction mode execution.
 * Conforms to STD-COD-005, STD-COD-006 (Zero if/switch dispatch).
 */
export interface IInteractionStrategy {
  readonly mode: string;
  supports(mode: string): boolean;
  execute(request: InteractionRequest): Promise<InteractionResponse>;
}

/**
 * Interactive Multi-Turn Conversation Execution Strategy.
 */
export class ConversationInteractionStrategy implements IInteractionStrategy {
  public readonly mode = InteractionMode.CONVERSATION;
  private readonly convService: ConversationService;

  constructor(convService: ConversationService = conversationService) {
    this.convService = convService;
  }

  public supports(mode: string): boolean {
    const lower = (mode || '').toLowerCase();
    return lower === InteractionMode.CONVERSATION || lower === 'chat' || lower === 'dialog';
  }

  public async execute(request: InteractionRequest): Promise<InteractionResponse> {
    const chatResult = await this.convService.chat({
      content: request.prompt,
      model: request.model,
      session_id: request.sessionId,
      api_key: request.apiKey,
      mode: request.executionMode as any,
      system_instruction: request.systemInstruction,
      additional_context: request.contextFiles ? request.contextFiles.join('\n') : undefined,
    });
    return {
      mode: InteractionMode.CONVERSATION,
      success: chatResult.cliResult.exit_code === 0,
      conversationResult: chatResult.cliResult,
      content: chatResult.cliResult.content,
      sessionId: chatResult.cliResult.session_id,
    };
  }
}

/**
 * Autonomous Multi-Step Agent Execution Strategy.
 */
export class AgentInteractionStrategy implements IInteractionStrategy {
  public readonly mode = InteractionMode.AGENT;
  private readonly agtService: AgentService;

  constructor(agtService: AgentService = agentService) {
    this.agtService = agtService;
  }

  public supports(mode: string): boolean {
    const lower = (mode || '').toLowerCase();
    return lower === InteractionMode.AGENT || lower === 'autonomous' || lower === 'task';
  }

  public async execute(request: InteractionRequest): Promise<InteractionResponse> {
    const approvalMode = (request.approvalMode === 'plan-only' ? 'plan' : request.approvalMode) as any;
    const record = await this.agtService.executeTask({
      task: request.prompt || request.agentGoal || '',
      agent_name: request.agentName || 'GeminiAutonomousAgent',
      project: request.project || request.projectName || 'default',
      model: request.model,
      approval_mode: approvalMode,
      sandbox: request.sandbox,
      skills: request.skills,
    });
    return {
      mode: InteractionMode.AGENT,
      success: record.status === 'COMPLETED',
      agentResult: record,
      content: record.result || '',
      agentId: record.id,
    };
  }
}

/**
 * Type-Safe Interaction Mode Strategy Registry.
 * Dispatches conversation vs agent execution in O(1) with zero if/switch conditionals.
 */
export class InteractionStrategyRegistry {
  private readonly strategies = new Map<string, IInteractionStrategy>();
  private readonly defaultStrategy: IInteractionStrategy;

  constructor() {
    const convStrategy = new ConversationInteractionStrategy();
    const agentStrategy = new AgentInteractionStrategy();
    this.defaultStrategy = convStrategy;

    this.register(InteractionMode.CONVERSATION, convStrategy);
    this.register('chat', convStrategy);
    this.register('dialog', convStrategy);
    this.register(InteractionMode.AGENT, agentStrategy);
    this.register('autonomous', agentStrategy);
    this.register('task', agentStrategy);
  }

  public register(modeKey: string, strategy: IInteractionStrategy): void {
    this.strategies.set(modeKey.toLowerCase(), strategy);
  }

  public resolve(mode?: string): IInteractionStrategy {
    const key = (mode || '').toLowerCase();
    return this.strategies.get(key) || this.defaultStrategy;
  }
}

export const interactionStrategyRegistry = new InteractionStrategyRegistry();
