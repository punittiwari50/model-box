import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { conversationRepo, type IConversationRepository } from '@/repositories/conversationRepository.js';
import { auditRepo, AuditRepository } from '@/repositories/auditRepository.js';
import { transactionManager, ITransactionManager } from '@/core/datasource/transactionManager.js';
import type { IModelRunner } from '@/core/cli/modelRunnerInterface.js';
import { modelRunnerFactory, defaultModelRunner, type IModelRunnerFactory } from '@/core/cli/modelRunnerFactory.js';
import type {
  Conversation,
  Message,
  CreateConversationDTO,
  ResumeConversationDTO,
  ChatConversationDTO,
  SendMessageDTO,
  AttachContextDTO,
  CliExecutionResult,
} from '@/domain/index.js';
import { logger } from '@/core/observability/logging/logger.js';
import {
  AuditAction,
  CommonStatus,
  SystemRole,
  ContextType,
  isFallbackModel,
} from '@/domain/constants/index.js';
import { config } from '@/core/config/index.js';
import type { IConversationService } from '@/services/conversation/iConversationService.js';

export class ConversationService implements IConversationService {
  private readonly convRepo: IConversationRepository;
  private readonly auditRepo: AuditRepository;
  private readonly cliRunner: IModelRunner;
  private readonly txManager: ITransactionManager;
  private readonly runnerFactory: IModelRunnerFactory;

  constructor(
    convRepo: IConversationRepository = conversationRepo,
    audit: AuditRepository = auditRepo,
    cliRunner: IModelRunner = defaultModelRunner,
    tx: ITransactionManager = transactionManager,
    runnerFactory: IModelRunnerFactory = modelRunnerFactory
  ) {
    this.convRepo = convRepo;
    this.auditRepo = audit;
    this.cliRunner = cliRunner;
    this.txManager = tx;
    this.runnerFactory = runnerFactory;
  }

  async createConversation(dto: CreateConversationDTO, clientIp?: string): Promise<Conversation> {
    return this.txManager.runInTransaction(async () => {
      const sessionId = dto.session_id || randomUUID();
      const initialMetadata = {
        cli_session_id: sessionId,
        total_turns: 0,
        resumed_count: 0,
        is_resumed: false,
        last_resumed_at: null,
        ...(dto.metadata || {}),
      };

      const conv = await this.convRepo.createConversation({
        session_id: sessionId,
        title: dto.title,
        model: dto.model || config.geminiDefaultModel,
        system_instruction: dto.system_instruction,
        tags: dto.tags || [],
        metadata: initialMetadata,
      });

      if (dto.initial_resume) {
        await this.attachInitialResume(conv.id, dto.initial_resume);
      }

      await this.auditConversationCreate(conv, clientIp);
      return (await this.convRepo.getConversation(conv.id))!;
    });
  }

  private async attachInitialResume(conversationId: string, resumeContent: string): Promise<void> {
    await this.convRepo.addContext({
      conversation_id: conversationId,
      context_type: ContextType.RESUME,
      title: 'Master Candidate Resume',
      content: resumeContent,
      metadata: { source: 'initial_creation' },
    });
  }

  private async auditConversationCreate(conv: Conversation, clientIp?: string): Promise<void> {
    await this.auditRepo.logEvent({
      conversation_id: conv.id,
      action: AuditAction.CONVERSATION_CREATE,
      client_ip: clientIp,
      model_used: conv.model,
      status: CommonStatus.SUCCESS,
      details: { title: conv.title, tags: conv.tags, session_id: conv.session_id },
    });
    logger.info('CONVERSATION', `Created conversation ${conv.id} ("${conv.title}") using model ${conv.model} (session: ${conv.session_id})`);
  }

  async getConversation(id: string): Promise<Conversation | null> {
    return this.convRepo.getConversation(id);
  }

  private async getRequiredConversation(id: string): Promise<Conversation> {
    const conv = await this.convRepo.getConversation(id);
    if (!conv) {
      throw new Error(`Conversation not found: ${id}`);
    }
    return conv;
  }

  async listConversations(limit = 50, offset = 0): Promise<Conversation[]> {
    return this.convRepo.listConversations(limit, offset);
  }

  async deleteConversation(id: string, clientIp?: string): Promise<boolean> {
    return this.txManager.runInTransaction(async () => {
      const success = await this.convRepo.deleteConversation(id);
      if (success) {
        await this.auditRepo.logEvent({
          conversation_id: id,
          action: AuditAction.CONVERSATION_DELETE,
          client_ip: clientIp,
          status: CommonStatus.SUCCESS,
          details: { deleted_id: id },
        });
        logger.info('CONVERSATION', `Deleted conversation ${id}`);
      }
      return success;
    });
  }

