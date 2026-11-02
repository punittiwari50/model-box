import type { Request, Response } from "express";
import { ServiceConstant, HttpStatus } from "@/constants/index";
import { appConfig } from "@/config/index";
import { upstreamSyncService } from "@/services/upstreamSyncService";

export class HealthController {
  public async getHealth(req: Request, res: Response): Promise<void> {
    const upstream = await upstreamSyncService.getUpstreamHealth(req.correlationId);

    res.status(HttpStatus.OK).json({
      status: "HEALTHY",
      service: ServiceConstant.SERVICE_NAME,
      version: ServiceConstant.VERSION,
      environment: appConfig.nodeEnv,
      upstream: {
        configuredUrl: appConfig.geminiConnectorUrl,
        ...upstream,
      },
      correlationId: req.correlationId,
      timestamp: new Date().toISOString(),
      uptimeSeconds: process.uptime(),
    });
  }
}

export const healthController = new HealthController();
