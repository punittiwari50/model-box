/**
 * Workflow DAG Canvas Types & Node Schemas.
 * Aligns with UI-LLD Section 9.1 and UC-15 / UC-11 architecture.
 */

export type WorkflowStepStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCESS"
  | "FAILED"
  | "SKIPPED"
  | "AWAITING_HITL";

export interface BaseWorkflowNodeData {
  readonly stepId: string;
  readonly stepName: string;
  readonly nodeType: "MODEL" | "CONDITION" | "TOOL" | "ACTION";
  readonly isMandatory: boolean;
  readonly status: WorkflowStepStatus;
  readonly progressPercent?: number;
  readonly errorMessage?: string;
  readonly executionDurationMs?: number;
  readonly outputSummary?: string;
  readonly x?: number;
  readonly y?: number;
}

export interface CanvasCustomEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly isAnimated: boolean;
  readonly latencyMs?: number;
}
