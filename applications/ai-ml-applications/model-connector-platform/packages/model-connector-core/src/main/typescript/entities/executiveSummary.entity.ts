/**
 * Relational Entity for EXECUTIVE_SUMMARIES table.
 * Conforms to:
 * - UC-11 §4.3: Unified Conversation, Task State & Executive Summary Hub
 * - Invariant: Avoid generic ID: Uses SUMMARY_ID
 * - Invariant: Table and column names strictly in UPPER CASE
 */
export interface ExecutiveSummaryEntity {
  SUMMARY_ID: string;
  TENANT_ID: string;
  USER_ID: string;
  TIME_WINDOW: "IMMEDIATE_MILESTONE" | "DAILY_RECAP" | "WEEKLY_ROLLUP";
  COMPLETED_TASKS_COUNT: number;
  FAILED_TASKS_COUNT: number;
  HIGHLIGHTS_JSON: string;
  NEXT_ACTIONS_JSON: string;
  CREATED_AT: string;

  // Compatibility aliases
  readonly summaryId?: string;
  readonly tenantId?: string;
  readonly userId?: string;
  readonly timeWindow?: string;
}
