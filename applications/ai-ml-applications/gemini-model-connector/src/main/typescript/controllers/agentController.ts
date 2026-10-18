import type { Request, Response } from 'express';
import { agentService, type AgentService } from '@/services/agent/agentService.js';
import { HttpStatus } from '@/domain/constants/index.js';
import {
  getClientIp,
  getRouteParam,
  sendJsonResponse,
  sendJsonError,
} from '@/core/web/helper/responseHelper.js';

export class AgentController {
  private readonly service: AgentService;

  constructor(service: AgentService = agentService) {
    this.service = service;
  }

  public async execute(req: Request, res: Response): Promise<void> {
    try {
      const { task, agent_name, model, approval_mode, sandbox, skills, metadata, subscription_policy, project, project_name, projectName } = req.body || {};
      if (!task || typeof task !== 'string') {
        sendJsonError(res, HttpStatus.BAD_REQUEST, 'Field "task" is required and must be a string.');
        return;
      }

      const execution = await this.service.executeTask(
        {
          task,
          agent_name,
          model,
          approval_mode,
          sandbox,
          skills,
          metadata,
          subscription_policy,
          project: project || project_name || projectName,
        },
        getClientIp(req)
      );
      sendJsonResponse(res, HttpStatus.CREATED, execution);
    } catch (err: any) {
      sendJsonError(res, HttpStatus.INTERNAL_SERVER_ERROR, err.message || 'Failed to start agent task.');
    }
  }

  public async list(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const executions = await this.service.listExecutions(limit, offset);
      sendJsonResponse(res, HttpStatus.OK, { items: executions, count: executions.length });
    } catch (err: any) {
      sendJsonError(res, HttpStatus.INTERNAL_SERVER_ERROR, err.message || 'Failed to list agent executions.');
    }
  }

  public async getById(req: Request, res: Response): Promise<void> {
    try {
      const id = getRouteParam(req.params.id);
      const data = await this.service.getExecution(id);
      if (!data) {
        sendJsonError(res, HttpStatus.NOT_FOUND, `Agent execution '${id}' not found.`);
        return;
      }
      sendJsonResponse(res, HttpStatus.OK, data);
    } catch (err: any) {
      sendJsonError(res, HttpStatus.INTERNAL_SERVER_ERROR, err.message || 'Failed to retrieve agent execution.');
    }
  }

  public async cancel(req: Request, res: Response): Promise<void> {
    try {
      const id = getRouteParam(req.params.id);
      const cancelled = await this.service.cancelExecution(id, getClientIp(req));
      if (!cancelled) {
        sendJsonError(res, HttpStatus.BAD_REQUEST, `Agent execution '${id}' is not currently running.`);
        return;
      }
      sendJsonResponse(res, HttpStatus.OK, { success: true, message: `Agent execution '${id}' cancelled.` });
    } catch (err: any) {
      sendJsonError(res, HttpStatus.INTERNAL_SERVER_ERROR, err.message || 'Failed to cancel agent execution.');
    }
  }

  public async listSkills(req: Request, res: Response): Promise<void> {
    try {
      const model = req.query.model as string | undefined;
      const skills = await this.service.listSkills(model);
      sendJsonResponse(res, HttpStatus.OK, skills);
    } catch (err: any) {
      sendJsonError(res, HttpStatus.INTERNAL_SERVER_ERROR, err.message || 'Failed to list agent skills.');
    }
  }
}

export const agentController = new AgentController();
