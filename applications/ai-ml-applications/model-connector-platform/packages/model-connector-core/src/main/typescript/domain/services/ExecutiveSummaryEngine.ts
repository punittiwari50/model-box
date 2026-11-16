import { cryptoUtils } from "@/utils/index.js";
import { ExecutiveSummaryTimeWindow, TaskExecutionStatus } from "@/constants/index.js";
import type {
  ExecutiveSummaryDigest,
  TaskEvent,
  ITaskRepository,
  ISummaryRepository,
  IModelTextClient,
} from "@/domain/models/executiveSummary.types.js";

const DIGEST_TIMEOUT_MS = 800;
const FALLBACK_DEFAULT_ACTION = "Inspect execution logs for flagged actions";

export class ExecutiveSummaryEngine {
  public constructor(
    private readonly taskRepo: ITaskRepository,
    private readonly summaryRepo: ISummaryRepository,
    private readonly modelClient: IModelTextClient,
    private readonly timeoutMs: number = DIGEST_TIMEOUT_MS,
  ) {}

  public async generateMilestoneDigest(
    tenantId: string,
    userId: string,
  ): Promise<ExecutiveSummaryDigest> {
    const events = await this.taskRepo.getRecentUnsummarizedEvents(tenantId, userId);
    try {
      const digest = await this.executeWithTimeout(
        () => this.synthesizeModelDigest(tenantId, userId, events),
        this.timeoutMs,
      );
      await this.summaryRepo.persist(digest);
      return digest;
    } catch {
      const fallback = this.synthesizeFallbackDigest(tenantId, userId, events);
      await this.summaryRepo.persist(fallback);
      return fallback;
    }
  }

  public synthesizeFallbackDigest(
    tenantId: string,
    userId: string,
    events: ReadonlyArray<TaskEvent>,
  ): ExecutiveSummaryDigest {
    const completed = events.filter((e) => e.status === TaskExecutionStatus.COMPLETED).length;
    const failed = events.filter((e) => e.status === TaskExecutionStatus.FAILED).length;
    return Object.freeze({
      summaryId: `SUM-FALLBACK-${cryptoUtils.randomUuid()}`,
      tenantId,
      userId,
      timeWindow: ExecutiveSummaryTimeWindow.IMMEDIATE_MILESTONE,
      completedTasksCount: completed,
      failedTasksCount: failed,
      highLevelHighlights: Object.freeze([
        `• Processed ${completed} automated tasks successfully`,
        `• Flagged ${failed} tasks requiring user attention`,
      ]),
      recommendedNextActions: Object.freeze([FALLBACK_DEFAULT_ACTION]),
      generatedTimestamp: new Date(),
    });
  }

  private async synthesizeModelDigest(
    tenantId: string,
    userId: string,
    events: ReadonlyArray<TaskEvent>,
  ): Promise<ExecutiveSummaryDigest> {
    const prompt = this.buildPrompt(events);
    const response = await this.modelClient.generateText(prompt);
    const highlights = this.extractHighlights(response.text);
    return Object.freeze({
      summaryId: `SUM-${cryptoUtils.randomUuid()}`,
      tenantId,
      userId,
      timeWindow: ExecutiveSummaryTimeWindow.IMMEDIATE_MILESTONE,
      completedTasksCount: events.filter((e) => e.status === TaskExecutionStatus.COMPLETED).length,
      failedTasksCount: events.filter((e) => e.status === TaskExecutionStatus.FAILED).length,
      highLevelHighlights: highlights,
      recommendedNextActions: Object.freeze(["Review scheduled follow-up actions"]),
      generatedTimestamp: new Date(),
    });
  }

  private buildPrompt(events: ReadonlyArray<TaskEvent>): string {
    const eventSummary = JSON.stringify(events);
    return `Summarize technical task executions into 3 concise bulleted achievements:\n${eventSummary}`;
  }

  private extractHighlights(rawText: string): ReadonlyArray<string> {
    const bullets = rawText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("•") || line.startsWith("-"));
    return bullets.length > 0
      ? Object.freeze(bullets)
      : Object.freeze(["• Completed scheduled workflow tasks successfully"]);
  }

  private async executeWithTimeout<T>(operation: () => Promise<T>, limitMs: number): Promise<T> {
    let timerId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timerId = setTimeout(() => reject(new Error("Digest synthesis SLA exceeded")), limitMs);
    });
    try {
      return await Promise.race([operation(), timeoutPromise]);
    } finally {
      if (timerId !== undefined) {
        clearTimeout(timerId);
      }
    }
  }
}
