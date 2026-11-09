import type { Request, Response } from "express";
import { ServiceConstant, HttpStatus } from "@/constants/index";
import { appConfig } from "@/config/index";
import { upstreamSyncService } from "@/services/upstreamSyncService";
import { platformDatabase } from "@/database/platformDatabase";

export class HealthController {
  public async getHealth(req: Request, res: Response): Promise<void> {
    const upstream = await upstreamSyncService.getUpstreamHealth(req.correlationId);
    const dbMeta = await platformDatabase.getDataSourceMetadata();

    res.status(HttpStatus.OK).json({
      status: "HEALTHY",
      service: ServiceConstant.SERVICE_NAME,
      version: ServiceConstant.VERSION,
      environment: appConfig.nodeEnv,
      database: {
        default: dbMeta.defaultType,
        fallback: dbMeta.fallbackType,
        configured: dbMeta.configuredType,
        postgresConnected: dbMeta.isPostgresConnected,
        postgres: {
          host: dbMeta.postgresDetails.host,
          port: dbMeta.postgresDetails.port,
          database: dbMeta.postgresDetails.database,
          connected: dbMeta.postgresDetails.connected,
          latencyMs: dbMeta.postgresDetails.latencyMs,
          tablesCount: dbMeta.postgresDetails.tablesCount,
          version: dbMeta.postgresDetails.version,
          error: dbMeta.postgresDetails.error,
        },
        h2: {
          status: "READY",
          mode: "embedded_fallback",
        },
      },
      upstream: {
        configuredUrl: appConfig.geminiConnectorUrl,
        ...upstream,
      },
      correlationId: req.correlationId,
      timestamp: new Date().toISOString(),
      uptimeSeconds: process.uptime(),
    });
  }

  public async getDatabaseHealth(req: Request, res: Response): Promise<void> {
    const dbMeta = await platformDatabase.getDataSourceMetadata();
    res.status(HttpStatus.OK).json({
      success: true,
      service: ServiceConstant.SERVICE_NAME,
      database: {
        default: dbMeta.defaultType,
        fallback: dbMeta.fallbackType,
        configured: dbMeta.configuredType,
        postgresConnected: dbMeta.isPostgresConnected,
        postgres: dbMeta.postgresDetails,
        h2: {
          status: "READY",
          mode: "embedded_fallback",
        },
      },
      correlationId: req.correlationId,
      timestamp: new Date().toISOString(),
    });
  }
}

export const healthController = new HealthController();
