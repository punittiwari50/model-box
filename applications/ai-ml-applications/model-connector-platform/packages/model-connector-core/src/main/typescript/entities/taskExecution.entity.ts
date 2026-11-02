/**
 * Relational Entity for TASK_EXECUTIONS table.
 * Conforms to:
 * - UC-11 §4.3: Unified Conversation, Task State & Executive Summary Hub
 * - Invariant: Avoid generic ID: Uses TASK_ID
 * - Invariant: Table and column names strictly in UPPER CASE
 */
export interface TaskExecutionEntity {
  TASK_ID: string;
  TENANT_ID: string;
  USER_ID: string;
  TASK_TYPE: string;
  TARGET_ENTITY_ID?: string;
  TASK_STATUS: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "PAUSED";
  EXECUTION_OUTPUT_SUMMARY?: string;
  STARTED_AT: string;
  COMPLETED_AT?: string;

  // Compatibility aliases
  readonly taskId?: string;
  readonly tenantId?: string;
  readonly userId?: string;
  readonly taskType?: string;
  readonly status?: string;
}
