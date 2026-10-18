import type { Request, Response } from 'express';
import { container } from '@/core/context/appContext.js';
import type { ConversationService } from '@/services/conversation/conversationService.js';
import { HttpStatus } from '@/domain/constants/index.js';
import {
  getClientIp,
  getRouteParam,
  sendJsonResponse,
  sendJsonError,
} from '@/core/web/helper/responseHelper.js';

/**
 * Controller for conversation management and turn execution.
 * Conforms to STD-COD-006 & STD-COD-007.
 */
export class ConversationController {
  private readonly conversationService: ConversationService;

  constructor(service?: ConversationService) {
    this.conversationService = service || container.getConversationService();
  }

  public async createConversation(req: Request, res: Response): Promise<void> {
    try {
      const { title, model, system_instruction, tags, initial_resume, metadata, session_id } = req.body;
      if (!title || typeof title !== 'string') {
        sendJsonError(res, HttpStatus.BAD_REQUEST, 'Field "title" is required.');
        return;
      }

      const conv = await this.conversationService.createConversation(
        { title, model, system_instruction, tags, initial_resume, metadata, session_id },
        getClientIp(req)
      );
      sendJsonResponse(res, HttpStatus.CREATED, conv);
    } catch (error: any) {
      sendJsonError(res, HttpStatus.INTERNAL_SERVER_ERROR, error.message || 'Failed to create conversation.');
    }
  }

  public async listConversations(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const list = await this.conversationService.listConversations(limit, offset);
      sendJsonResponse(res, HttpStatus.OK, { items: list, count: list.length });
    } catch (error: any) {
      sendJsonError(res, HttpStatus.INTERNAL_SERVER_ERROR, error.message || 'Failed to list conversations.');
    }
  }

  public async getConversation(req: Request, res: Response): Promise<void> {
    try {
      const id = getRouteParam(req.params.id);
      const conv = await this.conversationService.getConversation(id);
      if (!conv) {
        sendJsonError(res, HttpStatus.NOT_FOUND, 'Conversation not found.');
        return;
      }
      sendJsonResponse(res, HttpStatus.OK, conv);
    } catch (error: any) {
      sendJsonError(res, HttpStatus.INTERNAL_SERVER_ERROR, error.message || 'Failed to get conversation.');
    }
  }

  public async deleteConversation(req: Request, res: Response): Promise<void> {
    try {
      const id = getRouteParam(req.params.id);
      const deleted = await this.conversationService.deleteConversation(id, getClientIp(req));
      if (!deleted) {
        sendJsonError(res, HttpStatus.NOT_FOUND, 'Conversation not found.');
        return;
      }
      sendJsonResponse(res, HttpStatus.OK, { success: true, message: 'Conversation deleted successfully.' });
    } catch (error: any) {
      sendJsonError(res, HttpStatus.INTERNAL_SERVER_ERROR, error.message || 'Failed to delete conversation.');
    }
  }

  public async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const { content, model, temperature, additional_context, api_key, mode, resume, session_id } = req.body;
      if (!content || typeof content !== 'string') {
        sendJsonError(res, HttpStatus.BAD_REQUEST, 'Field "content" is required.');
        return;
      }

      const id = getRouteParam(req.params.id);
      const result = await this.conversationService.sendMessage(
        id,
        { content, model, temperature, additional_context, api_key, mode, resume, session_id },
        getClientIp(req)
      );
      if (result.tier) res.locals.tier = result.tier;
      if (result.cliResult?.model) res.locals.model = result.cliResult.model;
      sendJsonResponse(res, HttpStatus.OK, result);
    } catch (error: any) {
      sendJsonError(res, HttpStatus.INTERNAL_SERVER_ERROR, error.message || 'Failed to execute model message turn.');
    }
  }

  public async resumeConversation(req: Request, res: Response): Promise<void> {
    try {
      const id = getRouteParam(req.params.id);
      const { content, model, temperature, additional_context, api_key, mode } = req.body || {};
      const result = await this.conversationService.resumeConversation(
        id,
        content ? { content, model, temperature, additional_context, api_key, mode } : undefined,
        getClientIp(req)
      );
      if (result.turnResult?.cliResult?.tier) res.locals.tier = result.turnResult.cliResult.tier;
      if (result.turnResult?.cliResult?.model) res.locals.model = result.turnResult.cliResult.model;
      sendJsonResponse(res, HttpStatus.OK, result);
    } catch (error: any) {
      const status = error.message?.includes('not found') ? HttpStatus.NOT_FOUND : HttpStatus.INTERNAL_SERVER_ERROR;
      sendJsonError(res, status, error.message || 'Failed to resume conversation.');
    }
  }

  public async chat(req: Request, res: Response): Promise<void> {
    try {
      const { conversation_id, session_id, content, title, model, system_instruction, temperature, additional_context, api_key, mode, resume } = req.body || {};
      if (!content || typeof content !== 'string') {
        sendJsonError(res, HttpStatus.BAD_REQUEST, 'Field "content" is required.');
        return;
      }

      const result = await this.conversationService.chat(
        { conversation_id, session_id, content, title, model, system_instruction, temperature, additional_context, api_key, mode, resume },
        getClientIp(req)
      );
      if (result.tier) res.locals.tier = result.tier;
      if (result.cliResult?.model) res.locals.model = result.cliResult.model;
      sendJsonResponse(res, HttpStatus.OK, result);
    } catch (error: any) {
      sendJsonError(res, HttpStatus.INTERNAL_SERVER_ERROR, error.message || 'Failed to process chat turn.');
    }
  }

  public async attachContext(req: Request, res: Response): Promise<void> {
    try {
      const { context_type, title, content, metadata } = req.body;
      if (!context_type || !title || !content) {
        sendJsonError(res, HttpStatus.BAD_REQUEST, 'Fields "context_type", "title", and "content" are required.');
        return;
      }

      const id = getRouteParam(req.params.id);
      const item = await this.conversationService.attachContext(
        id,
        { context_type, title, content, metadata },
        getClientIp(req)
      );
      sendJsonResponse(res, HttpStatus.CREATED, item);
    } catch (error: any) {
      sendJsonError(res, HttpStatus.INTERNAL_SERVER_ERROR, error.message || 'Failed to attach context.');
    }
  }

  public async listSessions(_req: Request, res: Response): Promise<void> {
    try {
      const sessions = await this.conversationService.listCliSessions();
      sendJsonResponse(res, HttpStatus.OK, { sessions, count: sessions.length });
    } catch (error: any) {
      sendJsonError(res, HttpStatus.INTERNAL_SERVER_ERROR, error.message || 'Failed to list conversation sessions.');
    }
  }
}

export const conversationController = new ConversationController();
