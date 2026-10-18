/**
 * Domain Database Entity: AUDIT_LOGS table.
 */
export interface AuditLogEntity {
  readonly id: string;
  readonly timestamp: string;
  readonly conversation_id?: string;
  readonly action: string;
  readonly client_ip?: string;
  readonly model_used?: string;
  readonly prompt_tokens?: number;
  readonly completion_tokens?: number;
  readonly latency_ms?: number;
  readonly status: 'SUCCESS' | 'FAILED';
  readonly error_message?: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly created_timestamp?: string;
  readonly update_timestamp?: string;
}
