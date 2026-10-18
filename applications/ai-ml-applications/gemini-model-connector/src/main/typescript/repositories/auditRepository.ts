import { randomUUID } from 'node:crypto';
import type { AuditLog } from '@/domain/index.js';
import { dataSourceManager } from '@/core/datasource/dataSourceManager.js';
import { logger } from '@/core/observability/logging/logger.js';
import { getCurrentTraceContext } from '@/core/observability/tracing/traceContext.js';
import { DatabaseTable, DatabaseColumn } from '@/domain/constants/index.js';

export interface IAuditRepository {
  logEvent(event: Omit<AuditLog, 'id' | 'timestamp'> & { id?: string; timestamp?: string }): Promise<AuditLog>;
  queryLogs(options: {
    conversation_id?: string;
    action?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<AuditLog[]>;
}

export class AuditRepository implements IAuditRepository {
  async logEvent(event: Omit<AuditLog, 'id' | 'timestamp'> & { id?: string; timestamp?: string }): Promise<AuditLog> {
    const dataSource = await dataSourceManager.getDriver();
    const now = event.timestamp || new Date().toISOString();
    const id = event.id || randomUUID();
    const traceCtx = getCurrentTraceContext();

    const details = {
      ...(event.details || {}),
      ...(traceCtx ? { trace_id: traceCtx.traceId, span_id: traceCtx.spanId, correlation_id: traceCtx.correlationId } : {}),
    };

    const audit: AuditLog = {
      id,
      timestamp: now,
      created_timestamp: now,
      update_timestamp: now,
      conversation_id: event.conversation_id,
      action: event.action,
      client_ip: event.client_ip,
      model_used: event.model_used,
      prompt_tokens: event.prompt_tokens,
      completion_tokens: event.completion_tokens,
      latency_ms: event.latency_ms,
      status: event.status,
      error_message: event.error_message,
      details,
    };

    await dataSource.run(
      `INSERT INTO ${DatabaseTable.AUDIT_LOGS} (
        ${DatabaseColumn.ID},
        ${DatabaseColumn.TIMESTAMP},
        ${DatabaseColumn.CONVERSATION_ID},
        ${DatabaseColumn.ACTION},
        ${DatabaseColumn.CLIENT_IP},
        ${DatabaseColumn.MODEL_USED},
        ${DatabaseColumn.PROMPT_TOKENS},
        ${DatabaseColumn.COMPLETION_TOKENS},
        ${DatabaseColumn.LATENCY_MS},
        ${DatabaseColumn.STATUS},
        ${DatabaseColumn.ERROR_MESSAGE},
        ${DatabaseColumn.DETAILS},
        ${DatabaseColumn.CREATED_TIMESTAMP},
        ${DatabaseColumn.UPDATE_TIMESTAMP}
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        audit.id,
        audit.timestamp,
        audit.conversation_id || null,
        audit.action,
        audit.client_ip || null,
        audit.model_used || null,
        audit.prompt_tokens ?? null,
        audit.completion_tokens ?? null,
        audit.latency_ms ?? null,
        audit.status,
        audit.error_message || null,
        JSON.stringify(audit.details),
        audit.created_timestamp,
        audit.update_timestamp,
      ]
    );

    logger.audit(`Logged event '${audit.action}' (status: ${audit.status}, conv: ${audit.conversation_id || 'N/A'}, latency: ${audit.latency_ms || 'N/A'}ms)`);
    return audit;
  }

  async queryLogs(options: {
    conversation_id?: string;
    action?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<AuditLog[]> {
    const dataSource = await dataSourceManager.getDriver();
    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;

    let sql = `SELECT * FROM ${DatabaseTable.AUDIT_LOGS}`;
    const clauses: string[] = [];
    const params: any[] = [];

    if (options.conversation_id) {
      clauses.push(`${DatabaseColumn.CONVERSATION_ID} = ?`);
      params.push(options.conversation_id);
    }
    if (options.action) {
      clauses.push(`${DatabaseColumn.ACTION} = ?`);
      params.push(options.action);
    }
    if (options.status) {
      clauses.push(`${DatabaseColumn.STATUS} = ?`);
      params.push(options.status);
    }

    if (clauses.length > 0) {
      sql += ` WHERE ${clauses.join(' AND ')}`;
    }

    sql += ` ORDER BY ${DatabaseColumn.CREATED_TIMESTAMP} DESC LIMIT ? OFFSET ?;`;
    params.push(limit, offset);

    const rows = await dataSource.all<any>(sql, params);
    return rows.map((r) => {
      const createdTimestamp = r.CREATED_TIMESTAMP ?? r.created_timestamp ?? r.TIMESTAMP ?? r.timestamp;
      const updateTimestamp = r.UPDATE_TIMESTAMP ?? r.update_timestamp ?? createdTimestamp;
      return {
        id: r.ID ?? r.id,
        timestamp: createdTimestamp,
        created_timestamp: createdTimestamp,
        update_timestamp: updateTimestamp,
        conversation_id: r.CONVERSATION_ID ?? r.conversation_id,
        action: r.ACTION ?? r.action,
        client_ip: r.CLIENT_IP ?? r.client_ip,
        model_used: r.MODEL_USED ?? r.model_used,
        prompt_tokens: r.PROMPT_TOKENS ?? r.prompt_tokens,
        completion_tokens: r.COMPLETION_TOKENS ?? r.completion_tokens,
        latency_ms: r.LATENCY_MS ?? r.latency_ms,
        status: r.STATUS ?? r.status,
        error_message: r.ERROR_MESSAGE ?? r.error_message,
        details: typeof (r.DETAILS ?? r.details) === 'string' ? JSON.parse(r.DETAILS ?? r.details) : r.DETAILS ?? r.details,
      };
    });
  }
}

export const auditRepo: IAuditRepository = new AuditRepository();
