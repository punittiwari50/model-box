import type { Request, Response } from "express";
import { sessionService } from "@/services/sessionService";
import { HttpStatus } from "@/constants/index";

export class SessionController {
  public listSessions(req: Request, res: Response): void {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;
    const sessions = sessionService.listSessions(limit, offset);
    res.status(HttpStatus.OK).json({
      success: true,
      count: sessions.length,
      sessions,
      correlationId: req.correlationId,
    });
  }

  public getSession(req: Request, res: Response): void {
    const { id } = req.params;
    const session = sessionService.getSession(id);

    if (!session) {
      res.status(HttpStatus.NOT_FOUND).json({
        success: false,
        message: `Session '${id}' not found.`,
        correlationId: req.correlationId,
      });
      return;
    }

    res.status(HttpStatus.OK).json({
      success: true,
      session,
      correlationId: req.correlationId,
    });
  }

  public createSession(req: Request, res: Response): void {
    const { sessionId, model, strategy } = req.body || {};
    const session = sessionService.createSession(sessionId, model, strategy);
    res.status(HttpStatus.CREATED).json({
      success: true,
      session,
      correlationId: req.correlationId,
    });
  }

  public getSessionMessages(req: Request, res: Response): void {
    const { id } = req.params;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;
    const messages = sessionService.getSessionMessages(id, limit, offset);
    res.status(HttpStatus.OK).json({
      success: true,
      sessionId: id,
      count: messages.length,
      messages,
      correlationId: req.correlationId,
    });
  }

  public deleteSession(req: Request, res: Response): void {
    const { id } = req.params;
    const deleted = sessionService.deleteSession(id);
    res.status(HttpStatus.OK).json({
      success: deleted,
      message: deleted ? `Session '${id}' deleted.` : `Session '${id}' not found.`,
      correlationId: req.correlationId,
    });
  }

  public cleanupTestSessions(req: Request, res: Response): void {
    const deletedCount = sessionService.cleanupTestSessions();
    res.status(HttpStatus.OK).json({
      success: true,
      deletedCount,
      message: `Cleaned up ${deletedCount} test/dummy sessions from database.`,
      correlationId: req.correlationId,
    });
  }
}

export const sessionController = new SessionController();