  async attachContext(conversationId: string, dto: AttachContextDTO, clientIp?: string) {
    return this.txManager.runInTransaction(async () => {
      const conv = await this.convRepo.getConversation(conversationId);
      if (!conv) {
        throw new Error(`Conversation not found: ${conversationId}`);
      }

      const item = await this.convRepo.addContext({
        conversation_id: conversationId,
        context_type: dto.context_type,
        title: dto.title,
        content: dto.content,
        metadata: dto.metadata || {},
      });

      await this.auditRepo.logEvent({
        conversation_id: conversationId,
        action: AuditAction.CONTEXT_ATTACH,
        client_ip: clientIp,
        status: CommonStatus.SUCCESS,
        details: { context_id: item.id, type: item.context_type, title: item.title },
      });

      logger.info('CONVERSATION', `Attached context [${item.context_type}] "${item.title}" to conversation ${conversationId}`);
      return item;
    });
  }

  /**
   * Resumes an existing conversation session via the Gemini CLI and records audit metadata.
   */
  async resumeConversation(
    conversationId: string,
    dto?: ResumeConversationDTO,
    clientIp?: string
  ): Promise<{ conversation: Conversation; turnResult?: { userMessage: Message; assistantMessage: Message; cliResult: CliExecutionResult } }> {
    const conv = await this.getRequiredConversation(conversationId);
    const currentMeta = (conv.metadata as Record<string, unknown>) || {};
    const resumeCount = Number(currentMeta.resumed_count || 0) + 1;
    const now = new Date().toISOString();

    await this.convRepo.updateMetadata(conversationId, {
      is_resumed: true,
      resumed_count: resumeCount,
      last_resumed_at: now,
    });

    await this.auditRepo.logEvent({
      conversation_id: conversationId,
      action: AuditAction.CONVERSATION_RESUME,
      client_ip: clientIp,
      model_used: conv.model,
      status: CommonStatus.SUCCESS,
      details: { resume_count: resumeCount, session_id: conv.session_id },
    });

    let turnResult: { userMessage: Message; assistantMessage: Message; cliResult: CliExecutionResult } | undefined;
    if (dto?.content) {
      turnResult = await this.sendMessage(conversationId, {
        content: dto.content,
        model: dto.model,
        temperature: dto.temperature,
        additional_context: dto.additional_context,
        api_key: dto.api_key,
        mode: dto.mode,
        resume: true,
      }, clientIp);
    }

    const updated = (await this.convRepo.getConversation(conversationId))!;
    return { conversation: updated, turnResult };
  }

  /**
   * Unified Chat entrypoint: Automatically continues the same chat or initiates a new chat session.
   */
  async chat(
    dto: ChatConversationDTO,
    clientIp?: string
  ): Promise<{ tier: string; conversation: Conversation; userMessage: Message; assistantMessage: Message; cliResult: CliExecutionResult }> {
    if (dto.conversation_id) {
      const turnResult = await this.sendMessage(dto.conversation_id, {
        content: dto.content,
        model: dto.model,
        temperature: dto.temperature,
        additional_context: dto.additional_context,
        api_key: dto.api_key,
        mode: dto.mode,
        resume: dto.resume !== false,
      }, clientIp);
      const conversation = (await this.convRepo.getConversation(dto.conversation_id))!;
      return { conversation, ...turnResult };
    }

    const title = dto.title || (dto.content.length > 40 ? `${dto.content.slice(0, 37)}...` : dto.content);
    const conv = await this.createConversation({
      title,
      model: dto.model,
      system_instruction: dto.system_instruction,
      session_id: dto.session_id,
    }, clientIp);

    const turnResult = await this.sendMessage(conv.id, {
      content: dto.content,
      model: dto.model,
      temperature: dto.temperature,
      additional_context: dto.additional_context,
      api_key: dto.api_key,
      mode: dto.mode,
      resume: false,
    }, clientIp);

    const updated = (await this.convRepo.getConversation(conv.id))!;
    return { conversation: updated, ...turnResult };
  }

