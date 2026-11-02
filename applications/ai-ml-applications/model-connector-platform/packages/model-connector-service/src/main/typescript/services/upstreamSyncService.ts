import type { UpstreamAuthStatus, UpstreamAuditLog } from "@model-box/model-connector-client";
import { modelService } from "@/services/modelService";

export class UpstreamSyncService {
  public async getUpstreamHealth(correlationId?: string): Promise<Record<string, unknown>> {
    const client = modelService.getClient();
    const health = await client.getUpstreamAdapter().fetchHealth(correlationId);
    return { ...health };
  }

  public async getUpstreamAuth(correlationId?: string): Promise<UpstreamAuthStatus> {
    const client = modelService.getClient();
    return client.getAuthStatus(correlationId);
  }

  public async getUpstreamAudit(correlationId?: string): Promise<readonly UpstreamAuditLog[]> {
    const client = modelService.getClient();
    return client.getAuditLogs(correlationId);
  }
}

export const upstreamSyncService = new UpstreamSyncService();
