import type { Request, Response } from "express";
import { upstreamSyncService } from "@/services/upstreamSyncService";
import { HttpStatus } from "@/constants/index";

export class UpstreamController {
  public async getStatus(req: Request, res: Response): Promise<void> {
    const health = await upstreamSyncService.getUpstreamHealth(req.correlationId);
    const auth = await upstreamSyncService.getUpstreamAuth(req.correlationId);

    res.status(HttpStatus.OK).json({
      success: true,
      upstreamHealth: health,
      authStatus: auth,
      correlationId: req.correlationId,
    });
  }

  public async getAuditLogs(req: Request, res: Response): Promise<void> {
    const logs = await upstreamSyncService.getUpstreamAudit(req.correlationId);
    res.status(HttpStatus.OK).json({
      success: true,
      count: logs.length,
      logs,
      correlationId: req.correlationId,
    });
  }
}

export const upstreamController = new UpstreamController();
