import { randomUUID } from "@model-box/model-connector-core";
import { platformDatabase } from "@/database/platformDatabase";
import type { UpstreamAuditLog } from "@model-box/model-connector-client";

export interface AuditLogEntry {
  readonly auditLogId?: string;
  readonly correlationId: string;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly sessionId?: string;
  readonly modelId: string;
  readonly actionName: string;
  readonly strategyMode: string;
  readonly latencyMs: number;
  readonly executionStatus: string;
  readonly clientIp?: string;
  readonly promptMessage?: string;
  readonly errorMessage?: string;
}

export class AuditRepository {
  public async saveAuditLog(entry: AuditLogEntry): Promise<void> {
    const id = entry.auditLogId || `audit-${randomUUID().slice(0, 12)}`;
    const now = new Date().toISOString();
    const promptMsg = (entry.promptMessage || "").slice(0, 2000);

    await this.saveToPostgres(id, entry, promptMsg, now);
    this.saveToFallbackDatabase(id, entry, promptMsg, now);
  }

  private async saveToPostgres(
    id: string,
    entry: AuditLogEntry,
    promptMsg: string,
    now: string,
  ): Promise<void> {
    try {
      const pg = platformDatabase.getPostgresManager();
      const sql = `
        INSERT INTO AUDIT_LOGS (
          AUDIT_LOG_ID, CORRELATION_ID, TRACE_ID, SPAN_ID, SESSION_ID,
          MODEL_ID, ACTION_NAME, STRATEGY_MODE, LATENCY_MS,
          EXECUTION_STATUS, CLIENT_IP, PROMPT_MESSAGE, ERROR_MESSAGE, CREATED_TIMESTAMP
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (AUDIT_LOG_ID) DO NOTHING;
      `;
      await pg.execute(sql, [
        id,
        entry.correlationId,
        entry.traceId || null,
        entry.spanId || null,
        entry.sessionId || null,
        entry.modelId,
        entry.actionName,
        entry.strategyMode,
        entry.latencyMs || 0,
        entry.executionStatus,
        entry.clientIp || "127.0.0.1",
        promptMsg,
        entry.errorMessage || null,
        now,
      ]);
    } catch {
      // Postgres safe isolation
    }
  }

  private saveToFallbackDatabase(
    id: string,
    entry: AuditLogEntry,
    promptMsg: string,
    now: string,
  ): void {
    try {
      const db = platformDatabase.getDatabase();
      db.prepare(`
        INSERT INTO AUDIT_LOGS (
          AUDIT_LOG_ID, CORRELATION_ID, TRACE_ID, SPAN_ID, SESSION_ID,
          MODEL_ID, ACTION_NAME, STRATEGY_MODE, LATENCY_MS,
          EXECUTION_STATUS, CLIENT_IP, PROMPT_MESSAGE, ERROR_MESSAGE, CREATED_TIMESTAMP
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        entry.correlationId,
        entry.traceId || null,
        entry.spanId || null,
        entry.sessionId || null,
        entry.modelId,
        entry.actionName,
        entry.strategyMode,
        entry.latencyMs || 0,
        entry.executionStatus,
        entry.clientIp || "127.0.0.1",
        promptMsg,
        entry.errorMessage || null,
        now,
      );
    } catch {
      // H2 fallback safe isolation
    }
  }

  public async listAuditLogs(limit: number = 50, offset: number = 0): Promise<UpstreamAuditLog[]> {
    const pgLogs = await this.listFromPostgres(limit, offset);
    if (pgLogs.length > 0) return pgLogs;
    return this.listFromFallbackDatabase(limit, offset);
  }

  private async listFromPostgres(limit: number, offset: number): Promise<UpstreamAuditLog[]> {
    try {
      const pg = platformDatabase.getPostgresManager();
      const rows = await pg.query<{
        audit_log_id: string;
        action_name: string;
        model_id: string;
        execution_status: string;
        latency_ms: number;
        created_timestamp: string;
        client_ip: string;
        prompt_message: string;
        session_id: string;
        correlation_id: string;
        trace_id: string;
        span_id: string;
      }>(
        `SELECT AUDIT_LOG_ID, ACTION_NAME, MODEL_ID, EXECUTION_STATUS, LATENCY_MS,
                CREATED_TIMESTAMP, CLIENT_IP, PROMPT_MESSAGE, SESSION_ID,
                CORRELATION_ID, TRACE_ID, SPAN_ID
         FROM AUDIT_LOGS
         ORDER BY CREATED_TIMESTAMP DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset],
      );
      return rows.map((r) => this.mapRow(r));
    } catch {
      return [];
    }
  }

  private listFromFallbackDatabase(limit: number, offset: number): UpstreamAuditLog[] {
    try {
      const db = platformDatabase.getDatabase();
      const rows = db.prepare(`
        SELECT AUDIT_LOG_ID as audit_log_id,
               ACTION_NAME as action_name,
               MODEL_ID as model_id,
               EXECUTION_STATUS as execution_status,
               LATENCY_MS as latency_ms,
               CREATED_TIMESTAMP as created_timestamp,
               CLIENT_IP as client_ip,
               PROMPT_MESSAGE as prompt_message,
               SESSION_ID as session_id,
               CORRELATION_ID as correlation_id,
               TRACE_ID as trace_id,
               SPAN_ID as span_id
        FROM AUDIT_LOGS
        ORDER BY CREATED_TIMESTAMP DESC
        LIMIT ? OFFSET ?
      `).all(limit, offset) as any[];
      return rows.map((r) => this.mapRow(r));
    } catch {
      return [];
    }
  }

  private mapRow(r: any): UpstreamAuditLog {
    return {
      id: String(r.audit_log_id),
      action: String(r.action_name || "INFERENCE"),
      modelUsed: String(r.model_id),
      status: String(r.execution_status || "SUCCESS"),
      latencyMs: Number(r.latency_ms || 0),
      timestamp: String(r.created_timestamp),
      clientIp: String(r.client_ip || "127.0.0.1"),
      message: String(r.prompt_message || "—"),
      sessionId: r.session_id ? String(r.session_id) : undefined,
      correlationId: r.correlation_id ? String(r.correlation_id) : undefined,
      traceId: r.trace_id ? String(r.trace_id) : undefined,
      spanId: r.span_id ? String(r.span_id) : undefined,
    };
  }
}

export const auditRepository = new AuditRepository();

