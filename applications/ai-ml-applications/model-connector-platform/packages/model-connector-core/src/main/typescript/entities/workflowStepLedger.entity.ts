/**
 * Relational Entity for WORKFLOW_STEP_LEDGER table.
 * Conforms to:
 * - LLD §19.1 & Roadmap STEP-06: Cryptographic Workflow Resumption Ledger
 * - Invariant: Avoid generic ID: Uses LEDGER_ID
 * - Invariant: Table and column names strictly in UPPER CASE
 */
export interface WorkflowStepLedgerEntity {
  LEDGER_ID: string;
  WORKFLOW_EXECUTION_ID: string;
  TENANT_ID: string;
  STEP_INDEX: number;
  STEP_NAME: string;
  INPUT_HASH: string;
  OUTPUT_HASH: string;
  CUMULATIVE_HMAC: string;
  STATUS: "PENDING" | "EXECUTED" | "FAILED" | "COMPROMISED";
  PAYLOAD_SNAPSHOT?: string;
  EXECUTION_TIMESTAMP: string;

  // Compatibility aliases
  readonly ledgerId?: string;
  readonly workflowExecutionId?: string;
  readonly tenantId?: string;
  readonly stepIndex?: number;
}
