/**
 * Domain types and contracts for Executive Summary & Task State Aggregation.
 * Conforms to:
 * - UC-11: Unified Conversation, Task State & Executive Summary Hub
 * - STD-COD-007: Clean Code & Immutability by Default
 */

export interface ExecutiveSummaryDigest {
  readonly summaryId: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly timeWindow: "IMMEDIATE_MILESTONE" | "DAILY_RECAP" | "WEEKLY_ROLLUP";
  readonly completedTasksCount: number;
  readonly failedTasksCount: number;
  readonly highLevelHighlights: ReadonlyArray<string>;
  readonly recommendedNextActions: ReadonlyArray<string>;
  readonly generatedTimestamp: Date;
}

export interface TaskEvent {
  readonly eventId?: string;
  readonly taskId: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly taskType: string;
  readonly status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "PAUSED";
  readonly executionOutputSummary?: string;
  readonly metadata?: Record<string, unknown>;
  readonly timestamp?: Date;
}

export interface TaskStateTransition {
  readonly taskId: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly fromStatus: string;
  readonly toStatus: string;
  readonly transitionTimestamp: Date;
  readonly metadata?: Record<string, unknown>;
}

export interface ITaskRepository {
  getRecentUnsummarizedEvents(tenantId: string, userId: string): Promise<ReadonlyArray<TaskEvent>>;
  markEventsSummarized?(eventIds: ReadonlyArray<string>): Promise<void>;
}

export interface ISummaryRepository {
  persist(digest: ExecutiveSummaryDigest): Promise<void>;
  findLatestSummary?(tenantId: string, userId: string): Promise<ExecutiveSummaryDigest | undefined>;
}

export interface IModelTextClient {
  generateText(prompt: string): Promise<{ text: string }>;
}