  /**
   * Sends user message, coordinates LLM turn, stores results, and logs audit metrics.
   * Separates REST execution and Database persistence into distinct decoupled methods (STD-COD-007).
   */
  async sendMessage(
    conversationId: string,
    dto: SendMessageDTO,
    clientIp?: string
  ): Promise<{ tier: string; userMessage: Message; assistantMessage: Message; cliResult: CliExecutionResult }> {
    const conv = await this.getRequiredConversation(conversationId);
    const userMessage = await this.recordUserMessage(conversationId, dto, conv.model);

    const isResume = dto.resume !== false && Boolean(conv.messages && conv.messages.length > 0);
    const assembledPrompt = this.assemblePrompt(conv, dto.content, dto.additional_context, isResume);
    const cliResult = await this.executeLlmTurn(conversationId, assembledPrompt, dto, conv, isResume, clientIp);

    const assistantMessage = await this.txManager.runInTransaction(async () => {
      const persisted = await this.persistAssistantMessage(conversationId, cliResult);
      await this.recordAuditTurn(conversationId, userMessage.id, persisted.id, cliResult, clientIp);
      await this.syncSessionMetadata(conversationId, conv, cliResult);
      return persisted;
    });

    const tier = cliResult.tier || 'freeware';
    logger.info(
      'CONVERSATION',
      `Completed turn for conversation ${conversationId} using model ${cliResult.model} (tier: ${tier}) in ${cliResult.latency_ms}ms (runner: ${cliResult.runner_type}, exit: ${cliResult.exit_code})`
    );

    return { tier, userMessage, assistantMessage, cliResult };
  }

  private async syncSessionMetadata(
    conversationId: string,
    conv: Conversation,
    cliResult: CliExecutionResult
  ): Promise<void> {
    if (cliResult.session_id && cliResult.session_id !== conv.session_id) {
      await this.convRepo.updateSessionId(conversationId, cliResult.session_id);
    }
    if (cliResult.switched_model && cliResult.switched_model !== conv.model) {
      await this.convRepo.updateModel(conversationId, cliResult.switched_model);
    }
    const currentMeta = (conv.metadata as Record<string, unknown>) || {};
    const turnCount = Number(currentMeta.total_turns || 0) + 1;
    const accumulatedTokens = Number(currentMeta.total_tokens || 0) + (cliResult.total_tokens || 0);

    await this.convRepo.updateMetadata(conversationId, {
      total_turns: turnCount,
      total_tokens: accumulatedTokens,
      max_tokens: cliResult.max_tokens,
      token_consumed_percentage: cliResult.token_consumed_percentage,
      token_remaining_percentage: cliResult.token_remaining_percentage,
      last_turn_at: new Date().toISOString(),
      last_runner_type: cliResult.runner_type,
      is_fallback: cliResult.is_fallback || false,
      fallback_reason: cliResult.fallback_reason,
      switched_model: cliResult.switched_model,
      tier: cliResult.tier,
    });
  }

  private async recordUserMessage(
    conversationId: string,
    dto: SendMessageDTO,
    defaultModel: string
  ): Promise<Message> {
    return this.convRepo.addMessage({
      conversation_id: conversationId,
      role: SystemRole.USER,
      content: dto.content,
      model: dto.model || defaultModel,
      metadata: { additional_context: dto.additional_context || null },
    });
  }

  private assemblePrompt(
    conv: Conversation,
    userContent: string,
    additionalContext?: string,
    isResume = false
  ): string {
    let contextHeader = '';
    if (conv.contexts && conv.contexts.length > 0) {
      contextHeader += '--- RELEVANT CONTEXT & ATTACHED DOCUMENTS ---\n';
      for (const ctx of conv.contexts) {
        contextHeader += `[${ctx.context_type.toUpperCase()}: ${ctx.title}]\n${ctx.content}\n\n`;
      }
    }

    if (additionalContext) {
      contextHeader += `[USER PROVIDED AD-HOC CONTEXT]\n${additionalContext}\n\n`;
    }

    if (isResume) {
      return `${contextHeader}${userContent}`;
    }

    const history = conv.messages || [];
    let conversationHistory = '';
    if (history.length > 0) {
      conversationHistory += '--- RECENT CONVERSATION HISTORY ---\n';
      const recent = history.slice(-10);
      for (const m of recent) {
        conversationHistory += `${m.role.toUpperCase()}: ${m.content}\n\n`;
      }
    }

    return `${contextHeader}${conversationHistory}CURRENT USER REQUEST:\n${userContent}`;
  }

