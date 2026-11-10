import type { UpstreamAuthStatus, UpstreamAuditLog } from "@model-box/model-connector-client";
import { auditRepository } from "@/repositories/auditRepository";
import { accountRepository } from "@/repositories/accountRepository";

export class UpstreamSyncService {
  public async getUpstreamHealth(_correlationId?: string): Promise<Record<string, unknown>> {
    return {
      status: "ONLINE",
      service: "model-connector-platform",
      upstreamBridge: "STANDALONE_DIRECT",
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  public async getUpstreamAuth(_correlationId?: string): Promise<UpstreamAuthStatus> {
    const activeAccount = accountRepository.getActiveAccount("gemini-3.8-flash");
    return {
      authenticated: Boolean(activeAccount),
      activeModel: activeAccount?.modelId || "gemini-3.8-flash",
      activeSessions: activeAccount ? [activeAccount.accountName || "default"] : [],
      email: activeAccount?.userEmail || null,
      activeSession: Boolean(activeAccount),
      expiresAt: null,
    };
  }

  public async getUpstreamAudit(_correlationId?: string): Promise<readonly UpstreamAuditLog[]> {
    return auditRepository.listAuditLogs(100, 0);
  }
}

export const upstreamSyncService = new UpstreamSyncService();
