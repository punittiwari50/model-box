/**
 * Relational Entity for AUDIT_LOGS table.
 * Conforms to:
 * - Avoid generic ID: Uses AUDIT_LOG_ID
 * - All table and column names strictly in UPPER CASE
 * - Distributed Tracing: TRACE_ID, SPAN_ID, CORRELATION_ID
 */
export interface AuditLogEntity {
  AUDIT_LOG_ID: string;
  CORRELATION_ID: string;
  TRACE_ID?: string;
  SPAN_ID?: string;
  MODEL_ID: string;
  ACTION_NAME: string;
  STRATEGY_MODE: string;
  LATENCY_MS: number;
  EXECUTION_STATUS: "SUCCESS" | "FAILED" | "TIMEOUT";
  CLIENT_IP?: string;
  ERROR_MESSAGE?: string;
  CREATED_TIMESTAMP: string;

  // Compatibility aliases
  readonly auditLogId?: string;
  readonly correlationId?: string;
  readonly modelId?: string;
}