  /**
   * External LLM Execution / REST Call Boundary.
   * Completely decoupled from database locks or transactions (STD-COD-007).
   */
  private async executeLlmTurn(
    conversationId: string,
    prompt: string,
    dto: SendMessageDTO,
    conv: Conversation,
    isResume: boolean,
    clientIp?: string
  ): Promise<CliExecutionResult> {
    let targetModel = dto.model || conv.model;
    const sessionId = dto.session_id || conv.session_id || conversationId;

    // Token Exhaustion Governance: If prior conversation token consumption reached threshold (>=90%), switch to fallback
    const currentMeta = (conv.metadata as Record<string, unknown>) || {};
    const priorTokens = Number(currentMeta.total_tokens || 0);
    const maxTokens = config.getMaxTokens(targetModel);
    const consumedPct = maxTokens > 0 ? (priorTokens / maxTokens) * 100 : 0;

    if (consumedPct >= config.fallbackThresholdPercentage && !isFallbackModel(targetModel)) {
      const switchReason = `Conversation tokens (${priorTokens}/${maxTokens} [${consumedPct.toFixed(1)}%]) reached ${config.fallbackThresholdPercentage}% threshold. Switching to local fallback model '${config.fallbackModel}' to prevent token exhaustion.`;
      logger.warn('TOKEN_GOVERNANCE', switchReason);
      targetModel = config.fallbackModel;
      await this.convRepo.updateModel(conversationId, targetModel);
    }

    try {
      logger.info('CONVERSATION', `Executing turn for conversation ${conversationId} (model: ${targetModel}, resume: ${isResume}, session: ${sessionId})`);
      const runner = this.runnerFactory.getRunner(targetModel);
      return await runner.executePrompt({
        prompt,
        model: targetModel,
        systemInstruction: conv.system_instruction,
        apiKey: dto.api_key,
        mode: dto.mode,
        userId: clientIp || conversationId,
        sessionId,
        resume: isResume,
      });
    } catch (err: any) {
      logger.error('CONVERSATION', `Turn execution failed for conversation ${conversationId}: ${err.message}`);
      await this.auditRepo.logEvent({
        conversation_id: conversationId,
        action: AuditAction.MESSAGE_SEND,
        client_ip: clientIp,
        model_used: targetModel,
        status: CommonStatus.FAILED,
        error_message: err.message,
        details: { prompt_preview: dto.content.slice(0, 150) },
      });
      throw err;
    }
  }

  private async persistAssistantMessage(
    conversationId: string,
    cliResult: CliExecutionResult
  ): Promise<Message> {
    return this.convRepo.addMessage({
      conversation_id: conversationId,
      role: SystemRole.ASSISTANT,
      content: cliResult.content,
      model: cliResult.model,
      prompt_tokens: cliResult.prompt_tokens,
      completion_tokens: cliResult.completion_tokens,
      total_tokens: cliResult.total_tokens,
      latency_ms: cliResult.latency_ms,
      cli_exit_code: cliResult.exit_code,
      metadata: {
        runner_type: cliResult.runner_type,
        max_tokens: cliResult.max_tokens,
        token_consumed_percentage: cliResult.token_consumed_percentage,
        token_remaining_percentage: cliResult.token_remaining_percentage,
        is_fallback: cliResult.is_fallback || false,
        fallback_reason: cliResult.fallback_reason,
        switched_model: cliResult.switched_model,
        tier: cliResult.tier,
      },
    });
  }

  private async recordAuditTurn(
    conversationId: string,
    userMessageId: string,
    assistantMessageId: string,
    cliResult: CliExecutionResult,
    clientIp?: string
  ): Promise<void> {
    await this.auditRepo.logEvent({
      conversation_id: conversationId,
      action: AuditAction.MESSAGE_SEND,
      client_ip: clientIp,
      model_used: cliResult.model,
      prompt_tokens: cliResult.prompt_tokens,
      completion_tokens: cliResult.completion_tokens,
      latency_ms: cliResult.latency_ms,
      status: CommonStatus.SUCCESS,
      details: {
        user_message_id: userMessageId,
        assistant_message_id: assistantMessageId,
        runner_type: cliResult.runner_type,
        exit_code: cliResult.exit_code,
      },
    });
  }

  public async listCliSessions(): Promise<string[]> {
    return new Promise((resolve) => {
      const cliBin = config.geminiCliCommand || 'gemini';
      const proc = spawn(cliBin, ['--list-sessions'], { env: process.env });
      let stdout = '';

      proc.stdout?.on('data', (d) => { stdout += d.toString(); });
      proc.on('close', () => {
        const lines = stdout
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l && !l.includes('Using GOOGLE_API_KEY') && !l.includes('No previous sessions'));
        resolve(lines);
      });
      proc.on('error', () => {
        resolve([]);
      });
    });
  }
}

export const conversationService = new ConversationService();
