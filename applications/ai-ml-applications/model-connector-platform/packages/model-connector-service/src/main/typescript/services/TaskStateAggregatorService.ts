import {
  type TaskEvent,
  type ExecutiveSummaryDigest,
  type ITaskRepository,
  type ISummaryRepository,
  type TaskExecutionEntity,
  randomUUID,
} from "@model-box/model-connector-core";

/**
 * Enterprise Task State Aggregator Service.
 * Conforms to:
 * - UC-11 §2.1 & §4.1: Task State Aggregation across Background Workers
 * - STD-COD-007: Immutability by Default
 */
export class TaskStateAggregatorService implements ITaskRepository, ISummaryRepository {
  private readonly events: TaskEvent[] = [];
  private readonly summaries: ExecutiveSummaryDigest[] = [];
  private readonly summarizedEventIds = new Set<string>();

  public async recordTaskTransition(
    taskId: string,
    tenantId: string,
    userId: string,
    taskType: string,
    status: TaskExecutionEntity["TASK_STATUS"],
    metadata?: Record<string, unknown>,
    executionOutputSummary?: string,
  ): Promise<TaskEvent> {
    const event: TaskEvent = Object.freeze({
      eventId: `EVT-${randomUUID()}`,
      taskId,
      tenantId,
      userId,
      taskType,
      status,
      metadata,
      executionOutputSummary,
      timestamp: new Date(),
    });

    this.events.push(event);
    return event;
  }

  public async getRecentUnsummarizedEvents(
    tenantId: string,
    userId: string,
  ): Promise<ReadonlyArray<TaskEvent>> {
    return Object.freeze(
      this.events.filter(
        (e) =>
          e.tenantId === tenantId &&
          e.userId === userId &&
          (!e.eventId || !this.summarizedEventIds.has(e.eventId)),
      ),
    );
  }

  public async markEventsSummarized(eventIds: ReadonlyArray<string>): Promise<void> {
    for (const id of eventIds) {
      this.summarizedEventIds.add(id);
    }
  }

  public async persist(digest: ExecutiveSummaryDigest): Promise<void> {
    this.summaries.push(digest);
  }

  public async findLatestSummary(
    tenantId: string,
    userId: string,
  ): Promise<ExecutiveSummaryDigest | undefined> {
    const matched = this.summaries.filter(
      (s) => s.tenantId === tenantId && s.userId === userId,
    );
    return matched.length > 0 ? matched[matched.length - 1] : undefined;
  }

  public getAllEvents(): ReadonlyArray<TaskEvent> {
    return Object.freeze([...this.events]);
  }
}

export const taskStateAggregator = new TaskStateAggregatorService();
